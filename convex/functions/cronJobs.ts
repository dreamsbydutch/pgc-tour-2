import {
  action,
  internalAction,
  internalMutation,
  type ActionCtx,
} from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type {
  DataGolfFieldPlayer,
  DataGolfFieldUpdatesResponse,
  DataGolfHistoricalPlayer,
  DataGolfLiveModelPlayer,
  DataGolfRankedPlayer,
  DataGolfRankingsResponse,
} from "../types/datagolf";
import { EXCLUDED_GOLFER_IDS, GROUP_LIMITS, MS_PER_DAY } from "./_constants";
import {
  isRoundRunningFromLiveStats,
  normalizePlayerNameFromDataGolf,
  parseDataGolfTeeTimeToMs,
} from "../utils/datagolf";
import {
  awardTeamEarnings,
  awardTeamPlayoffPoints,
  buildUsageRateByGolferApiId,
  earliestTimeStr,
  roundToDecimalPlace,
} from "../utils";
import { determineGroupIndex } from "../utils/golfers";
import { v } from "convex/values";

type FieldUpdatesSkipResult = {
  ok: false;
  skipped: true;
  reason:
    | "missing_tournament_api_id"
    | "missing_datagolf_event_name"
    | "event_name_mismatch"
    | "empty_data"
    | "empty_field";
  tournamentId: Id<"tournaments">;
  tournamentName: string;
  dataGolfEventName?: string;
  score?: number;
  intersection?: string[];
  expectedTokens?: string[];
  actualTokens?: string[];
};
type RankingsSkipResult = {
  ok: false;
  skipped: true;
  reason: "empty_rankings";
};

/**
 * Fetches the latest DataGolf rankings and applies OWGR/country/name updates into `golfers`.
 *
 * This is an `internalAction` because it needs to call the DataGolf API.
 */
export const updateGolfersWorldRankFromDataGolfInput: ReturnType<
  typeof internalAction
> = internalAction({
  handler: async (ctx) => {
    let rankingsResponse;
    try {
      rankingsResponse = await ctx.runAction(
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
    if (!("rankings" in rankingsResponse)) {
      return {
        ok: true,
        skipped: true,
        reason: rankingsResponse.reason,
        rankingsFetched: 0,
      } as const;
    }

    const rankingsList = rankingsResponse.rankings;
    const result = await ctx.runMutation(
      internal.functions.golfers.upsertGolfers,
      {
        golfers: rankingsList.map((r) => ({
          apiId: r.dg_id,
          playerName: r.player_name,
          country: r.country,
          worldRank: r.owgr_rank,
        })),
      },
    );

    return {
      ...result,
      rankingsFetched: rankingsList.length,
    } as const;
  },
});
export const updateGolfersWorldRankFromDataGolfInput_Public: ReturnType<
  typeof action
> = action({
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.functions.cronJobs.updateGolfersWorldRankFromDataGolfInput,
      {},
    );
  },
});

/**
 * Creates groups and tournament golfers for the next scheduled tournament.
 *
 * What it does:
 * - Loads the "next" tournament.
 * - Checks to make sure that it is not more than 5 days away and doesn't already have golfers.
 * - Uses DataGolf field updates + rankings to build a ranked field.
 * - Splits the field into groups based on configured group limits.
 * - Inserts tournament golfers/groups via the golfers module.
 * - For playoffs beyond the first event, duplicates golfers/teams from the previous playoff event instead of creating new groups.
 *
 */
export const runCreateGroupsForNextTournament: ReturnType<
  typeof internalAction
> = internalAction({
  handler: async (ctx): Promise<unknown> => {
    const nextTournament = await ctx.runQuery(
      internal.functions.tournaments.getNextTournament_Internal,
    );
    if (!nextTournament.ok) {
      console.log(
        "runCreateGroupsForNextTournament: skipped (no_upcoming_tournament)",
      );
      return {
        ok: true,
        skipped: true,
        reason: "no_upcoming_tournament",
      } as const;
    }

    const existingGolfers = await ctx.runQuery(
      internal.functions.golfers.getTournamentGolfersByTournamentId,
      { tournamentId: nextTournament.tournament._id },
    );
    if (existingGolfers.length > 0) {
      console.log(
        "runCreateGroupsForNextTournament: skipped (tournament_already_has_golfers)",
        {
          tournamentId: nextTournament.tournament._id,
          tournamentName: nextTournament.tournament.name,
          golfersCount: existingGolfers.length,
        },
      );
      return {
        ok: true,
        skipped: true,
        reason: "tournament_already_has_golfers",
        tournamentId: nextTournament.tournament._id,
        tournamentName: nextTournament.tournament.name,
        golfersCount: existingGolfers.length,
      } as const;
    }

    const tournament = nextTournament.tournament;
    const playoffInfo = await ctx.runQuery(
      internal.functions.utils.isPlayoffTournament,
      { tournamentId: tournament._id },
    );
    if (tournament.startDate > Date.now() + MS_PER_DAY * 5) {
      console.log(
        "runCreateGroupsForNextTournament: skipped (tournament_out_of_range)",
        {
          tournamentId: tournament._id,
          tournamentName: tournament.name,
        },
      );
      return {
        ok: true,
        skipped: true,
        reason: "tournament_out_of_range",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
      } as const;
    }

    if (playoffInfo.isPlayoff && (playoffInfo.eventIndex ?? 0) > 1) {
      const createResult = await ctx.runMutation(
        internal.functions.utils.duplicateFromPreviousPlayoff,
        {
          currentTournamentId: tournament._id,
          previousPlayoffTournamentId: playoffInfo.firstPlayoffEvent._id,
        },
      );

      return {
        ok: true,
        skipped: false,
        reason: "duplicated_previous_playoff",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        createGroups: createResult,
      } as const;
    }

    let fieldResponse: DataGolfFieldUpdatesResponse | FieldUpdatesSkipResult;
    let rankingsResponse: DataGolfRankingsResponse | RankingsSkipResult;
    try {
      const [fieldResult, rankingsResult] = await Promise.allSettled([
        ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
          tournament: {
            _id: tournament._id,
            name: tournament.name,
            apiId: tournament.apiId,
            seasonId: tournament.seasonId,
          },
        }),
        ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
      ]);
      if (fieldResult.status === "rejected") {
        throw fieldResult.reason;
      }
      if (rankingsResult.status === "rejected") {
        throw rankingsResult.reason;
      }
      fieldResponse = fieldResult.value;
      rankingsResponse = rankingsResult.value;
    } catch (err) {
      return {
        ok: false,
        skipped: false,
        reason: "datagolf_fetch_failed",
        tournamentId: tournament?._id ?? null,
        error: err instanceof Error ? err.message : String(err),
      } as const;
    }

    if (!("field" in fieldResponse)) {
      return {
        ok: true,
        skipped: true,
        reason: fieldResponse.reason,
        tournamentId: fieldResponse.tournamentId,
        tournamentName: fieldResponse.tournamentName,
        ...(fieldResponse.dataGolfEventName
          ? { dataGolfEventName: fieldResponse.dataGolfEventName }
          : {}),
        ...(typeof fieldResponse.score === "number"
          ? { score: fieldResponse.score }
          : {}),
        ...(fieldResponse.intersection
          ? { intersection: fieldResponse.intersection }
          : {}),
        ...(fieldResponse.expectedTokens
          ? { expectedTokens: fieldResponse.expectedTokens }
          : {}),
        ...(fieldResponse.actualTokens
          ? { actualTokens: fieldResponse.actualTokens }
          : {}),
      } as const;
    }

    if (!("rankings" in rankingsResponse)) {
      return {
        ok: true,
        skipped: true,
        reason: rankingsResponse.reason,
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        rankingsFetched: 0,
      } as const;
    }

    const field = fieldResponse.field;
    const rankingsList = rankingsResponse.rankings;
    const byDgId = new Map<number, DataGolfRankedPlayer>();
    for (const r of rankingsList) byDgId.set(r.dg_id, r);
    const processed: (DataGolfFieldPlayer & {
      ranking?: DataGolfRankedPlayer;
    })[] = field
      .filter((g: DataGolfFieldPlayer) => !EXCLUDED_GOLFER_IDS.has(g.dg_id))
      .map((g: DataGolfFieldPlayer) => ({ ...g, ranking: byDgId.get(g.dg_id) }))
      .sort(
        (
          a: DataGolfFieldPlayer & { ranking?: DataGolfRankedPlayer },
          b: DataGolfFieldPlayer & { ranking?: DataGolfRankedPlayer },
        ) =>
          (b.ranking?.dg_skill_estimate ?? -50) -
          (a.ranking?.dg_skill_estimate ?? -50),
      );

    if (processed.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_eligible_golfers",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        golfersExcluded: field.length,
      } as const;
    }

    const groups: (DataGolfFieldPlayer & {
      ranking?: DataGolfRankedPlayer;
    })[][] = [[], [], [], [], []];
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
      skipped: false,
      reason: "groups_created",
      tournamentId: tournament._id,
      tournamentName: tournament.name,
      golfersProcessed: processed.length,
      rankingsFetched: rankingsList.length,
      createGroups: createResult,
    } as const;
  },
});
export const runCreateGroupsForNextTournament_Public: ReturnType<
  typeof action
> = action({
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.functions.cronJobs.runCreateGroupsForNextTournament,
      {},
    );
  },
});

/**
 * Recomputes season standings for all tour cards.
 *
 * What it does:
 * - Loads the current season.
 * - Aggregates completed team results into per-tour-card totals (points, earnings, wins, top tens, cuts).
 * - Assigns positions within each tour (with tie prefixes) and updates playoff qualification flags.
 */
export const recomputeStandings = internalMutation({
  args: { seasonId: v.optional(v.id("seasons")) },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true; skipped: boolean; seasonId: Id<"seasons"> } | { ok: false }
  > => {
    const now = new Date().getFullYear();
    const currentSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", now))
      .first();
    if (!currentSeason) {
      return { ok: false };
    }
    const updated = await ctx.runMutation(
      internal.functions.tourCards.updateTourCards,
      { seasonId: args.seasonId ?? currentSeason._id },
    );
    return {
      ok: true,
      skipped: false,
      seasonId: args.seasonId ?? currentSeason._id,
    } as const;
  },
});
export const recomputeStandings_Public: ReturnType<typeof action> = action({
  args: { seasonId: v.optional(v.id("seasons")) },
  handler: async (ctx, args) => {
    return await ctx.runMutation(
      internal.functions.cronJobs.recomputeStandings,
      { seasonId: args.seasonId },
    );
  },
});

// =============================================================================
// TOURNAMENT SYNC TYPES
// =============================================================================

type TeeTimeEntry = DataGolfFieldPlayer["teetimes"][number];

type SyncGolfer = {
  tournamentGolfer: Doc<"tournamentGolfers">;
  golfer?: Doc<"golfers">;
  field?: DataGolfFieldPlayer;
  ranking?: DataGolfRankedPlayer;
  live?: DataGolfLiveModelPlayer;
  historical?: DataGolfHistoricalPlayer;
};

type SyncTeam = Doc<"teams"> & {
  golfers: SyncGolfer[];
  tourCard?: Doc<"tourCards">;
  tour?: Doc<"tours">;
};

type ComputedTeam = Doc<"teams"> & {
  tour?: Doc<"tours">;
  tourCard?: Doc<"tourCards">;
};

const NON_PLAYING_STATUSES = ["CUT", "WD", "DQ", ""] as const;

// =============================================================================
// TOURNAMENT SYNC HELPERS — pure computation, no side effects
// =============================================================================

function isOutsideSyncWindow(now: Date): boolean {
  return now.getHours() <= 12 && now.getHours() >= 2;
}

function isNonPlayingStatus(position: string): boolean {
  return (NON_PLAYING_STATUSES as readonly string[]).includes(position);
}

function golferSortScore(live: DataGolfLiveModelPlayer | undefined): number {
  return isNonPlayingStatus(live?.current_pos ?? "")
    ? 999
    : (live?.current_score ?? 0);
}

function golferSortScoreYesterday(
  live: DataGolfLiveModelPlayer | undefined,
): number {
  return isNonPlayingStatus(live?.current_pos ?? "")
    ? 999
    : (live?.current_score ?? 0) - (live?.today ?? 0);
}

function parseThru(thru: string | undefined): number {
  if (thru === "F") return 18;
  return parseInt(thru ?? "0");
}

function isRoundComplete(
  roundNum: number,
  currentRound: number,
  isRoundRunning: boolean,
): boolean {
  return (
    currentRound > roundNum || (currentRound === roundNum && !isRoundRunning)
  );
}

function resolveRoundScore(
  liveScore: number | undefined,
  historicalScore: number | undefined,
  existingScore: number | undefined,
  fallback: number | undefined,
): number | undefined {
  if (liveScore && liveScore > 0) return liveScore;
  if (historicalScore && historicalScore > 0) return historicalScore;
  if (existingScore && existingScore > 0) return existingScore;
  return fallback;
}

function resolveRoundTeeTime(
  g: SyncGolfer,
  roundNum: number,
): number | undefined {
  const fieldTeeTime = g.field?.teetimes.find(
    (tt: TeeTimeEntry) => tt.round_num === roundNum,
  )?.teetime;
  if (fieldTeeTime !== undefined) return fieldTeeTime;

  const roundKey = `round_${roundNum}` as
    | "round_1"
    | "round_2"
    | "round_3"
    | "round_4";
  const historicalTeeTime = g.historical?.[roundKey]?.teetime;
  if (historicalTeeTime) return historicalTeeTime;

  const teeTimeKeys = {
    round_1: "roundOneTeeTime",
    round_2: "roundTwoTeeTime",
    round_3: "roundThreeTeeTime",
    round_4: "roundFourTeeTime",
  } as const;
  const existingTeeTime = g.tournamentGolfer?.[teeTimeKeys[roundKey]];
  if (typeof existingTeeTime === "number") return existingTeeTime;
  return parseDataGolfTeeTimeToMs(existingTeeTime as string) ?? undefined;
}

function computeGolferScore(g: SyncGolfer): number | undefined {
  if (g.live?.current_score !== undefined) return g.live.current_score;
  if (g.historical) {
    return roundToDecimalPlace(
      (g.historical.round_1?.score ?? 0) -
        (g.historical.round_1?.course_par ?? 0) +
        ((g.historical.round_2?.score ?? 0) -
          (g.historical.round_2?.course_par ?? 0)) +
        ((g.historical.round_3?.score ?? 0) -
          (g.historical.round_3?.course_par ?? 0)) +
        ((g.historical.round_4?.score ?? 0) -
          (g.historical.round_4?.course_par ?? 0)),
    );
  }
  if (g.tournamentGolfer.score) {
    return roundToDecimalPlace(g.tournamentGolfer.score);
  }
  return undefined;
}

function computeGolferRoundNumber(
  g: SyncGolfer,
  isRoundRunning: boolean,
): number {
  const thru = parseThru(g.live?.thru);
  const r1 = g.live?.R1 ?? g.historical?.round_1?.score ?? 0;
  const r2 = g.live?.R2 ?? g.historical?.round_2?.score ?? 0;
  const r3 = g.live?.R3 ?? g.historical?.round_3?.score ?? 0;
  const r4 = g.live?.R4 ?? g.historical?.round_4?.score ?? 0;
  const status = g.live?.current_pos ?? g.historical?.fin_text ?? "";
  const halfRound = !isRoundRunning ? 0.5 : 0;

  if (
    (r1 > 0 && r2 > 0 && r3 > 0 && r4 > 0) ||
    ["CUT", "WD", "DQ"].includes(status)
  )
    return halfRound + 5;
  if (r1 > 0 && r2 > 0 && r3 > 0 && thru > 0) return halfRound + 4;
  if (r1 > 0 && r2 > 0 && thru > 0) return halfRound + 3;
  if (r1 > 0 && thru > 0) return halfRound + 2;
  if (thru > 0) return halfRound + 1;
  return 0;
}

function computeGolferToday(
  g: SyncGolfer,
  currentRound: number,
): number | undefined {
  const status =
    g.live?.current_pos ??
    g.historical?.fin_text ??
    g.tournamentGolfer?.position ??
    "";
  if (isNonPlayingStatus(status)) return undefined;
  if (g.live?.today !== undefined) return g.live.today;
  if (currentRound === 4 && g.historical?.round_4) {
    return (
      (g.historical.round_4.score ?? 0) - (g.historical.round_4.course_par ?? 0)
    );
  }
  return g.tournamentGolfer?.today ?? undefined;
}

function computeGolferThru(
  g: SyncGolfer,
  isRoundRunning: boolean,
): number | undefined {
  const status =
    g.live?.current_pos ??
    g.historical?.fin_text ??
    g.tournamentGolfer?.position ??
    "";
  if (isNonPlayingStatus(status)) return undefined;
  if (g.live?.thru) return parseInt(g.live.thru);
  return !isRoundRunning ? 18 : 0;
}

type GolferUpdatePayload = {
  _id: Id<"tournamentGolfers">;
  tournamentId: Id<"tournaments">;
  golferId: Id<"golfers">;
  position: string | undefined;
  posChange: number;
  score: number | undefined;
  endHole: number | undefined;
  makeCut: number | undefined;
  topTen: number | undefined;
  win: number | undefined;
  today: number | undefined;
  thru: number | undefined;
  roundOne: number | undefined;
  roundTwo: number | undefined;
  roundThree: number | undefined;
  roundFour: number | undefined;
  roundOneTeeTime: number | undefined;
  roundTwoTeeTime: number | undefined;
  roundThreeTeeTime: number | undefined;
  roundFourTeeTime: number | undefined;
  usage: number;
  round: number;
};

function buildGolferUpdatePayload(
  g: SyncGolfer,
  allGolfers: SyncGolfer[],
  tournamentId: Id<"tournaments">,
  coursePar: number,
  usageRate: number,
  currentRound: number,
  isRoundRunning: boolean,
): GolferUpdatePayload | null {
  if (!g.golfer?._id || !g.tournamentGolfer?._id) return null;

  const myScore = golferSortScore(g.live);
  const myScoreYesterday = golferSortScoreYesterday(g.live);
  const betterGolfers = allGolfers.filter(
    (og) => golferSortScore(og.live) < myScore,
  ).length;
  const betterGolfersPast = allGolfers.filter(
    (og) => golferSortScoreYesterday(og.live) < myScoreYesterday,
  ).length;
  const tiedGolfers = allGolfers.filter(
    (og) => golferSortScore(og.live) === myScore,
  ).length;

  const cutFallback = coursePar + 8;

  return {
    _id: g.tournamentGolfer._id,
    tournamentId,
    golferId: g.golfer._id,
    position: isNonPlayingStatus(g.live?.current_pos ?? "")
      ? g.live?.current_pos
      : tiedGolfers > 1
        ? `T${betterGolfers + 1}`
        : `${betterGolfers + 1}`,
    posChange: betterGolfersPast - betterGolfers,
    score: computeGolferScore(g),
    endHole: g.live?.end_hole ?? g.tournamentGolfer?.endHole ?? undefined,
    makeCut: g.live?.make_cut ?? g.tournamentGolfer?.makeCut ?? undefined,
    topTen: g.live?.top_10 ?? g.tournamentGolfer?.topTen ?? undefined,
    win: g.live?.win ?? g.tournamentGolfer?.win ?? undefined,
    today: computeGolferToday(g, currentRound),
    thru: computeGolferThru(g, isRoundRunning),
    roundOne: isRoundComplete(1, currentRound, isRoundRunning)
      ? resolveRoundScore(
          g.live?.R1,
          g.historical?.round_1?.score,
          g.tournamentGolfer?.roundOne,
          cutFallback,
        )
      : undefined,
    roundTwo: isRoundComplete(2, currentRound, isRoundRunning)
      ? resolveRoundScore(
          g.live?.R2,
          g.historical?.round_2?.score,
          g.tournamentGolfer?.roundTwo,
          cutFallback,
        )
      : undefined,
    roundThree: isRoundComplete(3, currentRound, isRoundRunning)
      ? resolveRoundScore(
          g.live?.R3,
          g.historical?.round_3?.score,
          g.tournamentGolfer?.roundThree,
          undefined,
        )
      : undefined,
    roundFour: isRoundComplete(4, currentRound, isRoundRunning)
      ? resolveRoundScore(
          g.live?.R4,
          g.historical?.round_4?.score,
          g.tournamentGolfer?.roundFour,
          undefined,
        )
      : undefined,
    roundOneTeeTime: resolveRoundTeeTime(g, 1),
    roundTwoTeeTime: resolveRoundTeeTime(g, 2),
    roundThreeTeeTime: resolveRoundTeeTime(g, 3),
    roundFourTeeTime: resolveRoundTeeTime(g, 4),
    usage: usageRate,
    round: computeGolferRoundNumber(g, isRoundRunning),
  };
}

function determineTournamentStatus(
  existingStatus: Doc<"tournaments">["status"],
  currentRound: number,
  isRoundRunning: boolean,
): "upcoming" | "active" | "completed" | undefined {
  if (existingStatus === "completed") return "completed";
  if (currentRound >= 4 && !isRoundRunning) return "completed";
  if (existingStatus === "active") return "active";
  if (currentRound > 0 || isRoundRunning) return "active";
  if (existingStatus === "upcoming") return "upcoming";
  return undefined;
}

function computeTeamRound(team: SyncTeam): {
  currentRound: number;
  isRoundRunning: boolean;
} {
  const currentRound = Math.max(
    ...team.golfers.map((g) => g.live?.round ?? (g.historical ? 5 : 0)),
    0,
  );
  const isRoundRunning =
    team.golfers.filter(
      (g) =>
        !(
          g.live?.thru === "F" ||
          g.live?.thru === "18" ||
          g.live?.thru === "0"
        ),
    ).length > 0;
  return { currentRound, isRoundRunning };
}

function computeTeamRoundAvg(
  teamGolfers: SyncGolfer[],
  roundNum: 1 | 2 | 3 | 4,
  currentRound: number,
  isRoundRunning: boolean,
): number | undefined {
  if (!isRoundComplete(roundNum, currentRound, isRoundRunning))
    return undefined;

  const liveKeys = { 1: "R1", 2: "R2", 3: "R3", 4: "R4" } as const;
  const histKeys = {
    1: "round_1",
    2: "round_2",
    3: "round_3",
    4: "round_4",
  } as const;
  const existKeys = {
    1: "roundOne",
    2: "roundTwo",
    3: "roundThree",
    4: "roundFour",
  } as const;

  let scores = teamGolfers.map(
    (x) =>
      x.live?.[liveKeys[roundNum]] ??
      x.historical?.[histKeys[roundNum]]?.score ??
      x.tournamentGolfer?.[existKeys[roundNum]],
  );

  const topN = roundNum >= 3 ? 5 : 10;
  if (roundNum >= 3) {
    scores = scores
      .sort(
        (a, b) => (a === 0 ? 500 : (a ?? 500)) - (b === 0 ? 500 : (b ?? 500)),
      )
      .slice(0, topN);
  }

  const sum = scores.reduce((acc, val) => (acc ?? 0) + (val ?? 0), 0) ?? 0;
  return roundToDecimalPlace(sum / topN, 1);
}

function computeTeamTodayAvg(
  teamGolfers: SyncGolfer[],
  currentRound: number,
): number {
  const topN = currentRound >= 3 ? 5 : 10;
  const eligible = teamGolfers.filter(
    (g) => !isNonPlayingStatus(g.tournamentGolfer?.position ?? ""),
  );

  const sorted = eligible.sort((a, b) => {
    const aToday =
      a.live?.today ??
      (a.historical?.round_4
        ? (a.historical.round_4.score ?? 0) -
          (a.historical.round_4.course_par ?? 0)
        : 500);
    const bToday =
      b.live?.today ??
      (b.historical?.round_4
        ? (b.historical.round_4.score ?? 0) -
          (b.historical.round_4.course_par ?? 0)
        : 500);
    return aToday - bToday;
  });

  const sum =
    sorted
      .slice(0, topN)
      .reduce(
        (acc, val) =>
          (acc ?? 0) +
          (val.live?.today ??
            (val.historical?.round_4
              ? (val.historical.round_4.score ?? 0) -
                (val.historical.round_4.course_par ?? 0)
              : 0)),
        0,
      ) ?? 0;

  return roundToDecimalPlace(sum / topN, 1);
}

function computeTeamThruAvg(
  teamGolfers: SyncGolfer[],
  currentRound: number,
): number {
  const topN = currentRound >= 3 ? 5 : 10;
  const eligible = teamGolfers
    .filter((g) => !isNonPlayingStatus(g.tournamentGolfer?.position ?? ""))
    .sort((a, b) => (a.live?.today ?? 500) - (b.live?.today ?? 500));

  const sum =
    eligible
      .slice(0, topN)
      .reduce((acc, val) => (acc ?? 0) + parseThru(val.live?.thru), 0) ?? 0;

  return roundToDecimalPlace(sum / topN, 1);
}

function getTeamRoundTeeTime(
  teamGolfers: SyncGolfer[],
  roundNum: number,
  topSlice?: number,
): number | undefined {
  let teeTimes = teamGolfers.map((g) => resolveRoundTeeTime(g, roundNum));
  if (topSlice) {
    teeTimes = teeTimes.sort((a, b) => (a ?? 0) - (b ?? 0)).slice(-topSlice);
  }
  return earliestTimeStr(teeTimes);
}

function computeTeamScore(
  roundAvgs: {
    roundOne: number | undefined;
    roundTwo: number | undefined;
    roundThree: number | undefined;
    roundFour: number | undefined;
  },
  coursePar: number,
  teamGolfers: SyncGolfer[],
  currentRound: number,
  isRoundRunning: boolean,
): number {
  const { roundOne, roundTwo, roundThree, roundFour } = roundAvgs;
  let total =
    (roundOne && roundOne > 0 ? roundOne - coursePar : 0) +
    (roundTwo && roundTwo > 0 ? roundTwo - coursePar : 0) +
    (roundThree && roundThree > 0 ? roundThree - coursePar : 0) +
    (roundFour && roundFour > 0 ? roundFour - coursePar : 0);

  if (isRoundRunning) {
    const topN = currentRound >= 3 ? 5 : 10;
    const liveContribution =
      (teamGolfers
        .sort((a, b) => (a.live?.today ?? 500) - (b.live?.today ?? 500))
        .slice(0, topN)
        .reduce((sum, val) => (sum ?? 0) + (val.live?.today ?? 0), 0) ?? 0) /
      topN;
    total += liveContribution;
  }

  return roundToDecimalPlace(total, 1);
}

function buildTeamAggregates(team: SyncTeam, coursePar: number): ComputedTeam {
  const { currentRound, isRoundRunning } = computeTeamRound(team);

  const roundOne = computeTeamRoundAvg(
    team.golfers,
    1,
    currentRound,
    isRoundRunning,
  );
  const roundTwo = computeTeamRoundAvg(
    team.golfers,
    2,
    currentRound,
    isRoundRunning,
  );
  const roundThree = computeTeamRoundAvg(
    team.golfers,
    3,
    currentRound,
    isRoundRunning,
  );
  const roundFour = computeTeamRoundAvg(
    team.golfers,
    4,
    currentRound,
    isRoundRunning,
  );

  return {
    ...team,
    score: computeTeamScore(
      { roundOne, roundTwo, roundThree, roundFour },
      coursePar,
      team.golfers,
      currentRound,
      isRoundRunning,
    ),
    today: computeTeamTodayAvg(team.golfers, currentRound),
    thru: computeTeamThruAvg(team.golfers, currentRound),
    round: currentRound,
    roundOneTeeTime: getTeamRoundTeeTime(team.golfers, 1),
    roundOne,
    roundTwoTeeTime: getTeamRoundTeeTime(team.golfers, 2),
    roundTwo,
    roundThreeTeeTime: getTeamRoundTeeTime(team.golfers, 3, 5),
    roundThree,
    roundFourTeeTime: getTeamRoundTeeTime(team.golfers, 4, 5),
    roundFour,
  };
}

function computeTeamPositionData(
  team: ComputedTeam,
  allTeams: ComputedTeam[],
): {
  position: string;
  pastPosition: string;
  teamsAhead: number;
  teamsTied: number;
} {
  const tourId = team.tour?._id;
  const tourTeams = allTeams.filter((ut) => ut.tour?._id === tourId);

  const teamsAhead = tourTeams.filter(
    (ut) => (ut.score ?? 0) < (team.score ?? 0),
  ).length;
  const teamsAheadPast = tourTeams.filter(
    (ut) =>
      (ut.score ?? 0) - (ut.today ?? 0) < (team.score ?? 0) - (team.today ?? 0),
  ).length;
  const teamsTied = tourTeams.filter(
    (ut) => (ut.score ?? 0) === (team.score ?? 0),
  ).length;
  const teamsTiedPast = tourTeams.filter(
    (ut) =>
      (ut.score ?? 0) - (ut.today ?? 0) ===
      (team.score ?? 0) - (team.today ?? 0),
  ).length;

  return {
    position: teamsTied > 1 ? `T${teamsAhead + 1}` : `${teamsAhead + 1}`,
    pastPosition:
      teamsTiedPast > 1 ? `T${teamsAheadPast + 1}` : `${teamsAheadPast + 1}`,
    teamsAhead,
    teamsTied,
  };
}

// =============================================================================
// TOURNAMENT SYNC — ctx-dependent helpers
// =============================================================================

async function fillIncompleteTeamRosters(
  ctx: ActionCtx,
  teams: SyncTeam[],
  golfers: SyncGolfer[],
): Promise<void> {
  for (const t of teams) {
    if (t.golfers?.length >= 10) continue;

    for (let group = 1; group <= 5; group++) {
      const count =
        t.golfers?.filter((g) => g.tournamentGolfer?.group === group).length ??
        0;
      if (count >= 2) continue;

      const availableGolfers = golfers
        .filter(
          (g) =>
            g.tournamentGolfer?.group === group &&
            g.golfer?.apiId &&
            !t.golfers?.some((tg) => tg.golfer?.apiId === g.golfer?.apiId),
        )
        .sort((a, b) => {
          const aRank = a.ranking?.owgr_rank ?? Number.POSITIVE_INFINITY;
          const bRank = b.ranking?.owgr_rank ?? Number.POSITIVE_INFINITY;
          return aRank - bRank;
        });

      const currentApiIds = t.golfers.map((g) => g.golfer?.apiId ?? -1);
      const fillCount = count === 2 ? 2 : 1;
      const newApiIds = availableGolfers
        .slice(0, fillCount)
        .map((g) => g.golfer?.apiId ?? -1);

      await ctx.runMutation(api.functions.teams.updateTeamRoster, {
        teamId: t._id,
        apiIds: [...currentApiIds, ...newApiIds],
      });
    }
  }
}

async function handlePreTournamentSync(
  ctx: ActionCtx,
  tournament: Doc<"tournaments">,
  golfers: SyncGolfer[],
  fieldData: { field: DataGolfFieldPlayer[] },
  now: Date,
): Promise<unknown> {
  if (
    Math.abs(tournament.startDate - now.getTime()) >
    1000 * 60 * 60 * 24 * 6
  ) {
    console.log(
      "runTournamentSync: skipped (next_tournament_not_starting_soon)",
      {
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        startDate: tournament.startDate,
      },
    );
    return {
      ok: true,
      skipped: true,
      reason: "next_tournament_not_starting_soon",
      tournamentId: tournament._id,
      tournamentName: tournament.name,
    } as const;
  }

  if (tournament.startDate < now.getTime()) {
    console.log(
      "runTournamentSync: skipped (next_tournament_toggled_to_active)",
      {
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        startDate: tournament.startDate,
      },
    );
    await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
      tournament: { _id: tournament._id, status: "active" },
    });
    return {
      ok: true,
      skipped: true,
      reason: "next_tournament_toggled_to_active",
      tournamentId: tournament._id,
      tournamentName: tournament.name,
    } as const;
  }

  if (golfers.length > 0) {
    const golferApiIds = new Set(golfers.map((g) => g.golfer?.apiId));
    const newGolfers = fieldData.field
      .filter((fg) => fg.dg_id && !golferApiIds.has(fg.dg_id))
      .map((fg) => {
        const focusGolfer = golfers.find((g) => g.golfer?.apiId === fg.dg_id);
        return {
          dg_id: fg.dg_id!,
          player_name: normalizePlayerNameFromDataGolf(fg.player_name),
          country: fg.country,
          world_rank: focusGolfer?.ranking?.owgr_rank ?? undefined,
          dg_skill_estimate:
            focusGolfer?.ranking?.dg_skill_estimate ?? undefined,
          r1_teetime:
            fg.teetimes.find((tt) => tt.round_num === 1)?.teetime ?? undefined,
          r2_teetime:
            fg.teetimes.find((tt) => tt.round_num === 2)?.teetime ?? undefined,
        };
      });

    const openingTeeTime = fieldData.field
      .map((g) => g.teetimes.find((tt) => tt.round_num === 1)?.teetime)
      .filter((t): t is number => typeof t === "number")
      .sort((a, b) => a - b)[0];

    await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
      tournament: { _id: tournament._id, startDate: openingTeeTime },
    });

    if (newGolfers.length > 0) {
      await ctx.runMutation(
        internal.functions.golfers.createMissingTournamentGolfers,
        { tournamentId: tournament._id, golfers: newGolfers },
      );
    }

    return {
      ok: true,
      skipped: true,
      reason: "next_tournament_already_has_golfers",
      tournamentId: tournament._id,
      tournamentName: tournament.name,
      golfersCount: golfers.length,
    } as const;
  }

  return {
    ok: true,
    skipped: false,
    reason: "pre_tournament_completed",
    tournamentId: tournament._id,
    tournamentName: tournament.name,
    golfersCreated: golfers.length,
  };
}

// =============================================================================
// TOURNAMENT SYNC — main orchestrator
// =============================================================================

export const runTournamentSync: ReturnType<typeof internalAction> =
  internalAction({
    handler: async (ctx) => {
      const now = new Date();
      if (isOutsideSyncWindow(now)) {
        console.log("runTournamentSync: skipped (outside_of_time_window)", {
          currentHour: now.getHours(),
        });
        return {
          ok: true,
          skipped: true,
          reason: "outside_of_time_window",
          currentHour: now.getHours(),
        } as const;
      }

      const activeTournamentData = await ctx.runQuery(
        internal.functions.tournaments.getActiveTournamentData,
      );
      if (!activeTournamentData.ok) {
        console.log("runTournamentSync: skipped (no_active_tournament)");
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }

      const tournamentStats = await ctx.runAction(
        internal.functions.tournaments.getAllDataForTournament,
        {
          tournament: {
            _id: activeTournamentData.tournament._id,
            name: activeTournamentData.tournament.name,
            endDate: activeTournamentData.tournament.endDate,
            apiId: activeTournamentData.tournament.apiId,
            seasonId: activeTournamentData.tournament.seasonId,
          },
          tzOffset: activeTournamentData.course.timeZoneOffset ?? -18000000,
        },
      );
      if (!tournamentStats.ok) {
        console.log("runTournamentSync: skipped (no_active_tournament)");
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }

      const {
        tournament,
        course,
        tier,
        type: tournamentType,
      } = activeTournamentData;
      const { teams, golfers, fieldData, liveData, historicalData } =
        tournamentStats;

      if (tournamentType === "recent") {
        console.log("runTournamentSync: skipped (recent_tournament)", {
          tournamentId: tournament._id,
          tournamentName: tournament.name,
        });
        return {
          ok: true,
          skipped: true,
          reason: "recent_tournament",
          tournamentId: tournament._id,
          tournamentName: tournament.name,
        } as const;
      }

      // --- Phase 1: Fill incomplete team rosters ---
      await fillIncompleteTeamRosters(ctx, teams, golfers);

      // --- Phase 2: Handle pre-tournament (next) sync ---
      if (tournamentType === "next") {
        return await handlePreTournamentSync(
          ctx,
          tournament,
          golfers,
          fieldData,
          now,
        );
      }

      // --- Phase 3: Determine round state ---
      const currentRound = liveData.info
        ? liveData.info.current_round
        : historicalData?.event_completed
          ? 5
          : 0;

      const isRoundRunning = liveData.info
        ? isRoundRunningFromLiveStats(
            golfers.map((g) => ({
              current_pos:
                g.live?.current_pos ?? g.historical?.fin_text ?? undefined,
              thru: parseFloat(g.live?.thru ?? ""),
            })),
          )
        : false;

      const firstTeeTime = earliestTimeStr(
        golfers
          .map(
            (g) =>
              g.field?.teetimes.find((tt: TeeTimeEntry) => tt.round_num === 1)
                ?.teetime ??
              (g.historical?.round_1?.teetime
                ? g.historical.round_1.teetime
                : undefined),
          )
          .filter((t): t is number => typeof t === "number"),
      );

      // --- Phase 4: Update tournament status ---
      await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
        tournament: {
          _id: tournament._id,
          currentRound: (!isRoundRunning ? 0.5 : 0) + currentRound,
          livePlay: isRoundRunning,
          status: determineTournamentStatus(
            tournament.status,
            currentRound,
            isRoundRunning,
          ),
          startDate: firstTeeTime,
        },
      });

      // --- Phase 5: Update all tournament golfers ---
      const usageMap = buildUsageRateByGolferApiId({ teams });

      for (const g of golfers) {
        const payload = buildGolferUpdatePayload(
          g,
          golfers,
          tournament._id,
          course.par,
          usageMap.get(g.golfer?.apiId ?? -1) ?? 0,
          currentRound,
          isRoundRunning,
        );
        if (payload) {
          await ctx.runMutation(
            internal.functions.golfers.updateTournamentGolfer,
            { tournamentGolfer: payload },
          );
        }
      }

      // --- Phase 6: Compute and update team aggregates ---
      const updatedTeams = teams.map((t) => buildTeamAggregates(t, course.par));

      // --- Phase 7: Compute positions and write team updates ---
      for (const t of updatedTeams) {
        if (!t._id) continue;

        const { position, pastPosition, teamsAhead, teamsTied } =
          computeTeamPositionData(t, updatedTeams);

        await ctx.runMutation(api.functions.teams.updateTeam, {
          team: {
            _id: t._id,
            makeCut: t.makeCut,
            score: t.score,
            topTen: t.topTen,
            topFive: t.topFive,
            topThree: t.topThree,
            win: t.win,
            today: t.today,
            thru: t.thru,
            round: t.round,
            roundOneTeeTime: t.roundOneTeeTime,
            roundOne: t.roundOne,
            roundTwoTeeTime: t.roundTwoTeeTime,
            roundTwo: t.roundTwo,
            roundThreeTeeTime: t.roundThreeTeeTime,
            roundThree: t.roundThree,
            roundFourTeeTime: t.roundFourTeeTime,
            roundFour: t.roundFour,
            earnings: awardTeamEarnings(tier, teamsAhead, teamsTied),
            points: awardTeamPlayoffPoints(tier, teamsAhead, teamsTied),
            position,
            pastPosition,
          },
        });
      }

      return {
        ok: true,
        skipped: false,
        reason: "completed update",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        currentRound: tournament.currentRound,
        livePlay: tournament.livePlay,
        status: tournament.status,
      };
    },
  });
export const runTournamentSync_Public: ReturnType<typeof action> = action({
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.functions.cronJobs.runTournamentSync,
      {},
    );
  },
});
