import { api, internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { EXCLUDED_GOLFER_IDS, GROUP_LIMITS } from "../functions/_constants";
import { DataGolfFieldPlayer, DataGolfRankedPlayer } from "../types/datagolf";
import {
  checkCompatabilityOfEventNames,
  normalizePlayerNameFromDataGolf,
} from "../utils/datagolf";
import { determineGroupIndex } from "../utils/golfers";

type RankedFieldPlayer = DataGolfFieldPlayer & {
  ranking?: DataGolfRankedPlayer;
};

export const runCreateGroupsForNextTournament: ReturnType<
  typeof internalAction
> = internalAction({
  handler: async (ctx): Promise<unknown> => {
    const activeTournamentData = await ctx.runQuery(
      internal.functions.utils.getActiveTournamentData,
    );
    if (!activeTournamentData.ok) {
      console.log(
        "runCreateGroupsForNextTournament: skipped (no_active_tournament)",
      );
      return {
        ok: true,
        skipped: true,
        reason: "no_active_tournament",
      } as const;
    }
    const {
      tournament,
      playoffTournaments,
      isPlayoff,
      eventIndex,
      type: tournamentType,
    } = activeTournamentData;

    if (
      tournament.startDate > Date.now() &&
      tournament.startDate < Date.now() + 7 * 24 * 60 * 60 * 1000
    ) {
      console.log(
        "runCreateGroupsForNextTournament: skipped (no_next_tournament)",
        {
          tournamentId: tournament._id,
          tournamentName: tournament.name,
          tournamentType,
        },
      );
      return {
        ok: true,
        skipped: true,
        reason: "no_next_tournament",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        tournamentType,
      } as const;
    }

    if (isPlayoff && (eventIndex ?? 0) > 1 && playoffTournaments) {
      const duplicateResult = await ctx.runMutation(
        internal.crons.groups.duplicateFromPreviousPlayoff,
        {
          currentTournamentId: tournament._id ?? "",
          previousPlayoffTournamentId:
            playoffTournaments[(eventIndex ?? 2) - 2]?._id ?? "",
        },
      );

      return {
        ok: true,
        tournamentId: tournament._id ?? "",
        createGroups: duplicateResult,
      };
    }

    const tournamentForDataGolf = {
      _id: tournament._id,
      name: tournament.name,
      apiId: tournament.apiId,
      seasonId: tournament.seasonId,
    };
    let fieldUpdates: unknown;
    let rankings: unknown;
    try {
      const [fieldResult, rankingsResult] = await Promise.allSettled([
        ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
          tournament: tournamentForDataGolf,
        }),
        ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
      ]);
      if (fieldResult.status === "rejected") {
        throw fieldResult.reason;
      }
      if (rankingsResult.status === "rejected") {
        throw rankingsResult.reason;
      }
      fieldUpdates = fieldResult.value;
      rankings = rankingsResult.value;
    } catch (err) {
      return {
        ok: false,
        skipped: false,
        reason: "datagolf_fetch_failed",
        tournamentId: tournament?._id ?? null,
        error: err instanceof Error ? err.message : String(err),
      } as const;
    }
    const dataGolfEventName = (fieldUpdates as { event_name?: unknown })
      ?.event_name;
    if (typeof dataGolfEventName !== "string" || !dataGolfEventName) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_datagolf_event_name",
        tournamentId: tournament?._id ?? "",
        tournamentName: tournament?.name ?? "",
      } as const;
    }
    const compatible = checkCompatabilityOfEventNames(
      tournament?.name ?? "",
      dataGolfEventName,
    );
    if (!compatible.ok) {
      return {
        ok: true,
        skipped: true,
        reason: "event_name_mismatch",
        tournamentId: tournament?._id ?? "",
        tournamentName: tournament?.name ?? "",
        dataGolfEventName,
        score: compatible.score,
        intersection: compatible.intersection,
        expectedTokens: compatible.expectedTokens,
        actualTokens: compatible.actualTokens,
      } as const;
    }

    const field = Array.isArray((fieldUpdates as { field?: unknown }).field)
      ? ((fieldUpdates as { field: unknown[] }).field as DataGolfFieldPlayer[])
      : [];
    const rankingsList = Array.isArray(
      (rankings as { rankings?: unknown }).rankings,
    )
      ? ((rankings as { rankings: unknown[] })
          .rankings as DataGolfRankedPlayer[])
      : [];
    const byDgId = new Map<number, DataGolfRankedPlayer>();
    for (const r of rankingsList) byDgId.set(r.dg_id, r);
    const processed: RankedFieldPlayer[] = field
      .filter((g) => !EXCLUDED_GOLFER_IDS.has(g.dg_id))
      .map((g) => ({ ...g, ranking: byDgId.get(g.dg_id) }))
      .sort(
        (a, b) =>
          (b.ranking?.dg_skill_estimate ?? -50) -
          (a.ranking?.dg_skill_estimate ?? -50),
      );

    const groups: RankedFieldPlayer[][] = [[], [], [], [], []];
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
      internal.functions.golfers.createTournamentGolfers,
      {
        tournamentId: tournament._id,
        groups: groups.map((group, idx) => ({
          groupNumber: idx + 1,
          golfers: group.map((g) => ({
            dgId: g.dg_id,
            playerName: normalizePlayerNameFromDataGolf(g.player_name),
            country: g.country,
            worldRank: g.ranking?.owgr_rank,
            ...(typeof g.teetimes.find((tt) => tt.round_num === 1)?.teetime ===
            "number"
              ? {
                  r1TeeTime: g.teetimes.find((tt) => tt.round_num === 1)
                    ?.teetime,
                }
              : {}),
            ...(typeof g.teetimes.find((tt) => tt.round_num === 2)?.teetime ===
            "number"
              ? {
                  r2TeeTime: g.teetimes.find((tt) => tt.round_num === 2)
                    ?.teetime,
                }
              : {}),
            skillEstimate: g.ranking?.dg_skill_estimate,
          })),
        })),
      },
    );

    return {
      ok: true,
      tournamentId: tournament?._id ?? "",
      createGroups: createResult,
    };
  },
});

export const duplicateFromPreviousPlayoff = internalMutation({
  args: {
    currentTournamentId: v.id("tournaments"),
    previousPlayoffTournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const previousTournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.previousPlayoffTournamentId),
      )
      .collect();

    const previousTournamentTeams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.previousPlayoffTournamentId),
      )
      .collect();

    let golfersCopied = 0;
    let teamsCopied = 0;
    const groupSet = new Set<number>();

    for (const tg of previousTournamentGolfers) {
      if (tg.group) groupSet.add(tg.group);

      const existingTournamentGolfer = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q
            .eq("golferId", tg.golferId)
            .eq("tournamentId", args.currentTournamentId),
        )
        .first();

      if (existingTournamentGolfer) continue;

      await ctx.db.insert("tournamentGolfers", {
        golferId: tg.golferId,
        tournamentId: args.currentTournamentId,
        group: tg.group,
        rating: tg.rating,
        worldRank: tg.worldRank,
        updatedAt: Date.now(),
      });
      golfersCopied += 1;
    }

    for (const team of previousTournamentTeams) {
      const existingTeam = await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q
            .eq("tournamentId", args.currentTournamentId)
            .eq("tourCardId", team.tourCardId),
        )
        .first();

      if (existingTeam) continue;

      await ctx.db.insert("teams", {
        tournamentId: args.currentTournamentId,
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
      tournamentId: args.currentTournamentId,
      copiedFromTournamentId: args.previousPlayoffTournamentId,
      golfersCopied,
      teamsCopied,
      groupsCreated: groupSet.size,
    } as const;
  },
});
