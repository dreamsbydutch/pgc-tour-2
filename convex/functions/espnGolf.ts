import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { Id } from "../_generated/dataModel";
import { fetchWithRetry } from "../utils/externalFetch";
import {
  areEspnRoundsEqual,
  completeWithdrawnEspnRounds,
  findEspnGolferMatch,
  inferEspnRoundHolePars,
  mergeEspnRounds,
  normalizeEspnRounds,
  parseEspnGolfScoreboard,
  selectEspnGolfEvent,
} from "../utils/espnGolf";
import { requireAdmin } from "../utils/auth";

// ESPN's site.api host rejects Convex runtime traffic at its edge.
const ESPN_SCOREBOARD_URL =
  "https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

const holeValidator = v.object({
  hole: v.number(),
  strokes: v.number(),
  relativeToPar: v.number(),
  synthetic: v.optional(v.boolean()),
});

const roundValidator = v.object({
  round: v.number(),
  totalStrokes: v.optional(v.number()),
  holes: v.array(holeValidator),
});

const playerIdentityDeltaValidator = v.object({
  espnAthleteId: v.string(),
  playerName: v.string(),
  golferId: v.optional(v.id("golfers")),
  auditId: v.optional(v.id("espnIdentityAudit")),
  updateGolferIdentity: v.optional(v.boolean()),
});

const scorecardDeltaValidator = v.object({
  golferId: v.id("golfers"),
  rounds: v.array(roundValidator),
});

const eventCandidateValidator = v.object({
  espnId: v.string(),
  espnName: v.string(),
});

function formatEspnDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10).replace(/-/g, "");
}

async function getStoredScorecard(
  ctx: QueryCtx | MutationCtx,
  tournamentId: Id<"tournaments">,
  golferId: Id<"golfers">,
) {
  return await ctx.db
    .query("tournamentGolferScorecards")
    .withIndex("by_golfer_tournament", (q) =>
      q.eq("golferId", golferId).eq("tournamentId", tournamentId),
    )
    .unique();
}

async function upsertStoredScorecard(
  ctx: MutationCtx,
  args: {
    tournamentId: Id<"tournaments">;
    golferId: Id<"golfers">;
    rounds: Doc<"tournamentGolferScorecards">["rounds"];
    updatedAt: number;
  },
) {
  const existing = await getStoredScorecard(
    ctx,
    args.tournamentId,
    args.golferId,
  );
  const normalizedRounds = normalizeEspnRounds(args.rounds);
  if (existing) {
    if (areEspnRoundsEqual(existing.rounds, normalizedRounds)) {
      return { scorecardId: existing._id, changed: false };
    }
    await ctx.db.patch(existing._id, {
      rounds: normalizedRounds,
      updatedAt: args.updatedAt,
    });
    return { scorecardId: existing._id, changed: true };
  }
  const scorecardId = await ctx.db.insert("tournamentGolferScorecards", {
    ...args,
    rounds: normalizedRounds,
  });
  return { scorecardId, changed: true };
}

/** Lazily reads one scorecard with a legacy fallback during migration. */
export const getPlayerHoleScorecard = query({
  args: {
    tournamentId: v.id("tournaments"),
    golferId: v.id("golfers"),
  },
  handler: async (ctx, args) => {
    const stored = await getStoredScorecard(
      ctx,
      args.tournamentId,
      args.golferId,
    );
    if (stored) return { golferId: args.golferId, rounds: stored.rounds };
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

/** Returns a team only when all ten scorecard identities are available. */
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
    const storedScorecards = await Promise.all(
      uniqueGolferIds.map((golferId) =>
        getStoredScorecard(ctx, args.tournamentId, golferId),
      ),
    );
    const roundsByIndex = tournamentGolfers.map(
      (tournamentGolfer, index) =>
        storedScorecards[index]?.rounds ?? tournamentGolfer?.espnRounds,
    );
    if (roundsByIndex.some((rounds) => !Array.isArray(rounds))) {
      return null;
    }
    const tournament = await ctx.db.get(args.tournamentId);
    const course = tournament ? await ctx.db.get(tournament.courseId) : null;
    if (
      course &&
      tournamentGolfers.some((golfer, golferIndex) => {
        const position = golfer?.position?.trim().toUpperCase();
        if (position !== "WD" && position !== "DQ") return false;
        return [golfer?.roundOne, golfer?.roundTwo].some(
          (score, index) =>
            score === course.par + 8 &&
            roundsByIndex[golferIndex]?.find(
              (round) => round.round === index + 1,
            )?.holes.length !== 18,
        );
      })
    ) {
      return null;
    }
    return uniqueGolferIds.map((golferId, index) => ({
      golferId,
      rounds: roundsByIndex[index]!,
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
      .take(20);
    const manualAudit = auditRows.find(
      (row) =>
        row.entityType === "tournament" &&
        row.status !== "resolved" &&
        row.espnId,
    );

    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .take(500);
    const [golferDocs, storedScorecards, golferAuditRows] = await Promise.all([
      Promise.all(tournamentGolfers.map((entry) => ctx.db.get(entry.golferId))),
      ctx.db
        .query("tournamentGolferScorecards")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .take(500),
      ctx.db.query("espnIdentityAudit").take(500),
    ]);
    const storedByGolferId = new Map(
      storedScorecards.map((scorecard) => [scorecard.golferId, scorecard]),
    );
    return {
      tournamentId: tournament._id,
      tournamentName: tournament.name,
      startDate: tournament.startDate,
      espnId: tournament.espnId ?? manualAudit?.espnId,
      golfers: tournamentGolfers.flatMap((entry, index) => {
        const golfer = golferDocs[index];
        if (!golfer) return [];
        return [
          {
            golferId: golfer._id,
            playerName: golfer.playerName,
            espnId: golfer.espnId,
            rounds:
              storedByGolferId.get(golfer._id)?.rounds ??
              entry.espnRounds ??
              [],
          },
        ];
      }),
      golferAudits: golferAuditRows.flatMap((row) =>
        row.entityType === "golfer" && row.espnId
          ? [
              {
                auditId: row._id,
                status: row.status,
                espnId: row.espnId,
                golferId: row.golferId,
              },
            ]
          : [],
      ),
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
      .take(20);
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
    players: v.array(playerIdentityDeltaValidator),
    scorecards: v.array(scorecardDeltaValidator),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    let matched = 0;
    let unmatched = 0;
    let scorecardsUpdated = 0;

    for (const player of args.players) {
      if (!player.golferId) {
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
        if (player.auditId) await ctx.db.patch(player.auditId, auditValue);
        else
          await ctx.db.insert("espnIdentityAudit", {
            ...auditValue,
            firstSeenAt: args.fetchedAt,
          });
        continue;
      }

      matched += 1;
      if (player.updateGolferIdentity) {
        await ctx.db.patch(player.golferId, {
          espnId: player.espnAthleteId,
          updatedAt: args.fetchedAt,
        });
      }
      if (player.auditId) {
        await ctx.db.patch(player.auditId, {
          status: "resolved",
          golferId: player.golferId,
          resolvedAt: args.fetchedAt,
          lastSeenAt: args.fetchedAt,
          reason: undefined,
        });
      }
    }

    for (const scorecard of args.scorecards) {
      const result = await upsertStoredScorecard(ctx, {
        tournamentId: args.tournamentId,
        golferId: scorecard.golferId,
        rounds: scorecard.rounds,
        updatedAt: args.fetchedAt,
      });
      if (result.changed) scorecardsUpdated += 1;
    }

    return { matched, unmatched, scorecardsUpdated };
  },
});

/** Persists exact eight-over hole rows for published, unfinished WD/DQ rounds. */
export const completeWithdrawnScorecards = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) return { scorecardsUpdated: 0, roundsCompleted: 0 };
    const course = await ctx.db.get(tournament.courseId);
    if (!course) return { scorecardsUpdated: 0, roundsCompleted: 0 };
    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .take(500);
    const storedScorecards = await Promise.all(
      tournamentGolfers.map((golfer) =>
        getStoredScorecard(ctx, args.tournamentId, golfer.golferId),
      ),
    );
    const scorecards = tournamentGolfers.flatMap((golfer, index) =>
      Array.isArray(storedScorecards[index]?.rounds ?? golfer.espnRounds)
        ? [storedScorecards[index]?.rounds ?? golfer.espnRounds!]
        : [],
    );
    const holeParsByRound = new Map<number, number[]>();
    for (const roundNumber of [1, 2]) {
      const holePars = inferEspnRoundHolePars({
        scorecards,
        roundNumber,
        frontPar: course.front,
        backPar: course.back,
      });
      if (holePars) holeParsByRound.set(roundNumber, holePars);
    }

    let scorecardsUpdated = 0;
    let roundsCompleted = 0;
    for (const [index, golfer] of tournamentGolfers.entries()) {
      const completed = completeWithdrawnEspnRounds({
        existing: storedScorecards[index]?.rounds ?? golfer.espnRounds ?? [],
        position: golfer.position,
        roundScores: [golfer.roundOne, golfer.roundTwo],
        coursePar: course.par,
        holeParsByRound,
      });
      if (completed.completedPenaltyRounds.length === 0) continue;
      await upsertStoredScorecard(ctx, {
        tournamentId: args.tournamentId,
        golferId: golfer.golferId,
        rounds: completed.rounds,
        updatedAt: args.fetchedAt,
      });
      scorecardsUpdated += 1;
      roundsCompleted += completed.completedPenaltyRounds.length;
    }
    return { scorecardsUpdated, roundsCompleted };
  },
});

export const recordEventSyncSuccess = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    espnEventId: v.string(),
    espnEventName: v.string(),
    matchedGolferIds: v.array(v.id("golfers")),
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
      .take(20);
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
      .take(500);
    const matchedGolferIds = new Set(args.matchedGolferIds);
    for (const tournamentGolfer of tournamentGolfers) {
      if (matchedGolferIds.has(tournamentGolfer.golferId)) continue;
      const storedScorecard = await getStoredScorecard(
        ctx,
        args.tournamentId,
        tournamentGolfer.golferId,
      );
      if (storedScorecard || Array.isArray(tournamentGolfer.espnRounds))
        continue;
      const golfer = await ctx.db.get(tournamentGolfer.golferId);
      if (!golfer) continue;
      const golferAuditRows = await ctx.db
        .query("espnIdentityAudit")
        .withIndex("by_golfer", (q) => q.eq("golferId", golfer._id))
        .take(20);
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

const paginatedScorecardMigrationArgs = {
  cursor: v.optional(v.union(v.string(), v.null())),
  limit: v.optional(v.number()),
};

async function migrateLegacyScorecardsPage(
  ctx: MutationCtx,
  args: { cursor?: string | null; limit?: number },
) {
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 250);
  const page = await ctx.db.query("tournamentGolfers").paginate({
    cursor: args.cursor ?? null,
    numItems: limit,
    maximumRowsRead: limit,
    maximumBytesRead: 2_000_000,
  });
  let changed = 0;
  for (const golfer of page.page) {
    if (!Array.isArray(golfer.espnRounds)) continue;
    const existing = await getStoredScorecard(
      ctx,
      golfer.tournamentId,
      golfer.golferId,
    );
    if (existing) continue;
    await ctx.db.insert("tournamentGolferScorecards", {
      tournamentId: golfer.tournamentId,
      golferId: golfer.golferId,
      rounds: golfer.espnRounds,
      updatedAt:
        golfer.espnScorecardUpdatedAt ?? golfer.updatedAt ?? Date.now(),
    });
    changed += 1;
  }
  return {
    processed: page.page.length,
    changed,
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  };
}

export const adminMigrateLegacyScorecards = mutation({
  args: paginatedScorecardMigrationArgs,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await migrateLegacyScorecardsPage(ctx, args);
  },
});

/** Deployment-credential entry point for release-time scorecard migration. */
export const migrateLegacyScorecardsPageInternal = internalMutation({
  args: paginatedScorecardMigrationArgs,
  handler: migrateLegacyScorecardsPage,
});

async function clearMigratedLegacyScorecardsPage(
  ctx: MutationCtx,
  args: { cursor?: string | null; limit?: number },
) {
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 250);
  const page = await ctx.db.query("tournamentGolfers").paginate({
    cursor: args.cursor ?? null,
    numItems: limit,
    maximumRowsRead: limit,
    maximumBytesRead: 2_000_000,
  });
  let changed = 0;
  for (const golfer of page.page) {
    if (!Array.isArray(golfer.espnRounds)) continue;
    const stored = await getStoredScorecard(
      ctx,
      golfer.tournamentId,
      golfer.golferId,
    );
    if (!stored) continue;
    await ctx.db.patch(golfer._id, {
      espnRounds: undefined,
      espnScorecardUpdatedAt: undefined,
    });
    changed += 1;
  }
  return {
    processed: page.page.length,
    changed,
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  };
}

export const adminClearMigratedLegacyScorecards = mutation({
  args: paginatedScorecardMigrationArgs,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await clearMigratedLegacyScorecardsPage(ctx, args);
  },
});

/** Clears legacy scorecards only after their normalized rows exist. */
export const clearMigratedLegacyScorecardsPageInternal = internalMutation({
  args: paginatedScorecardMigrationArgs,
  handler: clearMigratedLegacyScorecardsPage,
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
        const matchedGolferIds = new Set<Id<"golfers">>();
        const localGolfers = syncContext.golfers.map((golfer) => ({
          golferId: String(golfer.golferId),
          playerName: golfer.playerName,
        }));
        const identityMappings = [
          ...syncContext.golfers.flatMap((golfer) =>
            golfer.espnId
              ? [
                  {
                    golferId: String(golfer.golferId),
                    espnAthleteId: golfer.espnId,
                  },
                ]
              : [],
          ),
          ...syncContext.golferAudits.flatMap((audit) =>
            audit.status !== "resolved" && audit.golferId
              ? [
                  {
                    golferId: String(audit.golferId),
                    espnAthleteId: audit.espnId,
                  },
                ]
              : [],
          ),
        ];
        const golferById = new Map(
          syncContext.golfers.map((golfer) => [
            String(golfer.golferId),
            golfer,
          ]),
        );
        const auditByEspnId = new Map(
          syncContext.golferAudits.map((audit) => [audit.espnId, audit]),
        );
        const playerDeltas = event.players.map((player) => {
          const match = findEspnGolferMatch({
            espnAthleteId: player.espnAthleteId,
            playerName: player.playerName,
            localGolfers,
            mappings: identityMappings,
          });
          const golfer = match ? golferById.get(match.golferId) : undefined;
          const audit = auditByEspnId.get(player.espnAthleteId);
          if (!golfer) {
            unmatched += 1;
            return {
              identity: {
                espnAthleteId: player.espnAthleteId,
                playerName: player.playerName,
                auditId: audit?.auditId,
              },
            };
          }

          matched += 1;
          matchedGolferIds.add(golfer.golferId);
          const mergedRounds = mergeEspnRounds(golfer.rounds, player.rounds);
          return {
            identity: {
              espnAthleteId: player.espnAthleteId,
              playerName: player.playerName,
              golferId: golfer.golferId,
              auditId: audit?.auditId,
              updateGolferIdentity: golfer.espnId !== player.espnAthleteId,
            },
            scorecard: areEspnRoundsEqual(golfer.rounds, mergedRounds)
              ? undefined
              : { golferId: golfer.golferId, rounds: mergedRounds },
          };
        });

        for (let index = 0; index < playerDeltas.length; index += 50) {
          const chunk = playerDeltas.slice(index, index + 50);
          const summary = await ctx.runMutation(
            internal.functions.espnGolf.applyScorecardChunk,
            {
              tournamentId: args.tournamentId,
              players: chunk.map((delta) => delta.identity),
              scorecards: chunk.flatMap((delta) =>
                delta.scorecard ? [delta.scorecard] : [],
              ),
              fetchedAt,
            },
          );
          scorecardsUpdated += summary.scorecardsUpdated;
        }
        const withdrawnSummary = await ctx.runMutation(
          internal.functions.espnGolf.completeWithdrawnScorecards,
          { tournamentId: args.tournamentId, fetchedAt },
        );
        scorecardsUpdated += withdrawnSummary.scorecardsUpdated;
        await ctx.runMutation(
          internal.functions.espnGolf.recordEventSyncSuccess,
          {
            tournamentId: args.tournamentId,
            espnEventId: event.espnEventId,
            espnEventName: event.eventName,
            matchedGolferIds: [...matchedGolferIds],
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
