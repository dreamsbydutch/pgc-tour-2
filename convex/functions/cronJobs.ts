import { cronJobsValidators } from "../validators/cronJobs";

import { v } from "convex/values";

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type {
  FieldPlayer,
  LiveModelPlayer,
  RankedPlayer,
} from "../types/datagolf";

import type {
  CreateGroupsTarget,
  CronRunErr,
  CronRunOk,
  EnhancedGolfer,
  FieldPlayerWithAllTeeTimes,
  TeamsCronGolferSnap,
  TeamsCronPlayoffContext,
  TeamsCronTournamentSnap,
  TeamsCronUpdate,
} from "../types/cronJobs";

import {
  determineGroupIndex,
  eventNameLooksCompatible,
  isPlayoffTierName,
  listPlayoffTournamentsForSeason,
  normalizeDgSkillEstimateToPgcRating,
} from "../utils/cronShared";
import {
  areAllPlayersFinishedFromLiveStats,
  buildUsageRateByGolferApiId,
  computePosChange,
  inferParFromLiveStats,
  normalizeFieldPlayerFromDataGolf,
  isRoundRunningFromLiveStats,
  normalizePlayerNameFromDataGolf,
  parsePositionNumber,
  parseThruFromLiveModel,
  roundDecimalTeamsCron,
  roundToSingleDecimalPlace,
} from "../utils/cronJobs";

const EXCLUDED_GOLFER_IDS = new Set([18417]);

const GROUP_LIMITS = {
  GROUP_1: { percentage: 0.1, maxCount: 10 },
  GROUP_2: { percentage: 0.175, maxCount: 16 },
  GROUP_3: { percentage: 0.225, maxCount: 22 },
  GROUP_4: { percentage: 0.25, maxCount: 30 },
} as const;

export const getGolferIdsByApiIds = internalQuery({
  args: cronJobsValidators.args.getGolferIdsByApiIds,
  handler: async (ctx, args) => {
    const unique = Array.from(new Set(args.apiIds));

    const rows = await Promise.all(
      unique.map(async (apiId) => {
        const golfer = await ctx.db
          .query("golfers")
          .withIndex("by_api_id", (q) => q.eq("apiId", apiId))
          .first();
        return {
          apiId,
          golferId: golfer?._id ?? null,
        };
      }),
    );

    return rows;
  },
});

export const updateGolfersWorldRanksFromRankings = internalMutation({
  args: cronJobsValidators.args.updateGolfersWorldRanksFromRankings,
  handler: async (ctx, args) => {
    let golfersMatched = 0;
    let golfersUpdated = 0;

    for (const r of args.rankings) {
      const apiId = r.dg_id;
      const nextWorldRank = r.owgr_rank;
      if (!Number.isFinite(apiId) || !Number.isFinite(nextWorldRank)) continue;

      const golfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", apiId))
        .first();

      if (!golfer) continue;
      golfersMatched += 1;

      const patch: Partial<Doc<"golfers">> & { updatedAt: number } = {
        updatedAt: Date.now(),
      };

      const normalizedName = normalizePlayerNameFromDataGolf(r.player_name);
      if (normalizedName && normalizedName !== golfer.playerName) {
        patch.playerName = normalizedName;
      }

      if (nextWorldRank !== golfer.worldRank) {
        patch.worldRank = nextWorldRank;
      }

      const nextCountry = typeof r.country === "string" ? r.country.trim() : "";
      if (nextCountry && golfer.country !== nextCountry) {
        patch.country = nextCountry;
      }

      const keys = Object.keys(patch);
      if (keys.length > 1) {
        await ctx.db.patch(golfer._id, patch);
        golfersUpdated += 1;
      }
    }

    return {
      ok: true,
      skipped: false,
      golfersMatched,
      golfersUpdated,
      rankingsProcessed: args.rankings.length,
    } as const;
  },
});

/**
 * Fetches the latest DataGolf rankings and applies OWGR/country/name updates into `golfers`.
 *
 * This is an `internalAction` because it calls the external DataGolf API.
 */
export const updateGolfersWorldRankFromDataGolfInput: ReturnType<
  typeof internalAction
> = internalAction({
  args: v.object({}),
  handler: async (ctx) => {
    let rankings: unknown;
    try {
      rankings = await ctx.runAction(
        api.functions.datagolf.fetchDataGolfRankings,
        {},
      );
    } catch (err) {
      return {
        ok: false,
        skipped: false,
        reason: "datagolf_fetch_failed",
        error: err instanceof Error ? err.message : String(err),
      } as const;
    }

    const rankingsList = Array.isArray(
      (rankings as { rankings?: unknown }).rankings,
    )
      ? ((rankings as { rankings: unknown[] }).rankings as RankedPlayer[])
      : [];

    if (rankingsList.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_rankings",
        rankingsFetched: 0,
      } as const;
    }

    const result = await ctx.runMutation(
      internal.functions.cronJobs.updateGolfersWorldRanksFromRankings,
      {
        rankings: rankingsList.map((r) => ({
          dg_id: r.dg_id,
          owgr_rank: r.owgr_rank,
          player_name: r.player_name,
          country: r.country,
        })),
      },
    );

    return {
      ...result,
      rankingsFetched: rankingsList.length,
    } as const;
  },
});

export const getCreateGroupsTarget = internalQuery({
  args: cronJobsValidators.args.getCreateGroupsTarget,
  handler: async (ctx, args) => {
    const now = Date.now();

    let tournamentId = args.tournamentId as Id<"tournaments"> | undefined;
    if (!tournamentId) {
      const upcoming: Doc<"tournaments">[] = await ctx.db
        .query("tournaments")
        .withIndex("by_status", (q) => q.eq("status", "upcoming"))
        .collect();

      const future = upcoming.filter((t) => t.startDate > now);
      future.sort((a, b) => a.startDate - b.startDate);
      tournamentId = future[0]?._id;
    }

    if (!tournamentId) {
      return {
        ok: true,
        skipped: true,
        reason: "no_upcoming_tournament",
      } as const;
    }

    const existing = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .first();

    if (existing) {
      return {
        ok: true,
        skipped: true,
        reason: "already_has_golfers",
        tournamentId,
      } as const;
    }

    const tournament = await ctx.db.get(tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const tier = await ctx.db.get(tournament.tierId);
    const isPlayoff = isPlayoffTierName(
      (tier?.name as string | undefined) ?? null,
    );

    let eventIndex: 1 | 2 | 3 = 1;
    let firstPlayoffTournamentId: Id<"tournaments"> | null = null;

    if (isPlayoff) {
      const playoffEvents = await listPlayoffTournamentsForSeason(
        ctx,
        tournament.seasonId,
      );
      const idx = playoffEvents.findIndex((t) => t._id === tournamentId);
      eventIndex = idx === -1 ? 1 : (Math.min(3, idx + 1) as 1 | 2 | 3);
      firstPlayoffTournamentId = playoffEvents[0]?._id ?? null;
    }

    return {
      ok: true,
      skipped: false,
      tournamentId,
      tournamentName: tournament.name,
      isPlayoff,
      eventIndex,
      firstPlayoffTournamentId,
      seasonId: tournament.seasonId,
    } as const;
  },
});

export const copyFromFirstPlayoff = internalMutation({
  args: cronJobsValidators.args.copyFromFirstPlayoff,
  handler: async (ctx, args) => {
    const baseGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.firstPlayoffTournamentId),
      )
      .collect();

    const baseTeams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.firstPlayoffTournamentId),
      )
      .collect();

    let golfersCopied = 0;
    let teamsCopied = 0;
    const groupSet = new Set<number>();

    for (const tg of baseGolfers) {
      if (typeof tg.group === "number") groupSet.add(tg.group);

      const existing = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", tg.golferId).eq("tournamentId", args.tournamentId),
        )
        .first();

      if (existing) continue;

      await ctx.db.insert("tournamentGolfers", {
        golferId: tg.golferId,
        tournamentId: args.tournamentId,
        group: tg.group,
        rating: tg.rating,
        worldRank: tg.worldRank,
        updatedAt: Date.now(),
      });
      golfersCopied += 1;
    }

    for (const team of baseTeams) {
      const existing = await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q
            .eq("tournamentId", args.tournamentId)
            .eq("tourCardId", team.tourCardId),
        )
        .first();

      if (existing) continue;

      await ctx.db.insert("teams", {
        tournamentId: args.tournamentId,
        tourCardId: team.tourCardId,
        golferIds: team.golferIds,
        score: team.score,
        position: team.position,
        pastPosition: team.pastPosition,
        updatedAt: Date.now(),
      });
      teamsCopied += 1;
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      copiedFromTournamentId: args.firstPlayoffTournamentId,
      golfersCopied,
      teamsCopied,
      groupsCreated: groupSet.size,
    } as const;
  },
});

export const applyCreateGroups = internalMutation({
  args: cronJobsValidators.args.applyCreateGroups,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .first();

    if (existing) {
      return {
        ok: true,
        skipped: true,
        reason: "already_has_golfers",
        tournamentId: args.tournamentId,
      } as const;
    }

    let inserted = 0;

    for (const group of args.groups) {
      for (const g of group.golfers) {
        const existingGolfer = await ctx.db
          .query("golfers")
          .withIndex("by_api_id", (q) => q.eq("apiId", g.dgId))
          .first();

        if (existingGolfer) {
          const normalized = normalizePlayerNameFromDataGolf(
            existingGolfer.playerName,
          );
          if (normalized !== existingGolfer.playerName) {
            await ctx.db.patch(existingGolfer._id, {
              playerName: normalized,
              updatedAt: Date.now(),
            });
          }
        }

        const golferId = existingGolfer
          ? existingGolfer._id
          : await ctx.db.insert("golfers", {
              apiId: g.dgId,
              playerName: normalizePlayerNameFromDataGolf(g.playerName),
              ...(g.country ? { country: g.country } : {}),
              ...(g.worldRank !== undefined ? { worldRank: g.worldRank } : {}),
              updatedAt: Date.now(),
            });

        const existingTG = await ctx.db
          .query("tournamentGolfers")
          .withIndex("by_golfer_tournament", (q) =>
            q.eq("golferId", golferId).eq("tournamentId", args.tournamentId),
          )
          .first();

        const rating = normalizeDgSkillEstimateToPgcRating(
          g.skillEstimate ?? -1.875,
        );

        if (!existingTG) {
          await ctx.db.insert("tournamentGolfers", {
            golferId,
            tournamentId: args.tournamentId,
            group: group.groupNumber,
            worldRank: g.worldRank ?? 501,
            rating,
            ...(typeof g.r1TeeTime === "string"
              ? { roundOneTeeTime: g.r1TeeTime }
              : {}),
            ...(typeof g.r2TeeTime === "string"
              ? { roundTwoTeeTime: g.r2TeeTime }
              : {}),
            updatedAt: Date.now(),
          });
          inserted += 1;
        }
      }
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      golfersProcessed: inserted,
      groupsCreated: args.groups.filter((g) => g.golfers.length > 0).length,
    } as const;
  },
});

export const runCreateGroupsForNextTournament: ReturnType<
  typeof internalAction
> = internalAction({
  args: cronJobsValidators.args.runCreateGroupsForNextTournament,
  handler: async (ctx, args): Promise<unknown> => {
    const target = (await ctx.runQuery(
      internal.functions.cronJobs.getCreateGroupsTarget,
      { tournamentId: args.tournamentId },
    )) as CreateGroupsTarget;

    if (target.skipped) return target;

    const tournamentId = target.tournamentId;

    if (
      target.isPlayoff &&
      target.eventIndex > 1 &&
      target.firstPlayoffTournamentId
    ) {
      const createResult = await ctx.runMutation(
        internal.functions.cronJobs.copyFromFirstPlayoff,
        {
          tournamentId,
          firstPlayoffTournamentId: target.firstPlayoffTournamentId,
        },
      );

      return {
        ok: true,
        tournamentId,
        createGroups: createResult,
      };
    }
    const tour = "pga" as const;

    const [fieldUpdates, rankings] = await Promise.all([
      ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
        options: { tour },
      }),
      ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
    ]);

    console.log(
      "[create_groups_for_next_tournament] DataGolf field-updates payload",
      fieldUpdates,
    );

    const dataGolfEventName =
      typeof (fieldUpdates as { event_name?: unknown }).event_name === "string"
        ? (fieldUpdates as { event_name: string }).event_name
        : "";

    if (!dataGolfEventName.trim()) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_datagolf_event_name",
        tournamentId,
        tournamentName: target.tournamentName,
      } as const;
    }

    const compatible = eventNameLooksCompatible(
      target.tournamentName,
      dataGolfEventName,
    );

    if (!compatible.ok) {
      return {
        ok: true,
        skipped: true,
        reason: "event_name_mismatch",
        tournamentId,
        tournamentName: target.tournamentName,
        dataGolfEventName,
        score: compatible.score,
        intersection: compatible.intersection,
        expectedTokens: compatible.expectedTokens,
        actualTokens: compatible.actualTokens,
      } as const;
    }

    const field = Array.isArray((fieldUpdates as { field?: unknown }).field)
      ? ((fieldUpdates as { field: unknown[] }).field as FieldPlayer[])
      : [];

    console.log(
      "[create_groups_for_next_tournament] DataGolf field length",
      field.length,
    );

    const rankingsList = Array.isArray(
      (rankings as { rankings?: unknown }).rankings,
    )
      ? ((rankings as { rankings: unknown[] }).rankings as RankedPlayer[])
      : [];

    const byDgId = new Map<number, RankedPlayer>();
    for (const r of rankingsList) byDgId.set(r.dg_id, r);

    const processed: EnhancedGolfer[] = field
      .filter((g) => !EXCLUDED_GOLFER_IDS.has(g.dg_id))
      .map((g) => ({ ...g, ranking: byDgId.get(g.dg_id) }))
      .sort(
        (a, b) =>
          (b.ranking?.dg_skill_estimate ?? -50) -
          (a.ranking?.dg_skill_estimate ?? -50),
      );

    const groups: EnhancedGolfer[][] = [[], [], [], [], []];
    processed.forEach((g, index) => {
      const gi = determineGroupIndex(
        index,
        processed.length,
        groups,
        GROUP_LIMITS,
      );
      groups[gi]!.push(g);
    });

    const createResult = await ctx.runMutation(
      internal.functions.cronJobs.applyCreateGroups,
      {
        tournamentId,
        groups: groups.map((group, idx) => ({
          groupNumber: idx + 1,
          golfers: group.map((g) => ({
            dgId: g.dg_id,
            playerName: normalizePlayerNameFromDataGolf(g.player_name),
            country: g.country,
            worldRank: g.ranking?.owgr_rank,
            ...(typeof g.r1_teetime === "string" && g.r1_teetime.trim().length
              ? {
                  r1TeeTime: g.r1_teetime,
                  ...(typeof g.r2_teetime === "string" &&
                  g.r2_teetime.trim().length
                    ? { r2TeeTime: g.r2_teetime }
                    : {}),
                }
              : {}),
            skillEstimate: g.ranking?.dg_skill_estimate,
          })),
        })),
      },
    );

    const worldRankUpdate = await ctx.runMutation(
      internal.functions.cronJobs.updateGolfersWorldRanksFromRankings,
      {
        rankings: rankingsList.map((r) => ({
          dg_id: r.dg_id,
          owgr_rank: r.owgr_rank,
          player_name: r.player_name,
          country: r.country,
        })),
      },
    );

    return {
      ok: true,
      tournamentId,
      createGroups: createResult,
      worldRankUpdate,
    };
  },
});

export const getActiveTournamentIdForCron = internalQuery({
  args: cronJobsValidators.args.getActiveTournamentIdForCron,
  handler: async (ctx): Promise<Id<"tournaments"> | null> => {
    const active = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();

    if (active) return active._id;

    const live = await ctx.db
      .query("tournaments")
      .filter((q) =>
        q.and(
          q.eq(q.field("livePlay"), true),
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "cancelled"),
        ),
      )
      .first();

    if (live) return live._id;

    const now = Date.now();
    const overlapping = await ctx.db
      .query("tournaments")
      .withIndex("by_dates", (q) => q.lte("startDate", now))
      .filter((q) =>
        q.and(
          q.gte(q.field("endDate"), now),
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "cancelled"),
        ),
      )
      .first();

    return overlapping?._id ?? null;
  },
});

export const getTournamentNameForCron = internalQuery({
  args: cronJobsValidators.args.getTournamentNameForCron,
  handler: async (ctx, args): Promise<string | null> => {
    const tournament = await ctx.db.get(args.tournamentId);
    return tournament?.name ?? null;
  },
});

export const getTournamentCourseParForCron = internalQuery({
  args: cronJobsValidators.args.getTournamentCourseParForCron,
  handler: async (ctx, args): Promise<number | null> => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) return null;
    const course = await ctx.db.get(tournament.courseId);
    return course?.par ?? null;
  },
});

export const getTournamentDataGolfInPlayLastUpdateForCron = internalQuery({
  args: cronJobsValidators.args.getTournamentDataGolfInPlayLastUpdateForCron,
  handler: async (ctx, args): Promise<string | null> => {
    const tournament = await ctx.db.get(args.tournamentId);
    return typeof tournament?.dataGolfInPlayLastUpdate === "string"
      ? tournament.dataGolfInPlayLastUpdate
      : null;
  },
});

export const applyDataGolfLiveSync = internalMutation({
  args: cronJobsValidators.args.applyDataGolfLiveSync,
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found for live sync");
    }

    const effectiveCurrentRound: number | undefined =
      typeof args.currentRound === "number"
        ? args.currentRound
        : typeof tournament.currentRound === "number"
          ? tournament.currentRound
          : undefined;

    const tournamentStarted =
      tournament.status === "active" ||
      tournament.status === "completed" ||
      tournament.livePlay === true ||
      Date.now() >= tournament.startDate;

    const fieldById = new Map<number, FieldPlayerWithAllTeeTimes>();
    for (const f of args.field) {
      fieldById.set(f.dg_id, f);
    }

    const rankingById = new Map<number, RankedPlayer>();
    for (const r of args.rankings) {
      rankingById.set(r.dg_id, r);
    }

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();

    const usageByGolferApiId = buildUsageRateByGolferApiId({ teams });

    let golfersInserted = 0;
    let tournamentGolfersInserted = 0;
    let tournamentGolfersPatchedFromField = 0;
    let tournamentGolfersUpdated = 0;

    for (const field of tournamentStarted ? [] : args.field) {
      const golferApiId = field.dg_id;
      const ranking = rankingById.get(golferApiId);

      const existingGolfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", golferApiId))
        .first();

      if (existingGolfer) {
        const normalized = normalizePlayerNameFromDataGolf(
          existingGolfer.playerName,
        );
        if (normalized !== existingGolfer.playerName) {
          await ctx.db.patch(existingGolfer._id, {
            playerName: normalized,
            updatedAt: Date.now(),
          });
        }
      }

      const golferId = existingGolfer
        ? existingGolfer._id
        : await ctx.db.insert("golfers", {
            apiId: golferApiId,
            playerName: normalizePlayerNameFromDataGolf(field.player_name),
            country: field.country || ranking?.country,
            worldRank:
              typeof ranking?.owgr_rank === "number"
                ? ranking.owgr_rank
                : undefined,
            updatedAt: Date.now(),
          });

      if (!existingGolfer) golfersInserted += 1;

      const existingTournamentGolfer = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", golferId).eq("tournamentId", args.tournamentId),
        )
        .first();

      if (!existingTournamentGolfer) {
        await ctx.db.insert("tournamentGolfers", {
          tournamentId: args.tournamentId,
          golferId,
          ...(typeof field.r1_teetime === "string"
            ? { roundOneTeeTime: field.r1_teetime }
            : {}),
          ...(typeof field.r2_teetime === "string"
            ? { roundTwoTeeTime: field.r2_teetime }
            : {}),
          ...(typeof field.r3_teetime === "string"
            ? { roundThreeTeeTime: field.r3_teetime }
            : {}),
          ...(typeof field.r4_teetime === "string"
            ? { roundFourTeeTime: field.r4_teetime }
            : {}),
          ...(typeof ranking?.owgr_rank === "number"
            ? { worldRank: ranking.owgr_rank }
            : {}),
          ...(typeof ranking?.dg_skill_estimate === "number"
            ? {
                rating: normalizeDgSkillEstimateToPgcRating(
                  ranking.dg_skill_estimate,
                ),
              }
            : {}),
          usage: usageByGolferApiId.get(golferApiId),
          updatedAt: Date.now(),
        });
        tournamentGolfersInserted += 1;
      } else {
        const patch: Partial<Doc<"tournamentGolfers">> = {
          ...(typeof field.r1_teetime === "string"
            ? { roundOneTeeTime: field.r1_teetime }
            : {}),
          ...(typeof field.r2_teetime === "string"
            ? { roundTwoTeeTime: field.r2_teetime }
            : {}),
          ...(typeof field.r3_teetime === "string"
            ? { roundThreeTeeTime: field.r3_teetime }
            : {}),
          ...(typeof field.r4_teetime === "string"
            ? { roundFourTeeTime: field.r4_teetime }
            : {}),
          ...(typeof ranking?.owgr_rank === "number"
            ? { worldRank: ranking.owgr_rank }
            : {}),
          ...(typeof ranking?.dg_skill_estimate === "number"
            ? {
                rating: normalizeDgSkillEstimateToPgcRating(
                  ranking.dg_skill_estimate,
                ),
              }
            : {}),
          ...(usageByGolferApiId.get(golferApiId) !== undefined
            ? { usage: usageByGolferApiId.get(golferApiId) }
            : {}),
          updatedAt: Date.now(),
        };

        await ctx.db.patch(existingTournamentGolfer._id, patch);
        tournamentGolfersPatchedFromField += 1;
      }
    }

    for (const live of args.liveStats as LiveModelPlayer[]) {
      const golferApiId = live.dg_id;
      const field = fieldById.get(golferApiId);
      const ranking = rankingById.get(golferApiId);

      const golfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", golferApiId))
        .first();

      if (!golfer) continue;

      const existingTournamentGolfer = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", golfer._id).eq("tournamentId", args.tournamentId),
        )
        .first();

      if (!existingTournamentGolfer) continue;

      const nextPosition = live.current_pos;
      const nextPosChange = computePosChange(
        existingTournamentGolfer.position,
        nextPosition,
      );

      const nextUsage = usageByGolferApiId.get(golferApiId);

      const thruNum = parseThruFromLiveModel(live.thru);

      await ctx.db.patch(existingTournamentGolfer._id, {
        position: nextPosition,
        posChange: nextPosChange,
        score: roundToSingleDecimalPlace(live.current_score),
        today: roundToSingleDecimalPlace(live.today),
        ...(thruNum !== undefined ? { thru: thruNum } : {}),
        round: live.round,
        endHole: live.end_hole,
        makeCut: live.make_cut,
        ...(typeof live.top_10 === "number" ? { topTen: live.top_10 } : {}),
        win: live.win,
        ...(typeof live.R1 === "number"
          ? { roundOne: roundToSingleDecimalPlace(live.R1) }
          : {}),
        ...(typeof live.R2 === "number"
          ? { roundTwo: roundToSingleDecimalPlace(live.R2) }
          : {}),
        ...(typeof live.R3 === "number"
          ? { roundThree: roundToSingleDecimalPlace(live.R3) }
          : {}),
        ...(typeof live.R4 === "number"
          ? { roundFour: roundToSingleDecimalPlace(live.R4) }
          : {}),
        ...(typeof field?.r1_teetime === "string"
          ? { roundOneTeeTime: field.r1_teetime }
          : {}),
        ...(typeof field?.r2_teetime === "string"
          ? { roundTwoTeeTime: field.r2_teetime }
          : {}),
        ...(typeof field?.r3_teetime === "string"
          ? { roundThreeTeeTime: field.r3_teetime }
          : {}),
        ...(typeof field?.r4_teetime === "string"
          ? { roundFourTeeTime: field.r4_teetime }
          : {}),
        ...(typeof ranking?.owgr_rank === "number"
          ? { worldRank: ranking.owgr_rank }
          : {}),
        ...(typeof ranking?.dg_skill_estimate === "number"
          ? {
              rating: normalizeDgSkillEstimateToPgcRating(
                ranking.dg_skill_estimate,
              ),
            }
          : {}),
        ...(nextUsage !== undefined ? { usage: nextUsage } : {}),
        updatedAt: Date.now(),
      });

      tournamentGolfersUpdated += 1;
    }

    console.log("applyDataGolfLiveSync: summary", {
      tournamentId: args.tournamentId,
      currentRound: args.currentRound,
      field: args.field.length,
      rankings: args.rankings.length,
      liveStats: args.liveStats.length,
      golfersInserted,
      tournamentGolfersInserted,
      tournamentGolfersPatchedFromField,
      tournamentGolfersUpdated,
    });

    const inferredRoundIsRunning = isRoundRunningFromLiveStats(
      args.liveStats as LiveModelPlayer[],
    );
    const shouldSetLivePlay = args.roundIsRunning ?? inferredRoundIsRunning;

    const tournamentCompleted =
      !shouldSetLivePlay &&
      effectiveCurrentRound === 4 &&
      areAllPlayersFinishedFromLiveStats(args.liveStats as LiveModelPlayer[]);

    const nextCurrentRound = tournamentCompleted ? 5 : args.currentRound;
    const nextStatus: Doc<"tournaments">["status"] =
      tournament.status === "cancelled"
        ? "cancelled"
        : tournamentCompleted
          ? "completed"
          : tournament.status === "completed"
            ? "completed"
            : shouldSetLivePlay
              ? "active"
              : tournament.status;

    await ctx.db.patch(args.tournamentId, {
      ...(typeof nextCurrentRound === "number"
        ? { currentRound: nextCurrentRound }
        : typeof effectiveCurrentRound === "number"
          ? { currentRound: effectiveCurrentRound }
          : {}),
      ...(shouldSetLivePlay ? { livePlay: true } : { livePlay: false }),
      ...(typeof args.dataGolfInPlayLastUpdate === "string"
        ? { dataGolfInPlayLastUpdate: args.dataGolfInPlayLastUpdate }
        : {}),
      ...(nextStatus !== tournament.status ? { status: nextStatus } : {}),
      leaderboardLastUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      eventName: args.eventName,
      currentRound: tournamentCompleted ? 5 : effectiveCurrentRound,
      tournamentStatus: nextStatus,
      tournamentCompleted,
      golfersInserted,
      golfersUpdated: 0,
      tournamentGolfersInserted,
      tournamentGolfersPatchedFromField,
      tournamentGolfersUpdated,
      livePlayers: args.liveStats.length,
    } as const;
  },
});

export const runLiveTournamentSync: ReturnType<typeof internalAction> =
  internalAction({
    args: cronJobsValidators.args.runLiveTournamentSync,
    handler: async (ctx, args) => {
      const tournamentId =
        args.tournamentId ??
        (await ctx.runQuery(
          internal.functions.cronJobs.getActiveTournamentIdForCron,
          {},
        ));

      if (!tournamentId) {
        console.log("runLiveTournamentSync: skipped (no_active_tournament)");
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }

      const tournamentMeta = await ctx.runQuery(
        internal.functions.cronJobs.getTournamentMetaForCron,
        { tournamentId },
      );
      const tournamentName = tournamentMeta.name;

      const tournamentStarted =
        (tournamentMeta.status ?? null) === "active" ||
        (tournamentMeta.status ?? null) === "completed" ||
        tournamentMeta.livePlay === true ||
        Date.now() >= tournamentMeta.startDate;

      const tour = "pga" as const;

      const inPlay = await ctx.runAction(
        api.functions.datagolf.fetchLiveModelPredictions,
        { options: { tour } },
      );

      const dataGolfInPlayLastUpdate =
        typeof inPlay.info?.last_update === "string"
          ? inPlay.info.last_update
          : undefined;

      const liveStats = Array.isArray(inPlay.data)
        ? (inPlay.data as LiveModelPlayer[])
        : [];

      const dataGolfCurrentRound =
        typeof inPlay.info?.current_round === "number"
          ? inPlay.info.current_round
          : undefined;

      const roundIsRunning = isRoundRunningFromLiveStats(liveStats);
      const tournamentCompletedFromLiveStats =
        liveStats.length > 0 && areAllPlayersFinishedFromLiveStats(liveStats);

      if (!roundIsRunning) {
        const previousLastUpdate = await ctx.runQuery(
          internal.functions.cronJobs
            .getTournamentDataGolfInPlayLastUpdateForCron,
          { tournamentId },
        );

        if (
          !dataGolfInPlayLastUpdate ||
          dataGolfInPlayLastUpdate === previousLastUpdate
        ) {
          if (tournamentCompletedFromLiveStats) {
            console.log(
              "runLiveTournamentSync: proceeding (no_active_round_but_completed)",
              {
                tournamentId,
                lastUpdate: dataGolfInPlayLastUpdate,
                previousLastUpdate,
                liveStats: liveStats.length,
              },
            );
          } else {
            const shouldForceFinalize =
              (tournamentMeta.status ?? null) !== "completed" &&
              (tournamentMeta.currentRound ?? 1) >= 4;

            if (shouldForceFinalize) {
              console.log(
                "runLiveTournamentSync: proceeding (no_active_round_force_finalize)",
                {
                  tournamentId,
                  tournamentName: tournamentMeta.name,
                  currentRound: tournamentMeta.currentRound,
                  status: tournamentMeta.status,
                  lastUpdate: dataGolfInPlayLastUpdate,
                  previousLastUpdate,
                  liveStats: liveStats.length,
                },
              );
            } else {
              console.log(
                "runLiveTournamentSync: skipped (no_active_round_no_changes)",
                {
                  tournamentId,
                  dataGolfEventName:
                    typeof inPlay.info?.event_name === "string"
                      ? inPlay.info.event_name
                      : undefined,
                  currentRound:
                    typeof inPlay.info?.current_round === "number"
                      ? inPlay.info.current_round
                      : undefined,
                  lastUpdate: dataGolfInPlayLastUpdate,
                  previousLastUpdate,
                  liveStats: liveStats.length,
                },
              );

              return {
                ok: true,
                skipped: true,
                reason: "no_active_round_no_changes",
                tournamentId,
                lastUpdate: dataGolfInPlayLastUpdate,
                previousLastUpdate,
              } as const;
            }
          }
        }

        console.log(
          "runLiveTournamentSync: proceeding (no_active_round_but_new_update)",
          {
            tournamentId,
            lastUpdate: dataGolfInPlayLastUpdate,
            previousLastUpdate,
          },
        );
      }

      console.log("runLiveTournamentSync: start", {
        tournamentId,
        tournamentName: tournamentMeta.name,
      });

      const [fieldUpdates, rankings] = await Promise.all([
        tournamentStarted
          ? Promise.resolve(null)
          : ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
              options: { tour },
            }),
        ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
      ]);

      const field =
        !tournamentStarted && fieldUpdates && Array.isArray(fieldUpdates.field)
          ? (fieldUpdates.field
              .map((entry) => normalizeFieldPlayerFromDataGolf(entry))
              .filter(
                (entry): entry is FieldPlayerWithAllTeeTimes => entry !== null,
              ) as FieldPlayerWithAllTeeTimes[])
          : [];
      const rankingsList = Array.isArray(rankings.rankings)
        ? (rankings.rankings as RankedPlayer[])
        : [];

      console.log("runLiveTournamentSync: datagolf payload sizes", {
        field: field.length,
        rankings: rankingsList.length,
        liveStats: liveStats.length,
      });

      const dataGolfEventName =
        typeof inPlay.info?.event_name === "string"
          ? inPlay.info.event_name
          : !tournamentStarted && fieldUpdates
            ? typeof (fieldUpdates as { event_name?: unknown }).event_name ===
              "string"
              ? (fieldUpdates as { event_name: string }).event_name
              : undefined
            : undefined;

      const inferredPar = inferParFromLiveStats(liveStats);
      const configuredPar = await ctx.runQuery(
        internal.functions.cronJobs.getTournamentCourseParForCron,
        { tournamentId },
      );

      if (
        inferredPar.par !== null &&
        typeof configuredPar === "number" &&
        inferredPar.par !== configuredPar
      ) {
        console.log("runLiveTournamentSync: par_mismatch", {
          tournamentId,
          tournamentName,
          dataGolfEventName,
          configuredPar,
          inferredPar: inferredPar.par,
          inferredParSamples: inferredPar.samples,
        });
      }

      if (tournamentName && dataGolfEventName) {
        const compatible = eventNameLooksCompatible(
          tournamentName,
          dataGolfEventName,
        );

        if (!compatible.ok) {
          const shouldForceFinalize =
            (tournamentMeta.status ?? null) !== "completed" &&
            (tournamentMeta.currentRound ?? 1) >= 4;

          if (!shouldForceFinalize) {
            console.log(
              "runLiveTournamentSync: event_name_mismatch (skipped)",
              {
                tournamentId,
                tournamentName,
                dataGolfEventName,
                score: compatible.score,
                intersection: compatible.intersection,
              },
            );

            return {
              ok: true,
              skipped: true,
              reason: "event_name_mismatch",
              tournamentId,
              tournamentName,
              dataGolfEventName,
              score: compatible.score,
              intersection: compatible.intersection,
            } as const;
          }

          console.log(
            "runLiveTournamentSync: event_name_mismatch (force_finalize)",
            {
              tournamentId,
              tournamentName,
              dataGolfEventName,
              score: compatible.score,
              intersection: compatible.intersection,
            },
          );

          const year = new Date(tournamentMeta.startDate).getFullYear();
          const apiIdRaw = String(tournamentMeta.apiId ?? "").trim();
          if (!apiIdRaw) {
            return {
              ok: false,
              skipped: false,
              reason: "missing_api_id_for_finalize",
              tournamentId,
              tournamentName,
              dataGolfEventName,
            } as const;
          }

          const apiIdNum = Number.parseInt(apiIdRaw, 10);
          const eventId = Number.isFinite(apiIdNum) ? apiIdNum : apiIdRaw;

          const coursePar = await ctx.runQuery(
            internal.functions.cronJobs.getTournamentCourseParForCron,
            { tournamentId },
          );
          const par = typeof coursePar === "number" ? coursePar : 72;

          const rounds = await ctx.runAction(
            api.functions.datagolf.fetchHistoricalRoundData,
            {
              options: {
                tour: "pga",
                eventId,
                year,
                includeStats: false,
              },
            },
          );

          const updates = Array.isArray(rounds.scores)
            ? rounds.scores
                .map((p) => {
                  const r1 = p.round_1?.score;
                  const r2 = p.round_2?.score;
                  const r3 = p.round_3?.score;
                  const r4 = p.round_4?.score;

                  const nums = [r1, r2, r3, r4].filter(
                    (n): n is number =>
                      typeof n === "number" && Number.isFinite(n),
                  );

                  const completed = nums.length;
                  const total = nums.reduce((a, b) => a + b, 0);
                  const score = completed > 0 ? total - par * completed : null;
                  const today = typeof r4 === "number" ? r4 - par : null;

                  return {
                    golferApiId: p.dg_id,
                    position:
                      typeof p.fin_text === "string" ? p.fin_text : null,
                    roundOne: typeof r1 === "number" ? r1 : null,
                    roundTwo: typeof r2 === "number" ? r2 : null,
                    roundThree: typeof r3 === "number" ? r3 : null,
                    roundFour: typeof r4 === "number" ? r4 : null,
                    score,
                    today,
                  };
                })
                .filter((u) => typeof u.golferApiId === "number")
            : [];

          const backfill = await ctx.runMutation(
            internal.functions.cronJobs.applyHistoricalRoundScoresBackfill,
            {
              tournamentId,
              updates,
            },
          );

          const completion = await ctx.runMutation(
            internal.functions.cronJobs.markTournamentCompletedForCron,
            { tournamentId },
          );

          const teams = await ctx.runAction(
            internal.functions.cronJobs.runTeamsUpdateForTournament,
            { tournamentId },
          );

          const standings = await ctx.runMutation(
            internal.functions.cronJobs.recomputeStandingsForCurrentSeason,
            {},
          );

          return {
            ok: true,
            skipped: false,
            tournamentId,
            forcedFinalize: true,
            completion,
            backfill,
            teams,
            standings,
          } as const;
        }
      }

      const live = await ctx.runMutation(
        internal.functions.cronJobs.applyDataGolfLiveSync,
        {
          tournamentId,
          currentRound:
            dataGolfCurrentRound ??
            (!tournamentStarted && fieldUpdates
              ? typeof (fieldUpdates as { current_round?: unknown })
                  .current_round === "number"
                ? (fieldUpdates as { current_round: number }).current_round
                : undefined
              : undefined),
          field,
          rankings: rankingsList,
          liveStats,
          eventName:
            typeof dataGolfEventName === "string"
              ? dataGolfEventName
              : undefined,
          dataGolfInPlayLastUpdate,
          roundIsRunning,
        },
      );

      const backfill = live.tournamentCompleted
        ? await (async () => {
            const meta = await ctx.runQuery(
              internal.functions.cronJobs.getTournamentApiIdAndStartDateForCron,
              { tournamentId },
            );

            const year = new Date(meta.startDate).getFullYear();
            const apiIdRaw = String(meta.tournamentApiId ?? "").trim();
            if (!apiIdRaw) {
              console.log(
                "runLiveTournamentSync: historical_rounds_backfill_skipped (missing_api_id)",
                { tournamentId },
              );
              return { ok: true, skipped: true, reason: "missing_api_id" };
            }

            const apiIdNum = Number.parseInt(apiIdRaw, 10);
            const eventId = Number.isFinite(apiIdNum) ? apiIdNum : apiIdRaw;

            const coursePar = await ctx.runQuery(
              internal.functions.cronJobs.getTournamentCourseParForCron,
              { tournamentId },
            );
            const par = typeof coursePar === "number" ? coursePar : 72;

            const rounds = await ctx.runAction(
              api.functions.datagolf.fetchHistoricalRoundData,
              {
                options: {
                  tour: "pga",
                  eventId,
                  year,
                  includeStats: false,
                },
              },
            );

            const updates = Array.isArray(rounds.scores)
              ? rounds.scores
                  .map((p) => {
                    const r1 = p.round_1?.score;
                    const r2 = p.round_2?.score;
                    const r3 = p.round_3?.score;
                    const r4 = p.round_4?.score;

                    const nums = [r1, r2, r3, r4].filter(
                      (n): n is number =>
                        typeof n === "number" && Number.isFinite(n),
                    );

                    const completed = nums.length;
                    const total = nums.reduce((a, b) => a + b, 0);
                    const score =
                      completed > 0 ? total - par * completed : null;
                    const today = typeof r4 === "number" ? r4 - par : null;

                    return {
                      golferApiId: p.dg_id,
                      position:
                        typeof p.fin_text === "string" ? p.fin_text : null,
                      roundOne: typeof r1 === "number" ? r1 : null,
                      roundTwo: typeof r2 === "number" ? r2 : null,
                      roundThree: typeof r3 === "number" ? r3 : null,
                      roundFour: typeof r4 === "number" ? r4 : null,
                      score,
                      today,
                    };
                  })
                  .filter((u) => typeof u.golferApiId === "number")
              : [];

            const result = await ctx.runMutation(
              internal.functions.cronJobs.applyHistoricalRoundScoresBackfill,
              {
                tournamentId,
                updates,
              },
            );

            return { ok: true, skipped: false, ...result };
          })()
        : null;

      const teams = await ctx.runAction(
        internal.functions.cronJobs.runTeamsUpdateForTournament,
        { tournamentId },
      );

      const standings = live.tournamentCompleted
        ? await ctx.runMutation(
            internal.functions.cronJobs.recomputeStandingsForCurrentSeason,
            {},
          )
        : null;

      console.log("runLiveTournamentSync: finished", {
        tournamentId,
        live,
        backfill,
        teams,
        standings,
      });

      return {
        ok: true,
        skipped: false,
        tournamentId,
        live,
        backfill,
        teams,
        standings,
      } as const;
    },
  });

export const getTournamentMetaForCron = internalQuery({
  args: cronJobsValidators.args.getTournamentNameForCron,
  handler: async (
    ctx,
    args,
  ): Promise<{
    name: string;
    apiId: string | null;
    startDate: number;
    endDate: number;
    status: Doc<"tournaments">["status"] | null;
    currentRound: number | null;
    livePlay: boolean | null;
  }> => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");
    return {
      name: tournament.name,
      apiId: (tournament.apiId ?? null) as string | null,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      status: (tournament.status ?? null) as
        | Doc<"tournaments">["status"]
        | null,
      currentRound:
        typeof tournament.currentRound === "number"
          ? tournament.currentRound
          : null,
      livePlay:
        typeof tournament.livePlay === "boolean" ? tournament.livePlay : null,
    };
  },
});

export const markTournamentCompletedForCron = internalMutation({
  args: v.object({ tournamentId: v.id("tournaments") }),
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    await ctx.db.patch(args.tournamentId, {
      status: "completed",
      currentRound: 5,
      livePlay: false,
      leaderboardLastUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { ok: true } as const;
  },
});

export const getTournamentApiIdAndStartDateForCron = internalQuery({
  args: cronJobsValidators.args.getTournamentNameForCron,
  handler: async (
    ctx,
    args,
  ): Promise<{ tournamentApiId: string | null; startDate: number }> => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");
    return {
      tournamentApiId: (tournament.apiId ?? null) as string | null,
      startDate: tournament.startDate,
    };
  },
});

export const applyHistoricalRoundScoresBackfill = internalMutation({
  args: v.object({
    tournamentId: v.id("tournaments"),
    updates: v.array(
      v.object({
        golferApiId: v.number(),
        position: v.union(v.null(), v.string()),
        roundOne: v.union(v.null(), v.number()),
        roundTwo: v.union(v.null(), v.number()),
        roundThree: v.union(v.null(), v.number()),
        roundFour: v.union(v.null(), v.number()),
        score: v.union(v.null(), v.number()),
        today: v.union(v.null(), v.number()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    let updated = 0;

    for (const u of args.updates) {
      const golfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", u.golferApiId))
        .first();
      if (!golfer) continue;

      const tg = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", golfer._id).eq("tournamentId", args.tournamentId),
        )
        .first();
      if (!tg) continue;

      await ctx.db.patch(tg._id, {
        ...(u.position ? { position: u.position } : {}),
        ...(typeof u.roundOne === "number" ? { roundOne: u.roundOne } : {}),
        ...(typeof u.roundTwo === "number" ? { roundTwo: u.roundTwo } : {}),
        ...(typeof u.roundThree === "number"
          ? { roundThree: u.roundThree }
          : {}),
        ...(typeof u.roundFour === "number" ? { roundFour: u.roundFour } : {}),
        ...(typeof u.score === "number" ? { score: u.score } : {}),
        ...(typeof u.today === "number" ? { today: u.today } : {}),
        thru: 18,
        endHole: 18,
        round: 4,
        updatedAt: Date.now(),
      });

      updated += 1;
    }

    return { updated };
  },
});

export const recomputeStandingsForCurrentSeason = internalMutation({
  args: cronJobsValidators.args.recomputeStandingsForCurrentSeason,
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();

    const seasons = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .collect();

    if (seasons.length === 0) {
      return { ok: true, skipped: true, reason: "no_current_season" } as const;
    }

    const season = seasons.reduce((best, s) =>
      s.number > best.number ? s : best,
    );

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    if (tourCards.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_tour_cards",
        seasonId: season._id,
      } as const;
    }

    const calculations = await Promise.all(
      tourCards.map(async (tc) => {
        const teams = await ctx.db
          .query("teams")
          .withIndex("by_tour_card", (q) => q.eq("tourCardId", tc._id))
          .collect();

        const completed = teams.filter((t) => (t.round ?? 0) > 4);

        const win = completed.filter((t) => {
          const posNum = parsePositionNumber(t.position ?? null);
          return posNum === 1;
        }).length;

        const topTen = completed.filter((t) => {
          const posNum = parsePositionNumber(t.position ?? null);
          return posNum !== null && posNum <= 10;
        }).length;

        const madeCut = completed.filter((t) => t.position !== "CUT").length;

        const appearances = completed.length;

        const earnings = completed.reduce(
          (sum, t) => sum + (t.earnings ?? 0),
          0,
        );
        const points = completed.reduce(
          (sum, t) => sum + Math.round(t.points ?? 0),
          0,
        );

        return {
          tourCardId: tc._id,
          tourId: tc.tourId,
          win,
          topTen,
          madeCut,
          appearances,
          earnings,
          points,
        };
      }),
    );

    const byTour = new Map<Id<"tours">, typeof calculations>();
    for (const calc of calculations) {
      const list = byTour.get(calc.tourId) ?? [];
      list.push(calc);
      byTour.set(calc.tourId, list);
    }

    let updated = 0;

    for (const list of byTour.values()) {
      for (const calc of list) {
        const samePointsCount = list.filter(
          (a) => a.points === calc.points,
        ).length;
        const betterPointsCount = list.filter(
          (a) => a.points > calc.points,
        ).length;
        const position = `${samePointsCount > 1 ? "T" : ""}${betterPointsCount + 1}`;

        const playoff =
          betterPointsCount < 15 ? 1 : betterPointsCount < 35 ? 2 : 0;

        await ctx.db.patch(calc.tourCardId, {
          points: calc.points,
          earnings: calc.earnings,
          wins: calc.win,
          topTen: calc.topTen,
          madeCut: calc.madeCut,
          appearances: calc.appearances,
          currentPosition: position,
          playoff,
          updatedAt: Date.now(),
        });

        updated += 1;
      }
    }

    return {
      ok: true,
      skipped: false,
      seasonId: season._id,
      tourCardsUpdated: updated,
    } as const;
  },
});

export const getActiveTournamentIdForTeamsCron = internalQuery({
  args: cronJobsValidators.args.getActiveTournamentIdForTeamsCron,
  handler: async (ctx): Promise<Id<"tournaments"> | null> => {
    const active = await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
    if (active) return active._id;

    const live = await ctx.db
      .query("tournaments")
      .filter((q) =>
        q.and(
          q.eq(q.field("livePlay"), true),
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "cancelled"),
        ),
      )
      .first();
    if (live) return live._id;

    const now = Date.now();
    const overlapping = await ctx.db
      .query("tournaments")
      .withIndex("by_dates", (q) => q.lte("startDate", now))
      .filter((q) =>
        q.and(
          q.gte(q.field("endDate"), now),
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "cancelled"),
        ),
      )
      .first();

    return overlapping?._id ?? null;
  },
});

export const getTournamentSnapshotForTeamsCron = internalQuery({
  args: cronJobsValidators.args.getTournamentSnapshotForTeamsCron,
  handler: async (ctx, args): Promise<TeamsCronTournamentSnap> => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const course = await ctx.db.get(tournament.courseId);
    if (!course) throw new Error("Course not found");

    const tier = await ctx.db.get(tournament.tierId);
    if (!tier) throw new Error("Tier not found");

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const tgs = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();

    const golfers: TeamsCronGolferSnap[] = [];
    for (const tg of tgs) {
      const g = await ctx.db.get(tg.golferId);
      if (!g) continue;
      golfers.push({
        apiId: g.apiId,
        position: tg.position ?? null,
        score: tg.score ?? null,
        today: tg.today ?? null,
        thru: tg.thru ?? null,
        makeCut: tg.makeCut ?? null,
        topTen: tg.topTen ?? null,
        win: tg.win ?? null,
        roundOneTeeTime: tg.roundOneTeeTime ?? null,
        roundOne: tg.roundOne ?? null,
        roundTwoTeeTime: tg.roundTwoTeeTime ?? null,
        roundTwo: tg.roundTwo ?? null,
        roundThreeTeeTime: tg.roundThreeTeeTime ?? null,
        roundThree: tg.roundThree ?? null,
        roundFourTeeTime: tg.roundFourTeeTime ?? null,
        roundFour: tg.roundFour ?? null,
      });
    }

    const isPlayoff = isPlayoffTierName(
      (tier.name as string | undefined) ?? null,
    );

    return {
      tournamentId: args.tournamentId,
      tournamentApiId: tournament.apiId ?? null,
      seasonId: tournament.seasonId,
      startDate: tournament.startDate,
      currentRound: tournament.currentRound ?? 1,
      livePlay: tournament.livePlay ?? false,
      par: course.par,
      tierPoints: tier.points ?? [],
      tierPayouts: tier.payouts ?? [],
      isPlayoff,
      teams,
      tourCards,
      golfers,
    };
  },
});

export const computePlayoffContext = internalQuery({
  args: cronJobsValidators.args.computePlayoffContext,
  handler: async (ctx, args): Promise<TeamsCronPlayoffContext> => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const tier = await ctx.db.get(tournament.tierId);
    const isPlayoff = isPlayoffTierName(
      (tier?.name as string | undefined) ?? null,
    );

    if (!isPlayoff) {
      return {
        isPlayoff: false as const,
        eventIndex: 0 as const,
        carryInByTourCardId: {},
      };
    }

    const playoffEvents = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const playoffSorted = [] as Array<{
      id: Id<"tournaments">;
      startDate: number;
    }>;
    for (const t of playoffEvents) {
      const tTier = await ctx.db.get(t.tierId);
      if (!isPlayoffTierName((tTier?.name as string | undefined) ?? null))
        continue;
      playoffSorted.push({ id: t._id, startDate: t.startDate });
    }

    playoffSorted.sort((a, b) => a.startDate - b.startDate);
    const idx = playoffSorted.findIndex((t) => t.id === args.tournamentId);
    const eventIndex = idx === -1 ? 1 : (Math.min(3, idx + 1) as 1 | 2 | 3);

    const prevId =
      eventIndex >= 2 ? playoffSorted[eventIndex - 2]?.id : undefined;
    if (!prevId) {
      return {
        isPlayoff: true as const,
        eventIndex,
        carryInByTourCardId: {},
      };
    }

    const prevTeams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", prevId))
      .collect();

    const carryInByTourCardId: Record<string, number> = {};
    for (const t of prevTeams) {
      carryInByTourCardId[String(t.tourCardId)] = t.score ?? 0;
    }

    return {
      isPlayoff: true as const,
      eventIndex,
      carryInByTourCardId,
    };
  },
});

export const applyTeamsUpdate = internalMutation({
  args: cronJobsValidators.args.applyTeamsUpdate,
  handler: async (ctx, args) => {
    let updated = 0;

    for (const u of args.updates) {
      const existing = await ctx.db.get(u.teamId);
      if (!existing) continue;

      if (existing.tournamentId !== args.tournamentId) continue;

      await ctx.db.patch(u.teamId, {
        round: u.round,
        roundOne: u.roundOne,
        roundTwo: u.roundTwo,
        roundThree: u.roundThree,
        roundFour: u.roundFour,
        today: u.today,
        thru: u.thru,
        score: u.score,
        position: u.position,
        pastPosition: u.pastPosition,
        points: u.points,
        earnings: u.earnings,
        makeCut: u.makeCut,
        topTen: u.topTen,
        win: u.win,
        roundOneTeeTime: u.roundOneTeeTime,
        roundTwoTeeTime: u.roundTwoTeeTime,
        roundThreeTeeTime: u.roundThreeTeeTime,
        roundFourTeeTime: u.roundFourTeeTime,
        updatedAt: Date.now(),
      });

      updated += 1;
    }

    return { updated };
  },
});

export const runTeamsUpdateForTournament: ReturnType<typeof internalAction> =
  internalAction({
    args: cronJobsValidators.args.runTeamsUpdateForTournament,
    handler: async (ctx, args) => {
      const tournamentId =
        args.tournamentId ??
        (await ctx.runQuery(
          internal.functions.cronJobs.getActiveTournamentIdForTeamsCron,
          {},
        ));

      if (!tournamentId) {
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }

      const snap = (await ctx.runQuery(
        internal.functions.cronJobs.getTournamentSnapshotForTeamsCron,
        { tournamentId },
      )) as TeamsCronTournamentSnap;

      if (!snap.teams || snap.teams.length === 0) {
        return {
          ok: true,
          skipped: true,
          reason: "no_teams",
          tournamentId,
        } as const;
      }

      const playoff = (await ctx.runQuery(
        internal.functions.cronJobs.computePlayoffContext,
        { tournamentId },
      )) as TeamsCronPlayoffContext;

      const eventIndex = (playoff.isPlayoff ? playoff.eventIndex : 0) as
        | 0
        | 1
        | 2
        | 3;
      const carryInByTourCardId: Record<string, number> = playoff.isPlayoff
        ? playoff.carryInByTourCardId
        : {};
      const par: number = snap.par;
      const live: boolean = Boolean(snap.livePlay);
      const currentRound: number = snap.currentRound ?? 1;

      const participantTourCardIds = new Set(
        snap.teams.map((t) => t.tourCardId),
      );
      const participantTourCards = snap.tourCards.filter((tc) =>
        participantTourCardIds.has(tc._id),
      );
      const hasGoldBracket = participantTourCards.some(
        (tc) => (tc.playoff ?? 0) === 1,
      );
      const hasSilverBracket = participantTourCards.some(
        (tc) => (tc.playoff ?? 0) === 2,
      );
      const tournamentBracketHint: "gold" | "silver" | null =
        hasGoldBracket && !hasSilverBracket
          ? "gold"
          : hasSilverBracket && !hasGoldBracket
            ? "silver"
            : null;

      const updates: TeamsCronUpdate[] = [];
      for (const team of snap.teams) {
        const teamGolfers = snap.golfers.filter((g) =>
          team.golferIds.includes(g.apiId),
        );
        const active = teamGolfers.filter(
          (g) => !(g.position && /CUT|WD|DQ/i.test(g.position)),
        );
        const r1Times = teamGolfers.map((g) => g.roundOneTeeTime);
        const r2Times = teamGolfers.map((g) => g.roundTwoTeeTime);
        const r3Times = teamGolfers.map((g) => g.roundThreeTeeTime);
        const r4Times = teamGolfers.map((g) => g.roundFourTeeTime);

        const earliestTimeStr = (
          times: Array<string | null | undefined>,
          position = 1,
        ) => {
          const valid = times.filter((t): t is string =>
            Boolean(t && t.trim().length),
          );
          if (!valid.length) return undefined;
          const pos = Math.max(1, Math.floor(position));
          try {
            const parsed = valid
              .map((t) => ({ t, d: new Date(t).getTime() }))
              .filter(({ d }) => !Number.isNaN(d));
            if (parsed.length === valid.length && parsed.length > 0) {
              parsed.sort((a, b) => a.d - b.d);
              return parsed[pos - 1]?.t;
            }
          } catch (err) {
            void err;
          }
          const sorted = [...valid].sort();
          return sorted[pos - 1];
        };

        const r = Math.min(5, Math.max(1, Math.floor(currentRound))) as
          | 1
          | 2
          | 3
          | 4
          | 5;
        const tee1 = earliestTimeStr(r1Times, 1);
        const tee2 = earliestTimeStr(r2Times, 1);
        const tee3 = r >= 3 ? earliestTimeStr(r3Times, 6) : undefined;
        const tee4 = r >= 4 ? earliestTimeStr(r4Times, 6) : undefined;
        let base = 0;
        if (eventIndex !== 0) {
          if (eventIndex === 1) {
            const bracket = (() => {
              const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
              const p = tc?.playoff ?? 0;
              return p === 2
                ? "silver"
                : p === 1
                  ? "gold"
                  : tournamentBracketHint;
            })();

            if (bracket) {
              const bracketFlag = bracket === "gold" ? 1 : 2;
              const group =
                tournamentBracketHint !== null
                  ? participantTourCards
                  : participantTourCards.filter(
                      (c) => (c.playoff ?? 0) === bracketFlag,
                    );
              const sorted = [...group].sort(
                (a, b) => (b.points ?? 0) - (a.points ?? 0),
              );
              const me = sorted.find((c) => c._id === team.tourCardId);
              if (me) {
                const myPts = me.points ?? 0;
                const better = sorted.filter(
                  (c) => (c.points ?? 0) > myPts,
                ).length;
                const tied = sorted.filter(
                  (c) => (c.points ?? 0) === myPts,
                ).length;
                const strokes =
                  bracket === "gold"
                    ? (snap.tierPoints ?? []).slice(0, 30)
                    : (snap.tierPoints ?? []).slice(0, 36);
                if (tied > 1) {
                  const slice = strokes.slice(better, better + tied);
                  const sum = slice.reduce(
                    (a: number, b: number) => a + (b ?? 0),
                    0,
                  );
                  base += tied > 0 ? Math.round((sum / tied) * 10) / 10 : 0;
                } else {
                  base += strokes[better] ?? 0;
                }
              }
            }
          }

          if (eventIndex >= 2) {
            base += carryInByTourCardId[String(team.tourCardId)] ?? 0;
          }
        }

        const getRound = (g: TeamsCronGolferSnap, n: 1 | 2 | 3 | 4) =>
          n === 1
            ? g.roundOne
            : n === 2
              ? g.roundTwo
              : n === 3
                ? g.roundThree
                : g.roundFour;

        const rankForRound = (
          golfers: TeamsCronGolferSnap[],
          round: 1 | 2 | 3 | 4,
          liveMode: boolean,
        ) => {
          return [...golfers].sort((a, b) => {
            const aRound = getRound(a, round);
            const bRound = getRound(b, round);
            const va = liveMode
              ? typeof a.today === "number"
                ? a.today
                : Number.POSITIVE_INFINITY
              : typeof aRound === "number"
                ? aRound - par
                : Number.POSITIVE_INFINITY;
            const vb = liveMode
              ? typeof b.today === "number"
                ? b.today
                : Number.POSITIVE_INFINITY
              : typeof bRound === "number"
                ? bRound - par
                : Number.POSITIVE_INFINITY;
            if (va !== vb) return va - vb;
            const sa =
              typeof a.score === "number" ? a.score : Number.POSITIVE_INFINITY;
            const sb =
              typeof b.score === "number" ? b.score : Number.POSITIVE_INFINITY;
            if (sa !== sb) return sa - sb;
            return (a.apiId ?? 0) - (b.apiId ?? 0);
          });
        };

        const selectionCountFor = (ev: 0 | 1 | 2 | 3, round: 1 | 2 | 3 | 4) => {
          if (ev <= 1) return round <= 2 ? 10 : 5;
          if (ev === 2) return 5;
          return 3;
        };

        const pickTopN = (
          golfers: TeamsCronGolferSnap[],
          round: 1 | 2 | 3 | 4,
          liveMode: boolean,
          n: number,
        ) => rankForRound(golfers, round, liveMode).slice(0, n);

        const avg = (nums: Array<number | null | undefined>) => {
          const list = nums.filter(
            (n): n is number => typeof n === "number" && Number.isFinite(n),
          );
          if (!list.length) return undefined;
          return list.reduce((a, b) => a + b, 0) / list.length;
        };

        const avgOptional = (nums: Array<number | null | undefined>) => {
          const list = nums.filter(
            (n): n is number => typeof n === "number" && Number.isFinite(n),
          );
          if (!list.length) return undefined;
          return list.reduce((a, b) => a + b, 0) / list.length;
        };

        const avgOverPar = (
          golfers: TeamsCronGolferSnap[],
          round: 1 | 2 | 3 | 4,
        ) => {
          const vals = golfers.map((g) => {
            const r = getRound(g, round);
            return typeof r === "number" ? r - par : undefined;
          });
          return avg(vals);
        };

        const avgToday = (golfers: TeamsCronGolferSnap[]) =>
          avg(golfers.map((g) => g.today));
        const avgThru = (golfers: TeamsCronGolferSnap[]) =>
          avg(golfers.map((g) => g.thru));

        const contrib = (round: 1 | 2 | 3 | 4, liveMode: boolean) => {
          const required = selectionCountFor(eventIndex, round);
          const pool =
            required >= 10
              ? teamGolfers
              : pickTopN(
                  active.length ? active : teamGolfers,
                  round,
                  liveMode,
                  Math.min(required, active.length || teamGolfers.length),
                );

          if (team.golferIds.length === 0 || pool.length === 0) {
            const bracket = (() => {
              const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
              const p = tc?.playoff ?? 0;
              return p === 2 ? "silver" : p === 1 ? "gold" : "silver";
            })();
            const worst: { value: number; thru: number | undefined } = {
              value: 0,
              thru: liveMode ? undefined : 18,
            };
            for (const t2 of snap.teams) {
              const tc2 = snap.tourCards.find((c) => c._id === t2.tourCardId);
              const p2 = tc2?.playoff ?? 0;
              const bracket2 =
                p2 === 2 ? "silver" : p2 === 1 ? "gold" : "silver";
              if (bracket2 !== bracket) continue;

              const tg2 = snap.golfers.filter((g) =>
                t2.golferIds.includes(g.apiId),
              );
              const active2 = tg2.filter(
                (g) => !(g.position && /CUT|WD|DQ/i.test(g.position)),
              );
              const eligible2 =
                t2.golferIds.length > 0 && active2.length >= required;
              if (!eligible2) continue;

              const pool2 =
                required >= 10
                  ? tg2
                  : pickTopN(
                      active2.length ? active2 : tg2,
                      round,
                      liveMode,
                      Math.min(required, active2.length || tg2.length),
                    );
              const today2: number =
                (liveMode ? avgToday(pool2) : avgOverPar(pool2, round)) ?? 0;
              const thru2 = liveMode ? avgThru(pool2) : 18;
              if (today2 > worst.value) {
                worst.value = today2;
                worst.thru = thru2;
              }
            }

            return {
              today: worst.value,
              thru: worst.thru,
              overPar: worst.value,
            };
          }

          if (liveMode) {
            const today = avgToday(pool) ?? 0;
            const thru = avgThru(pool);
            return { today, thru, overPar: today };
          }
          const overPar = avgOverPar(pool, round) ?? 0;
          return { today: overPar, thru: 18, overPar };
        };

        const rawRoundPost = (round: 1 | 2 | 3 | 4) => {
          const required = selectionCountFor(eventIndex, round);
          const pool =
            required >= 10
              ? teamGolfers
              : pickTopN(
                  active.length ? active : teamGolfers,
                  round,
                  false,
                  Math.min(required, active.length || teamGolfers.length),
                );
          const a = avg(pool.map((g) => getRound(g, round)));
          if (a !== undefined) return a;

          const fallback = contrib(round, false);
          return fallback.overPar + par;
        };

        const r1Raw = rawRoundPost(1);
        const r2Raw = rawRoundPost(2);
        const r3Raw = rawRoundPost(3);
        const r4Raw = rawRoundPost(4);

        const r1Post = contrib(1, false);
        const r2Post = contrib(2, false);
        const r3Post = contrib(3, false);
        const r4Post = contrib(4, false);
        const isCut = eventIndex === 0 && r >= 3 && active.length < 5;

        let roundOne: number | undefined;
        let roundTwo: number | undefined;
        let roundThree: number | undefined;
        let roundFour: number | undefined;
        let today: number | undefined;
        let thru: number | undefined;
        let score: number | undefined;

        if (isCut) {
          roundOne = roundDecimalTeamsCron(r1Raw, 1) ?? undefined;
          roundTwo = roundDecimalTeamsCron(r2Raw, 1) ?? undefined;
        } else if (r === 1) {
          if (live) {
            const liveC = contrib(1, true);
            today = roundDecimalTeamsCron(liveC.today, 1) ?? undefined;
            thru = roundDecimalTeamsCron(liveC.thru ?? null, 1) ?? undefined;
            score =
              eventIndex === 0
                ? (roundDecimalTeamsCron(
                    avg(teamGolfers.map((g) => g.score ?? 0)),
                    1,
                  ) ?? undefined)
                : (roundDecimalTeamsCron(base + liveC.today, 1) ?? undefined);
          }
        } else if (r === 2) {
          roundOne = roundDecimalTeamsCron(r1Raw, 1) ?? undefined;
          if (live) {
            const liveC = contrib(2, true);
            today = roundDecimalTeamsCron(liveC.today, 1) ?? undefined;
            thru = roundDecimalTeamsCron(liveC.thru ?? null, 1) ?? undefined;
            score =
              roundDecimalTeamsCron(
                base + (r1Post.overPar ?? 0) + liveC.today,
                1,
              ) ?? undefined;
          } else {
            today = roundDecimalTeamsCron(r1Post.overPar, 1) ?? undefined;
            thru = 18;
            score =
              roundDecimalTeamsCron(base + (r1Post.overPar ?? 0), 1) ??
              undefined;
          }
        } else if (r === 3) {
          roundOne = roundDecimalTeamsCron(r1Raw, 1) ?? undefined;
          roundTwo = roundDecimalTeamsCron(r2Raw, 1) ?? undefined;
          if (live) {
            const liveC = contrib(3, true);
            today = roundDecimalTeamsCron(liveC.today, 1) ?? undefined;
            thru = roundDecimalTeamsCron(liveC.thru ?? null, 1) ?? undefined;
            score =
              roundDecimalTeamsCron(
                base +
                  (r1Post.overPar ?? 0) +
                  (r2Post.overPar ?? 0) +
                  liveC.today,
                1,
              ) ?? undefined;
          } else {
            today = roundDecimalTeamsCron(r2Post.overPar, 1) ?? undefined;
            thru = 18;
            score =
              roundDecimalTeamsCron(
                base + (r1Post.overPar ?? 0) + (r2Post.overPar ?? 0),
                1,
              ) ?? undefined;
          }
        } else if (r === 4) {
          roundOne = roundDecimalTeamsCron(r1Raw, 1) ?? undefined;
          roundTwo = roundDecimalTeamsCron(r2Raw, 1) ?? undefined;
          roundThree = roundDecimalTeamsCron(r3Raw, 1) ?? undefined;
          if (live) {
            const liveC = contrib(4, true);
            today = roundDecimalTeamsCron(liveC.today, 1) ?? undefined;
            thru = roundDecimalTeamsCron(liveC.thru ?? null, 1) ?? undefined;
            score =
              roundDecimalTeamsCron(
                base +
                  (r1Post.overPar ?? 0) +
                  (r2Post.overPar ?? 0) +
                  (r3Post.overPar ?? 0) +
                  liveC.today,
                1,
              ) ?? undefined;
          } else {
            today = roundDecimalTeamsCron(r3Post.overPar, 1) ?? undefined;
            thru = 18;
            score =
              roundDecimalTeamsCron(
                base +
                  (r1Post.overPar ?? 0) +
                  (r2Post.overPar ?? 0) +
                  (r3Post.overPar ?? 0),
                1,
              ) ?? undefined;
          }
        } else if (r === 5) {
          roundOne = roundDecimalTeamsCron(r1Raw, 1) ?? undefined;
          roundTwo = roundDecimalTeamsCron(r2Raw, 1) ?? undefined;
          roundThree = roundDecimalTeamsCron(r3Raw, 1) ?? undefined;
          roundFour = roundDecimalTeamsCron(r4Raw, 1) ?? undefined;
          today = roundDecimalTeamsCron(r4Post.overPar, 1) ?? undefined;
          thru = 18;
          score =
            roundDecimalTeamsCron(
              base +
                (r1Post.overPar ?? 0) +
                (r2Post.overPar ?? 0) +
                (r3Post.overPar ?? 0) +
                (r4Post.overPar ?? 0),
              1,
            ) ?? undefined;
        }

        updates.push({
          teamId: team._id,
          round: r,
          roundOne,
          roundTwo,
          roundThree,
          roundFour,
          today,
          thru,
          score,
          makeCut: avgOptional(teamGolfers.map((g) => g.makeCut)),
          topTen: avgOptional(teamGolfers.map((g) => g.topTen)),
          win: avgOptional(teamGolfers.map((g) => g.win)),
          roundOneTeeTime: tee1,
          roundTwoTeeTime: tee2,
          roundThreeTeeTime: tee3,
          roundFourTeeTime: tee4,
          _isCut: isCut,
        });
      }
      const tourIdByTourCardId = new Map<string, string>();
      for (const tc of snap.tourCards) {
        tourIdByTourCardId.set(String(tc._id), String(tc.tourId));
      }

      const tourIdByTeamId = new Map<string, string>();
      for (const team of snap.teams) {
        const tourId =
          tourIdByTourCardId.get(String(team.tourCardId)) ?? "unknown";
        tourIdByTeamId.set(String(team._id), tourId);
      }

      if (eventIndex === 0) {
        const tourIds = Array.from(
          new Set(
            updates.map(
              (u) => tourIdByTeamId.get(String(u.teamId)) ?? "unknown",
            ),
          ),
        );

        for (const tourId of tourIds) {
          const tourUpdates = updates.filter(
            (u) =>
              (tourIdByTeamId.get(String(u.teamId)) ?? "unknown") === tourId,
          );

          const labels = (() => {
            const withScore = tourUpdates
              .filter((u) => typeof u.score === "number")
              .sort((a, b) => (a.score as number) - (b.score as number));

            const map = new Map<string, string>();
            let i = 0;
            while (i < withScore.length) {
              const score = withScore[i]!.score as number;
              let j = i + 1;
              while (
                j < withScore.length &&
                (withScore[j]!.score as number) === score
              ) {
                j++;
              }

              const tieCount = j - i;
              const label = (tieCount > 1 ? "T" : "") + (i + 1);
              for (let k = i; k < j; k++) {
                map.set(String(withScore[k]!.teamId), label);
              }
              i = j;
            }

            for (const u of tourUpdates) {
              if (u._isCut) map.set(String(u.teamId), "CUT");
            }

            return map;
          })();

          for (const u of tourUpdates) {
            u.position = labels.get(String(u.teamId));
          }
        }

        const shouldApplyFinalT1TieBreaker = currentRound === 5 && !live;
        if (shouldApplyFinalT1TieBreaker) {
          const apiIdRaw = (snap.tournamentApiId ?? "").trim();
          const eventId = Number.parseInt(apiIdRaw, 10);
          const year = new Date(snap.startDate).getFullYear();

          if (!Number.isFinite(eventId)) {
            console.log(
              "runTeamsUpdateForTournament: t1_tiebreak_skipped (missing_event_id)",
              {
                tournamentId,
                tournamentApiId: snap.tournamentApiId,
              },
            );
          } else {
            try {
              const eventStats = await ctx.runAction(
                api.functions.datagolf.fetchHistoricalEventDataEvents,
                {
                  options: {
                    tour: "pga",
                    eventId,
                    year,
                    format: "json",
                  },
                },
              );

              const earningsByGolferApiId = new Map<number, number>();
              for (const s of eventStats.event_stats ?? []) {
                if (typeof s?.dg_id !== "number") continue;
                if (typeof s?.earnings !== "number") continue;
                earningsByGolferApiId.set(s.dg_id, s.earnings);
              }

              const teamById = new Map<string, Doc<"teams">>();
              for (const t of snap.teams) teamById.set(String(t._id), t);

              const tourIds = Array.from(
                new Set(
                  updates.map(
                    (u) => tourIdByTeamId.get(String(u.teamId)) ?? "unknown",
                  ),
                ),
              );

              for (const tourId of tourIds) {
                const tiedForFirst = updates.filter(
                  (u) =>
                    (tourIdByTeamId.get(String(u.teamId)) ?? "unknown") ===
                      tourId && u.position === "T1",
                );

                if (tiedForFirst.length <= 1) continue;

                const calc = tiedForFirst
                  .map((u) => {
                    const team = teamById.get(String(u.teamId));
                    const golferIds = team?.golferIds ?? [];
                    const totalEarnings = golferIds.reduce(
                      (sum, gid) => sum + (earningsByGolferApiId.get(gid) ?? 0),
                      0,
                    );
                    return { u, totalEarnings };
                  })
                  .sort((a, b) => {
                    if (b.totalEarnings !== a.totalEarnings) {
                      return b.totalEarnings - a.totalEarnings;
                    }
                    return String(a.u.teamId).localeCompare(String(b.u.teamId));
                  });

                const winner = calc[0]?.u;
                if (!winner) continue;

                winner.position = "1";
                const remainingCount = tiedForFirst.length - 1;
                const label = remainingCount > 1 ? "T2" : "2";
                for (const other of tiedForFirst) {
                  if (other.teamId === winner.teamId) continue;
                  other.position = label;
                }

                console.log(
                  "runTeamsUpdateForTournament: t1_tiebreak_applied",
                  {
                    tournamentId,
                    eventId,
                    year,
                    tourId,
                    tiedCount: tiedForFirst.length,
                    winnerTeamId: winner.teamId,
                    winnerTotalEarnings: calc[0]?.totalEarnings,
                  },
                );
              }
            } catch (err) {
              console.log(
                "runTeamsUpdateForTournament: t1_tiebreak_failed (continuing)",
                {
                  tournamentId,
                  eventId,
                  year,
                  error: err instanceof Error ? err.message : String(err),
                },
              );
            }
          }
        }
      } else {
        const playoffByTeamId = new Map<string, number>();
        for (const team of snap.teams) {
          const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
          playoffByTeamId.set(String(team._id), tc?.playoff ?? 0);
        }

        const assignBracket = (bracketFlag: 1 | 2) => {
          const bracketTeams = updates.filter(
            (u) => playoffByTeamId.get(String(u.teamId)) === bracketFlag,
          );
          const withScore = bracketTeams
            .filter((u) => typeof u.score === "number")
            .sort((a, b) => (a.score as number) - (b.score as number));

          let i = 0;
          while (i < withScore.length) {
            const score = withScore[i]!.score as number;
            let j = i + 1;
            while (
              j < withScore.length &&
              (withScore[j]!.score as number) === score
            )
              j++;
            const tieCount = j - i;
            const label = (tieCount > 1 ? "T" : "") + (i + 1);
            for (let k = i; k < j; k++) withScore[k]!.position = label;
            i = j;
          }
        };

        assignBracket(1);
        assignBracket(2);
      }
      const parsePosNum = (pos?: string) => {
        const m = pos ? /\d+/.exec(pos) : null;
        return m ? parseInt(m[0], 10) : null;
      };

      const avgAwards = (arr: number[], start: number, count: number) => {
        let sum = 0;
        for (let i = 0; i < count; i++) sum += arr[start + i] ?? 0;
        return count > 0 ? sum / count : 0;
      };

      const awardPointsAndEarnings = (
        group: TeamsCronUpdate[],
        offset: number,
      ) => {
        const byPos = new Map<number, TeamsCronUpdate[]>();
        for (const t of group) {
          const n = parsePosNum(t.position);
          if (!n || n <= 0) continue;
          const arr = byPos.get(n) ?? [];
          arr.push(t);
          byPos.set(n, arr);
        }
        const positions = Array.from(byPos.keys()).sort((a, b) => a - b);
        for (const p of positions) {
          const tied = byPos.get(p)!;
          const count = tied.length;
          const baseIdx = p - 1 + offset;
          const pts = avgAwards(snap.tierPoints ?? [], baseIdx, count);
          const pay = avgAwards(snap.tierPayouts ?? [], baseIdx, count);
          for (const t of tied) {
            t.points = Math.round(pts);
            t.earnings = Math.round(pay);
          }
        }
      };

      const awardEarningsOnly = (group: TeamsCronUpdate[], offset: number) => {
        const byPos = new Map<number, TeamsCronUpdate[]>();
        for (const t of group) {
          const n = parsePosNum(t.position);
          if (!n || n <= 0) continue;
          const arr = byPos.get(n) ?? [];
          arr.push(t);
          byPos.set(n, arr);
        }
        const positions = Array.from(byPos.keys()).sort((a, b) => a - b);
        for (const p of positions) {
          const tied = byPos.get(p)!;
          const count = tied.length;
          const baseIdx = p - 1 + offset;
          const pay = avgAwards(snap.tierPayouts ?? [], baseIdx, count);
          for (const t of tied) {
            t.points = 0;
            t.earnings = Math.round(pay);
          }
        }
      };

      if (eventIndex !== 0) {
        for (const u of updates) u.points = 0;

        const isFinalPlayoff = eventIndex === 3 && currentRound === 5;
        if (isFinalPlayoff) {
          const playoffByTeamId = new Map<string, number>();
          for (const team of snap.teams) {
            const tc = snap.tourCards.find((c) => c._id === team.tourCardId);
            playoffByTeamId.set(String(team._id), tc?.playoff ?? 0);
          }
          const bracket1 = updates.filter(
            (u) => playoffByTeamId.get(String(u.teamId)) === 1,
          );
          const bracket2 = updates.filter(
            (u) => playoffByTeamId.get(String(u.teamId)) === 2,
          );
          awardEarningsOnly(bracket1, 0);
          awardEarningsOnly(bracket2, 75);
        } else {
          for (const u of updates) u.earnings = 0;
        }
      } else {
        for (const u of updates) {
          u.points = 0;
          u.earnings = 0;
        }
        const tourIds = Array.from(
          new Set(
            updates.map(
              (u) => tourIdByTeamId.get(String(u.teamId)) ?? "unknown",
            ),
          ),
        );

        for (const tourId of tourIds) {
          const tourUpdates = updates.filter(
            (u) =>
              (tourIdByTeamId.get(String(u.teamId)) ?? "unknown") === tourId,
          );
          awardPointsAndEarnings(tourUpdates, 0);
        }
      }
      const cleanUpdates = updates.map(({ _isCut, ...rest }) => rest);

      return await ctx.runMutation(
        internal.functions.cronJobs.applyTeamsUpdate,
        {
          tournamentId,
          updates: cleanUpdates,
        },
      );
    },
  });

export const adminRunCronJob = action({
  args: cronJobsValidators.args.adminRunCronJob,
  handler: async (ctx, args): Promise<CronRunOk | CronRunErr> => {
    const startedAt = Date.now();

    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Unauthorized: You must be signed in");
      }

      const member = await ctx.runQuery(api.functions.members.getMembers, {
        options: { clerkId: identity.subject },
      });

      const role =
        member &&
        typeof member === "object" &&
        !Array.isArray(member) &&
        "role" in member
          ? (member as { role?: unknown }).role
          : undefined;

      const normalizedRole =
        typeof role === "string" ? role.trim().toLowerCase() : "";

      if (normalizedRole !== "admin" && normalizedRole !== "moderator") {
        throw new Error("Forbidden: Moderator or admin access required");
      }

      if (!args.confirm && args.job !== "create_groups_for_next_tournament") {
        throw new Error(
          "Confirmation required: set confirm=true to run a mutating cron job",
        );
      }

      let result: unknown;
      const tournamentId = args.tournamentId as Id<"tournaments"> | undefined;

      switch (args.job) {
        case "live_tournament_sync": {
          result = await ctx.runAction(
            internal.functions.cronJobs.runLiveTournamentSync,
            { tournamentId },
          );
          break;
        }
        case "create_groups_for_next_tournament": {
          if (!args.confirm) {
            const target = await ctx.runQuery(
              internal.functions.cronJobs.getCreateGroupsTarget,
              { tournamentId },
            );

            const [fieldUpdates, rankings] = await Promise.all([
              ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
                options: { tour: "pga" },
              }),
              ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
            ]);

            console.log(
              "[adminRunCronJob:preview] DataGolf field-updates payload",
              fieldUpdates,
            );

            const dataGolfEventName =
              typeof (fieldUpdates as { event_name?: unknown }).event_name ===
              "string"
                ? (fieldUpdates as { event_name: string }).event_name
                : "";

            const field = Array.isArray(
              (fieldUpdates as { field?: unknown }).field,
            )
              ? ((fieldUpdates as { field: unknown[] })
                  .field as FieldPlayerWithAllTeeTimes[])
              : [];

            const rankingsList = Array.isArray(
              (rankings as { rankings?: unknown }).rankings,
            )
              ? ((rankings as { rankings: unknown[] })
                  .rankings as RankedPlayer[])
              : [];

            const byDgId = new Map<number, RankedPlayer>();
            for (const r of rankingsList) byDgId.set(r.dg_id, r);

            const plannedGroups = await (async () => {
              if (
                target &&
                typeof target === "object" &&
                "skipped" in target &&
                (target as { skipped?: unknown }).skipped === true
              ) {
                return target;
              }

              if (!dataGolfEventName.trim()) {
                return {
                  ok: true,
                  skipped: true,
                  reason: "missing_datagolf_event_name",
                  dataGolfEventName,
                } as const;
              }

              const tournamentName =
                target &&
                typeof target === "object" &&
                "tournamentName" in target &&
                typeof (target as { tournamentName?: unknown })
                  .tournamentName === "string"
                  ? (target as { tournamentName: string }).tournamentName
                  : "";

              const compatible = eventNameLooksCompatible(
                tournamentName,
                dataGolfEventName,
              );

              if (!compatible.ok) {
                return {
                  ok: true,
                  skipped: true,
                  reason: "event_name_mismatch",
                  tournamentName,
                  dataGolfEventName,
                  score: compatible.score,
                  intersection: compatible.intersection,
                  expectedTokens: compatible.expectedTokens,
                  actualTokens: compatible.actualTokens,
                } as const;
              }

              const processed: EnhancedGolfer[] = field
                .filter((g) => !EXCLUDED_GOLFER_IDS.has(g.dg_id))
                .map((g) => ({ ...g, ranking: byDgId.get(g.dg_id) }))
                .sort(
                  (a, b) =>
                    (b.ranking?.dg_skill_estimate ?? -50) -
                    (a.ranking?.dg_skill_estimate ?? -50),
                );

              const groups: EnhancedGolfer[][] = [[], [], [], [], []];
              processed.forEach((g, index) => {
                const gi = determineGroupIndex(
                  index,
                  processed.length,
                  groups,
                  GROUP_LIMITS,
                );
                groups[gi]!.push(g);
              });

              const payload = groups.map((group, idx) => ({
                groupNumber: idx + 1,
                golfers: group.map((g) => ({
                  dgId: g.dg_id,
                  playerName: normalizePlayerNameFromDataGolf(g.player_name),
                  country: g.country,
                  worldRank: g.ranking?.owgr_rank,
                  rating: normalizeDgSkillEstimateToPgcRating(
                    g.ranking?.dg_skill_estimate ?? -1.875,
                  ),
                  ...(typeof g.r1_teetime === "string" &&
                  g.r1_teetime.trim().length
                    ? {
                        r1TeeTime: g.r1_teetime,
                        ...(typeof g.r2_teetime === "string" &&
                        g.r2_teetime.trim().length
                          ? { r2TeeTime: g.r2_teetime }
                          : {}),
                      }
                    : {}),
                  skillEstimate: g.ranking?.dg_skill_estimate,
                })),
              }));

              const resolvedTournamentId =
                target &&
                typeof target === "object" &&
                "tournamentId" in target &&
                typeof (target as { tournamentId?: unknown }).tournamentId ===
                  "string"
                  ? (target as { tournamentId: string }).tournamentId
                  : null;

              const tournamentGolfers = payload.flatMap((group) =>
                group.golfers.map((g) => ({
                  golferApiId: g.dgId,
                  group: group.groupNumber,
                  worldRank: g.worldRank ?? 501,
                  rating: g.rating,
                  ...(typeof g.r1TeeTime === "string"
                    ? { roundOneTeeTime: g.r1TeeTime }
                    : {}),
                  ...(typeof g.r2TeeTime === "string"
                    ? { roundTwoTeeTime: g.r2TeeTime }
                    : {}),
                })),
              );

              const apiIds = tournamentGolfers.map((g) => g.golferApiId);
              const lookups = await ctx.runQuery(
                internal.functions.cronJobs.getGolferIdsByApiIds,
                { apiIds },
              );

              const apiIdToGolferId = new Map<number, string>();
              for (const row of lookups) {
                if (row.golferId) apiIdToGolferId.set(row.apiId, row.golferId);
              }

              const missingGolferApiIds = tournamentGolfers
                .map((g) => g.golferApiId)
                .filter((apiId) => !apiIdToGolferId.has(apiId));

              const golfersToInsert = (() => {
                const byApiId = new Map<
                  number,
                  { apiId: number; playerName: string; country?: string }
                >();
                for (const group of payload) {
                  for (const g of group.golfers) {
                    if (!missingGolferApiIds.includes(g.dgId)) continue;
                    if (byApiId.has(g.dgId)) continue;
                    byApiId.set(g.dgId, {
                      apiId: g.dgId,
                      playerName: g.playerName,
                      ...(typeof g.country === "string" && g.country.trim()
                        ? { country: g.country }
                        : {}),
                    });
                  }
                }
                return Array.from(byApiId.values());
              })();

              const tournamentGolferInserts = tournamentGolfers.map((g) => ({
                tournamentId: resolvedTournamentId,
                golferId: apiIdToGolferId.get(g.golferApiId) ?? null,
                group: g.group,
                rating: g.rating,
                ...(typeof g.roundOneTeeTime === "string"
                  ? { roundOneTeeTime: g.roundOneTeeTime }
                  : {}),
                ...(typeof g.roundTwoTeeTime === "string"
                  ? { roundTwoTeeTime: g.roundTwoTeeTime }
                  : {}),
                worldRank: g.worldRank,
              }));

              return {
                ok: true,
                skipped: false,
                dataGolfEventName,
                totalGolfers: processed.length,
                tournamentId: resolvedTournamentId,
                groups: payload,
                tournamentGolfers: tournamentGolferInserts,
                missingGolferApiIds,
                golfersToInsert,
                groupSizes: payload.map((g) => ({
                  groupNumber: g.groupNumber,
                  golfers: g.golfers.length,
                })),
              } as const;
            })();

            result = {
              mode: "preview" as const,
              job: "create_groups_for_next_tournament" as const,
              target,
              cronOutput: plannedGroups,
              incoming: {
                fieldUpdates,
                rankings,
              },
            };
          } else {
            result = await ctx.runAction(
              internal.functions.cronJobs.runCreateGroupsForNextTournament,
              { tournamentId },
            );
          }
          break;
        }
        case "recompute_standings": {
          result = await ctx.runMutation(
            internal.functions.cronJobs.recomputeStandingsForCurrentSeason,
            {},
          );
          break;
        }
        default: {
          const exhaustiveCheck: never = args.job;
          throw new Error(`Unsupported job: ${exhaustiveCheck}`);
        }
      }

      const finishedAt = Date.now();
      return {
        ok: true,
        job: args.job,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        result,
      };
    } catch (err) {
      const finishedAt = Date.now();
      const message = err instanceof Error ? err.message : "Unknown error";
      const stack = err instanceof Error ? err.stack : undefined;
      return {
        ok: false,
        job: args.job,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        error: { message, stack },
      };
    }
  },
});

export const recomputeStandingsForSeason = internalMutation({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      return {
        ok: true,
        skipped: true,
        reason: "season_not_found",
        seasonId: args.seasonId,
      } as const;
    }

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    if (tourCards.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_tour_cards",
        seasonId: args.seasonId,
      } as const;
    }

    const calculations = await Promise.all(
      tourCards.map(async (tc) => {
        const teams = await ctx.db
          .query("teams")
          .withIndex("by_tour_card", (q) => q.eq("tourCardId", tc._id))
          .collect();

        const completed = teams
          .filter((t) => (t.round ?? 0) > 4)
          .sort((a, b) => a._creationTime - b._creationTime);

        const points = completed.reduce(
          (sum, t) => sum + Math.round(t.points ?? 0),
          0,
        );
        const earnings = completed.reduce(
          (sum, t) => sum + (t.earnings ?? 0),
          0,
        );

        return {
          tourCardId: tc._id,
          tourId: tc.tourId,
          win: completed.filter(
            (t) => parsePositionNumber(t.position ?? null) === 1,
          ).length,
          topTen: completed.filter((t) => {
            const posNum = parsePositionNumber(t.position ?? null);
            return posNum !== null && posNum <= 10;
          }).length,
          madeCut: completed.filter((t) => t.position !== "CUT").length,
          appearances: completed.length,
          points: Math.round(points),
          earnings: Math.round(earnings),
        };
      }),
    );

    const byTour = new Map<Id<"tours">, typeof calculations>();
    for (const calc of calculations) {
      const list = byTour.get(calc.tourId) ?? [];
      list.push(calc);
      byTour.set(calc.tourId, list);
    }

    let updated = 0;

    for (const list of byTour.values()) {
      const tour = await ctx.db.get(list[0].tourId);
      if (!tour) continue;

      for (const calc of list) {
        const samePointsCount = list.filter(
          (a) => a.points === calc.points,
        ).length;
        const betterPointsCount = list.filter(
          (a) => a.points > calc.points,
        ).length;
        const position = `${samePointsCount > 1 ? "T" : ""}${betterPointsCount + 1}`;

        const playoff =
          betterPointsCount < tour.playoffSpots[0]
            ? 1
            : betterPointsCount < tour.playoffSpots[1] + tour.playoffSpots[0]
              ? 2
              : 0;

        await ctx.db.patch(calc.tourCardId, {
          points: calc.points,
          earnings: calc.earnings,
          wins: calc.win,
          topTen: calc.topTen,
          madeCut: calc.madeCut,
          appearances: calc.appearances,
          currentPosition: position,
          playoff,
          updatedAt: Date.now(),
        });

        updated += 1;
      }
    }

    return {
      ok: true,
      skipped: false,
      seasonId: args.seasonId,
      tourCardsUpdated: updated,
    } as const;
  },
});

export const runCreateGroupsForNextTournament_Public: ReturnType<
  typeof action
> = action({
  args: cronJobsValidators.args.runCreateGroupsForNextTournament,
  handler: async (ctx, args) => {
    return await ctx.runAction(
      internal.functions.cronJobs.runCreateGroupsForNextTournament,
      args,
    );
  },
});

export const runLiveTournamentSync_Public: ReturnType<typeof action> = action({
  args: cronJobsValidators.args.runLiveTournamentSync,
  handler: async (ctx, args) => {
    return await ctx.runAction(
      internal.functions.cronJobs.runLiveTournamentSync,
      args,
    );
  },
});

export const recomputeStandingsForCurrentSeason_Public: ReturnType<
  typeof mutation
> = mutation({
  args: cronJobsValidators.args.recomputeStandingsForCurrentSeason,
  handler: async (ctx, _args) => {
    return await ctx.runMutation(
      internal.functions.cronJobs.recomputeStandingsForCurrentSeason,
      {},
    );
  },
});

export const updateGolfersWorldRankFromDataGolfInput_Public: ReturnType<
  typeof action
> = action({
  args: v.object({}),
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.functions.cronJobs.updateGolfersWorldRankFromDataGolfInput,
      {},
    );
  },
});
