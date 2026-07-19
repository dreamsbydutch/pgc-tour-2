import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { fetchWithRetry } from "../utils/externalFetch";
import {
  findEspnGolferMatch,
  mergeEspnRounds,
  parseEspnGolfScoreboard,
  selectEspnGolfEvent,
} from "../utils/espnGolf";

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const BACKFILL_BATCH_SIZE = 5;
const BACKFILL_BATCH_DELAY_MS = 60_000;
const RECENT_COMPLETED_WINDOW_MS = 24 * 60 * 60 * 1_000;

const holeValidator = v.object({
  hole: v.number(),
  strokes: v.number(),
  relativeToPar: v.number(),
});

const roundValidator = v.object({
  round: v.number(),
  totalStrokes: v.optional(v.number()),
  holes: v.array(holeValidator),
});

const playerScorecardValidator = v.object({
  espnAthleteId: v.string(),
  playerName: v.string(),
  rounds: v.array(roundValidator),
});

function formatEspnDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10).replace(/-/g, "");
}

/** Returns only the isolated, last-known-good scorecard for an opened row. */
export const getPlayerHoleScorecard = query({
  args: {
    tournamentId: v.id("tournaments"),
    golferId: v.id("golfers"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("espnHoleScorecards")
      .withIndex("by_tournament_golfer", (q) =>
        q.eq("tournamentId", args.tournamentId).eq("golferId", args.golferId),
      )
      .first();
  },
});

/** Lazily returns the isolated ESPN scorecards needed for one opened team. */
export const getTeamHoleScorecards = query({
  args: {
    tournamentId: v.id("tournaments"),
    golferIds: v.array(v.id("golfers")),
  },
  handler: async (ctx, args) => {
    const uniqueGolferIds = [...new Set(args.golferIds)].slice(0, 10);
    if (uniqueGolferIds.length !== 10) return null;
    const scorecards = await Promise.all(
      uniqueGolferIds.map((golferId) =>
        ctx.db
          .query("espnHoleScorecards")
          .withIndex("by_tournament_golfer", (q) =>
            q.eq("tournamentId", args.tournamentId).eq("golferId", golferId),
          )
          .first(),
      ),
    );
    const available = scorecards.filter((scorecard) => scorecard !== null);
    return available.length === uniqueGolferIds.length ? available : null;
  },
});

export const getTournamentSyncContext = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) return null;
    return {
      tournamentId: tournament._id,
      tournamentName: tournament.name,
      startDate: tournament.startDate,
    };
  },
});

export const getLiveSyncTournamentIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const tournaments = await ctx.db.query("tournaments").collect();
    return tournaments
      .filter(
        (tournament) =>
          tournament.status === "active" ||
          (tournament.startDate <= now && tournament.endDate >= now) ||
          (tournament.status === "completed" &&
            now - tournament.endDate <= RECENT_COMPLETED_WINDOW_MS),
      )
      .map((tournament) => tournament._id);
  },
});

export const getBackfillTournamentBatch = internalQuery({
  args: { offset: v.number() },
  handler: async (ctx, args) => {
    const tournaments = await ctx.db.query("tournaments").collect();
    const sorted = tournaments.sort((a, b) => b.startDate - a.startDate);
    return {
      tournamentIds: sorted
        .slice(args.offset, args.offset + BACKFILL_BATCH_SIZE)
        .map((tournament) => tournament._id),
      hasMore: args.offset + BACKFILL_BATCH_SIZE < sorted.length,
      nextOffset: args.offset + BACKFILL_BATCH_SIZE,
      total: sorted.length,
    };
  },
});

export const isAdminIdentity = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    return member?.role === "admin";
  },
});

export const recordEventSyncFailure = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    status: v.union(v.literal("not_found"), v.literal("error")),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("espnGolfEvents")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .first();
    const value = {
      tournamentId: args.tournamentId,
      syncStatus: args.status,
      lastAttemptAt: now,
      lastError: args.error.slice(0, 1_000),
      updatedAt: now,
    } as const;
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("espnGolfEvents", value);
  },
});

export const applyScorecardChunk = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    espnEventId: v.string(),
    players: v.array(playerScorecardValidator),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
    const golferDocs = await Promise.all(
      tournamentGolfers.map((entry) => ctx.db.get(entry.golferId)),
    );
    const localGolfers = golferDocs.filter(
      (golfer): golfer is Doc<"golfers"> => golfer !== null,
    );
    const mappings = await ctx.db.query("espnGolferMappings").collect();
    const mappingByEspnId = new Map(
      mappings.map((mapping) => [mapping.espnAthleteId, mapping]),
    );
    const mappingByGolferId = new Map(
      mappings.map((mapping) => [mapping.golferId, mapping]),
    );
    const localIdentityGolfers = localGolfers.map((candidate) => ({
      golferId: String(candidate._id),
      playerName: candidate.playerName,
    }));
    const identityMappings = mappings.map((mapping) => ({
      golferId: String(mapping.golferId),
      espnAthleteId: mapping.espnAthleteId,
    }));
    let matched = 0;
    let unmatched = 0;
    let scorecardsUpdated = 0;

    for (const player of args.players) {
      const match = findEspnGolferMatch({
        espnAthleteId: player.espnAthleteId,
        playerName: player.playerName,
        localGolfers: localIdentityGolfers,
        mappings: identityMappings,
      });
      const golfer = match
        ? localGolfers.find(
            (candidate) => String(candidate._id) === match.golferId,
          )
        : undefined;
      if (golfer && match && match.matchMethod !== "saved") {
        const candidateMapping = mappingByGolferId.get(golfer._id);
        if (!candidateMapping) {
          const mappingId = await ctx.db.insert("espnGolferMappings", {
            golferId: golfer._id,
            espnAthleteId: player.espnAthleteId,
            espnPlayerName: player.playerName,
            matchMethod: match.matchMethod,
            updatedAt: args.fetchedAt,
          });
          const inserted = await ctx.db.get(mappingId);
          if (inserted) {
            mappingByEspnId.set(player.espnAthleteId, inserted);
            mappingByGolferId.set(golfer._id, inserted);
            identityMappings.push({
              golferId: String(golfer._id),
              espnAthleteId: player.espnAthleteId,
            });
          }
        }
      }

      if (!golfer) {
        unmatched += 1;
        continue;
      }
      matched += 1;

      const existingScorecard = await ctx.db
        .query("espnHoleScorecards")
        .withIndex("by_tournament_golfer", (q) =>
          q.eq("tournamentId", args.tournamentId).eq("golferId", golfer!._id),
        )
        .first();
      const rounds = mergeEspnRounds(
        existingScorecard?.rounds ?? [],
        player.rounds,
      );
      const scorecard = {
        tournamentId: args.tournamentId,
        golferId: golfer._id,
        espnEventId: args.espnEventId,
        espnAthleteId: player.espnAthleteId,
        rounds,
        sourceUpdatedAt: args.fetchedAt,
        updatedAt: args.fetchedAt,
      };
      if (existingScorecard) {
        await ctx.db.patch(existingScorecard._id, scorecard);
      } else {
        await ctx.db.insert("espnHoleScorecards", scorecard);
      }
      scorecardsUpdated += 1;
    }

    return { matched, unmatched, scorecardsUpdated };
  },
});

export const recordEventSyncSuccess = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    espnEventId: v.string(),
    espnEventName: v.string(),
    unmatchedPlayers: v.number(),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
    const scorecards = await ctx.db
      .query("espnHoleScorecards")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
    const covered = new Set(scorecards.map((scorecard) => scorecard.golferId));
    const missingGolferIds = [
      ...new Set(
        tournamentGolfers
          .map((golfer) => golfer.golferId)
          .filter((golferId) => !covered.has(golferId)),
      ),
    ];
    const missingGolfers = await Promise.all(
      missingGolferIds.map((golferId) => ctx.db.get(golferId)),
    );
    const missingPlayerNames = missingGolfers.flatMap((golfer) =>
      golfer ? [golfer.playerName] : [],
    );
    if (missingPlayerNames.length > 0) {
      console.warn("ESPN Golf Scorecards: unmatched Data Golf golfers", {
        tournamentId: args.tournamentId,
        eventName: args.espnEventName,
        missingPlayerNames,
      });
    }
    const existing = await ctx.db
      .query("espnGolfEvents")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .first();
    const value = {
      tournamentId: args.tournamentId,
      espnEventId: args.espnEventId,
      espnEventName: args.espnEventName,
      syncStatus: "success" as const,
      lastAttemptAt: args.fetchedAt,
      lastSuccessAt: args.fetchedAt,
      lastError: undefined,
      unmatchedPlayers: args.unmatchedPlayers,
      missingPlayerNames,
      updatedAt: args.fetchedAt,
    };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("espnGolfEvents", value);
  },
});

/** Fetches and applies one tournament without touching DataGolf-backed tables. */
export const syncTournamentScorecards = internalAction({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const syncContext = await ctx.runQuery(
      internal.functions.espnGolf.getTournamentSyncContext,
      args,
    );
    if (!syncContext) return { ok: true, skipped: true, reason: "not_found" };

    const fetchedAt = Date.now();
    try {
      const result = await fetchWithRetry<unknown>(
        `${ESPN_SCOREBOARD_URL}?dates=${formatEspnDate(syncContext.startDate)}`,
        { headers: { Accept: "application/json" } },
        {
          timeout: 20_000,
          retries: 2,
          retryDelay: 1_000,
          logPrefix: "ESPN Golf Scorecards",
          validateResponse: (payload) =>
            payload !== null &&
            typeof payload === "object" &&
            Array.isArray((payload as { events?: unknown }).events),
        },
      );
      if (!result.ok) throw new Error(result.error);
      const event = selectEspnGolfEvent(
        parseEspnGolfScoreboard(result.data),
        syncContext.tournamentName,
      );
      if (!event) {
        await ctx.runMutation(
          internal.functions.espnGolf.recordEventSyncFailure,
          {
            tournamentId: args.tournamentId,
            status: "not_found",
            error: "No unique compatible ESPN event was found for this date.",
          },
        );
        return { ok: true, skipped: true, reason: "event_not_found" };
      }

      let matched = 0;
      let unmatched = 0;
      let scorecardsUpdated = 0;
      for (let index = 0; index < event.players.length; index += 50) {
        const summary = await ctx.runMutation(
          internal.functions.espnGolf.applyScorecardChunk,
          {
            tournamentId: args.tournamentId,
            espnEventId: event.espnEventId,
            players: event.players.slice(index, index + 50),
            fetchedAt,
          },
        );
        matched += summary.matched;
        unmatched += summary.unmatched;
        scorecardsUpdated += summary.scorecardsUpdated;
      }
      await ctx.runMutation(
        internal.functions.espnGolf.recordEventSyncSuccess,
        {
          tournamentId: args.tournamentId,
          espnEventId: event.espnEventId,
          espnEventName: event.eventName,
          unmatchedPlayers: unmatched,
          fetchedAt,
        },
      );
      return {
        ok: true,
        skipped: false,
        eventName: event.eventName,
        matched,
        unmatched,
        scorecardsUpdated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(
        internal.functions.espnGolf.recordEventSyncFailure,
        {
          tournamentId: args.tournamentId,
          status: "error",
          error: message,
        },
      );
      return { ok: false, skipped: false, error: message };
    }
  },
});

export const syncLiveScorecards: ReturnType<typeof internalAction> =
  internalAction({
    args: {},
    handler: async (ctx) => {
      const tournamentIds = await ctx.runQuery(
        internal.functions.espnGolf.getLiveSyncTournamentIds,
        {},
      );
      const results = [];
      for (const tournamentId of tournamentIds) {
        results.push(
          await ctx.runAction(
            internal.functions.espnGolf.syncTournamentScorecards,
            { tournamentId },
          ),
        );
      }
      return { tournamentsProcessed: tournamentIds.length, results };
    },
  });

export const runBackfillBatch: ReturnType<typeof internalAction> =
  internalAction({
    args: { offset: v.number() },
    handler: async (ctx, args) => {
      const batch = await ctx.runQuery(
        internal.functions.espnGolf.getBackfillTournamentBatch,
        args,
      );
      for (const tournamentId of batch.tournamentIds) {
        await ctx.runAction(
          internal.functions.espnGolf.syncTournamentScorecards,
          { tournamentId },
        );
      }
      if (batch.hasMore) {
        await ctx.scheduler.runAfter(
          BACKFILL_BATCH_DELAY_MS,
          internal.functions.espnGolf.runBackfillBatch,
          { offset: batch.nextOffset },
        );
      }
      return {
        processed: batch.tournamentIds.length,
        nextOffset: batch.hasMore ? batch.nextOffset : null,
        total: batch.total,
      };
    },
  });

/** Admin-triggered, idempotent entry point for the all-tournament backfill. */
export const startScorecardBackfill: ReturnType<typeof action> = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const isAdmin = identity
      ? await ctx.runQuery(internal.functions.espnGolf.isAdminIdentity, {
          clerkId: identity.subject,
        })
      : false;
    if (!isAdmin) throw new Error("Administrator access is required.");
    const scheduledId = await ctx.scheduler.runAfter(
      0,
      internal.functions.espnGolf.runBackfillBatch,
      { offset: 0 },
    );
    return { ok: true, scheduledId };
  },
});

/** Admin convenience action for validating a single tournament. */
export const syncTournamentScorecardsNow: ReturnType<typeof action> = action({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const isAdmin = identity
      ? await ctx.runQuery(internal.functions.espnGolf.isAdminIdentity, {
          clerkId: identity.subject,
        })
      : false;
    if (!isAdmin) throw new Error("Administrator access is required.");
    return await ctx.runAction(
      internal.functions.espnGolf.syncTournamentScorecards,
      args,
    );
  },
});

export type EspnTournamentId = Id<"tournaments">;
