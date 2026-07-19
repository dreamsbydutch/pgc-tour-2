import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { fetchWithRetry } from "../utils/externalFetch";
import {
  findEspnGolferMatch,
  mergeEspnRounds,
  parseEspnGolfScoreboard,
  selectEspnGolfEvent,
} from "../utils/espnGolf";

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

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

const eventCandidateValidator = v.object({
  espnId: v.string(),
  espnName: v.string(),
});

function formatEspnDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10).replace(/-/g, "");
}

/** Lazily reads one scorecard directly from the tournament-golfer record. */
export const getPlayerHoleScorecard = query({
  args: {
    tournamentId: v.id("tournaments"),
    golferId: v.id("golfers"),
  },
  handler: async (ctx, args) => {
    const tournamentGolfer = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_golfer_tournament", (q) =>
        q.eq("golferId", args.golferId).eq("tournamentId", args.tournamentId),
      )
      .first();
    return tournamentGolfer?.espnRounds
      ? { golferId: args.golferId, rounds: tournamentGolfer.espnRounds }
      : null;
  },
});

/** Returns a team only when all ten ESPN identities were confirmed. */
export const getTeamHoleScorecards = query({
  args: {
    tournamentId: v.id("tournaments"),
    golferIds: v.array(v.id("golfers")),
  },
  handler: async (ctx, args) => {
    const uniqueGolferIds = [...new Set(args.golferIds)].slice(0, 10);
    if (uniqueGolferIds.length !== 10) return null;
    const tournamentGolfers = await Promise.all(
      uniqueGolferIds.map((golferId) =>
        ctx.db
          .query("tournamentGolfers")
          .withIndex("by_golfer_tournament", (q) =>
            q.eq("golferId", golferId).eq("tournamentId", args.tournamentId),
          )
          .first(),
      ),
    );
    if (
      tournamentGolfers.some(
        (tournamentGolfer) => !Array.isArray(tournamentGolfer?.espnRounds),
      )
    ) {
      return null;
    }
    return tournamentGolfers.map((tournamentGolfer, index) => ({
      golferId: uniqueGolferIds[index]!,
      rounds: tournamentGolfer!.espnRounds!,
    }));
  },
});

export const getTournamentSyncContext = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) return null;
    const auditRows = await ctx.db
      .query("espnIdentityAudit")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();
    const manualAudit = auditRows.find(
      (row) =>
        row.entityType === "tournament" &&
        row.status !== "resolved" &&
        row.espnId,
    );
    return {
      tournamentId: tournament._id,
      tournamentName: tournament.name,
      startDate: tournament.startDate,
      espnId: tournament.espnId ?? manualAudit?.espnId,
    };
  },
});

export const recordEventSyncFailure = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    status: v.union(v.literal("unmatched"), v.literal("error")),
    error: v.string(),
    candidates: v.array(eventCandidateValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("espnIdentityAudit")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
    const existing = rows.find((row) => row.entityType === "tournament");
    const value = {
      entityType: "tournament" as const,
      status: args.status,
      tournamentId: args.tournamentId,
      candidateEspnIds: args.candidates.map((candidate) => candidate.espnId),
      candidateNames: args.candidates.map((candidate) => candidate.espnName),
      reason: args.error.slice(0, 1_000),
      lastSeenAt: now,
    };
    if (existing) await ctx.db.patch(existing._id, value);
    else
      await ctx.db.insert("espnIdentityAudit", {
        ...value,
        firstSeenAt: now,
      });
  },
});

export const applyScorecardChunk = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
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
    const golferAudits = (
      await ctx.db.query("espnIdentityAudit").collect()
    ).filter(
      (row) =>
        row.entityType === "golfer" &&
        row.status !== "resolved" &&
        row.espnId &&
        row.golferId,
    );
    const identityMappings = [
      ...localGolfers.flatMap((golfer) =>
        golfer.espnId
          ? [{ golferId: String(golfer._id), espnAthleteId: golfer.espnId }]
          : [],
      ),
      ...golferAudits.map((row) => ({
        golferId: String(row.golferId!),
        espnAthleteId: row.espnId!,
      })),
    ];
    const localIdentityGolfers = localGolfers.map((golfer) => ({
      golferId: String(golfer._id),
      playerName: golfer.playerName,
    }));
    const tournamentGolferByGolferId = new Map(
      tournamentGolfers.map((row) => [row.golferId, row]),
    );
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
      const existingAudit = await ctx.db
        .query("espnIdentityAudit")
        .withIndex("by_entity_espn_id", (q) =>
          q.eq("entityType", "golfer").eq("espnId", player.espnAthleteId),
        )
        .first();

      if (!golfer) {
        unmatched += 1;
        const auditValue = {
          entityType: "golfer" as const,
          status: "unmatched" as const,
          espnId: player.espnAthleteId,
          espnName: player.playerName,
          tournamentId: args.tournamentId,
          reason: "No unique Data Golf golfer match was found.",
          lastSeenAt: args.fetchedAt,
        };
        if (existingAudit) await ctx.db.patch(existingAudit._id, auditValue);
        else
          await ctx.db.insert("espnIdentityAudit", {
            ...auditValue,
            firstSeenAt: args.fetchedAt,
          });
        continue;
      }

      matched += 1;
      if (golfer.espnId !== player.espnAthleteId) {
        await ctx.db.patch(golfer._id, {
          espnId: player.espnAthleteId,
          updatedAt: args.fetchedAt,
        });
      }
      if (existingAudit) {
        await ctx.db.patch(existingAudit._id, {
          status: "resolved",
          golferId: golfer._id,
          resolvedAt: args.fetchedAt,
          lastSeenAt: args.fetchedAt,
          reason: undefined,
        });
      }

      const tournamentGolfer = tournamentGolferByGolferId.get(golfer._id);
      if (!tournamentGolfer) continue;
      await ctx.db.patch(tournamentGolfer._id, {
        espnRounds: mergeEspnRounds(
          tournamentGolfer.espnRounds ?? [],
          player.rounds,
        ),
        espnScorecardUpdatedAt: args.fetchedAt,
      });
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
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tournamentId, {
      espnId: args.espnEventId,
      updatedAt: args.fetchedAt,
    });
    const tournamentAudits = await ctx.db
      .query("espnIdentityAudit")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
    for (const audit of tournamentAudits.filter(
      (row) => row.entityType === "tournament",
    )) {
      await ctx.db.patch(audit._id, {
        status: "resolved",
        espnId: args.espnEventId,
        espnName: args.espnEventName,
        resolvedAt: args.fetchedAt,
        lastSeenAt: args.fetchedAt,
        reason: undefined,
      });
    }

    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
    for (const tournamentGolfer of tournamentGolfers) {
      if (Array.isArray(tournamentGolfer.espnRounds)) continue;
      const golfer = await ctx.db.get(tournamentGolfer.golferId);
      if (!golfer) continue;
      const golferAuditRows = await ctx.db
        .query("espnIdentityAudit")
        .withIndex("by_golfer", (q) => q.eq("golferId", golfer._id))
        .collect();
      const existing = golferAuditRows.find(
        (row) => row.entityType === "golfer" && row.status !== "resolved",
      );
      const value = {
        entityType: "golfer" as const,
        status: "unmatched" as const,
        golferId: golfer._id,
        espnName: golfer.playerName,
        tournamentId: args.tournamentId,
        reason: "Data Golf golfer was not present in the matched ESPN field.",
        lastSeenAt: args.fetchedAt,
      };
      if (existing) await ctx.db.patch(existing._id, value);
      else
        await ctx.db.insert("espnIdentityAudit", {
          ...value,
          firstSeenAt: args.fetchedAt,
        });
    }
  },
});

/** Fetches and applies one tournament without touching Data Golf scoring fields. */
export const syncTournamentScorecards: ReturnType<typeof internalAction> =
  internalAction({
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
        const events = parseEspnGolfScoreboard(result.data);
        const event = syncContext.espnId
          ? events.find(
              (candidate) => candidate.espnEventId === syncContext.espnId,
            )
          : selectEspnGolfEvent(events, syncContext.tournamentName);
        if (!event) {
          await ctx.runMutation(
            internal.functions.espnGolf.recordEventSyncFailure,
            {
              tournamentId: args.tournamentId,
              status: "unmatched",
              error: syncContext.espnId
                ? `Saved ESPN event ${syncContext.espnId} was not present for this date.`
                : "No unique compatible ESPN event was found for this date.",
              candidates: events.map((candidate) => ({
                espnId: candidate.espnEventId,
                espnName: candidate.eventName,
              })),
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
            candidates: [],
          },
        );
        return { ok: false, skipped: false, error: message };
      }
    },
  });
