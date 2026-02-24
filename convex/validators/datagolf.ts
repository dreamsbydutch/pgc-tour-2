import { v } from "convex/values";
import {
  DataGolfFieldPlayer,
  DataGolfHistoricalEvent,
  DataGolfHistoricalEventDataStat,
  DataGolfHistoricalPlayer,
  DataGolfLiveModelPlayer,
  DataGolfRankedPlayer,
} from "../types/datagolf";
import {
  normalizeDgSkillEstimateToPgcRating,
  normalizePlayerNameFromDataGolf,
  parseDataGolfTeeTimeToMs,
} from "../utils/datagolf";
import { Doc, Id } from "../_generated/dataModel";
import { EnhancedGolfer } from "../types/golfers";

const vFileFormat = v.union(v.literal("json"), v.literal("csv"));
const vOddsFormat = v.union(
  v.literal("percent"),
  v.literal("american"),
  v.literal("decimal"),
  v.literal("fraction"),
);
const vDisplay = v.union(v.literal("value"), v.literal("rank"));
const vTour = v.literal("pga");
const vHistoricalEventDataTour = v.literal("pga");
const vLiveStrokesGainedView = v.union(v.literal("raw"), v.literal("relative"));

export const datagolfValidators = {
  args: {
    fetchFieldUpdates: {
      tournament: v.object({
        _id: v.id("tournaments"),
        name: v.string(),
        apiId: v.optional(v.string()),
        seasonId: v.id("seasons"),
      }),
      options: v.optional(
        v.object({
          tour: v.optional(vTour),
          format: v.optional(vFileFormat),
          filterByCountry: v.optional(v.string()),
          filterWithdrawn: v.optional(v.boolean()),
          sortBySalary: v.optional(v.boolean()),
          sortByName: v.optional(v.boolean()),
          minSalary: v.optional(v.number()),
          maxSalary: v.optional(v.number()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchDataGolfRankings: {
      options: v.optional(
        v.object({
          format: v.optional(vFileFormat),
          filterByCountry: v.optional(v.string()),
          filterByTour: v.optional(v.string()),
          topN: v.optional(v.number()),
          minSkillEstimate: v.optional(v.number()),
          sortBySkill: v.optional(v.boolean()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchLiveModelPredictions: {
      tournament: v.object({
        _id: v.id("tournaments"),
        name: v.string(),
        apiId: v.optional(v.string()),
        seasonId: v.id("seasons"),
      }),
      options: v.optional(
        v.object({
          tour: v.optional(vTour),
          deadHeat: v.optional(v.boolean()),
          oddsFormat: v.optional(vOddsFormat),
          format: v.optional(vFileFormat),
          filterByPosition: v.optional(
            v.object({
              current: v.optional(v.string()),
              maxPosition: v.optional(v.number()),
            }),
          ),
          minWinProbability: v.optional(v.number()),
          sortByPosition: v.optional(v.boolean()),
          onlyActivePlayers: v.optional(v.boolean()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchLiveTournamentStats: {
      options: v.optional(
        v.object({
          stats: v.optional(v.array(v.string())),
          round: v.optional(v.string()),
          display: v.optional(vDisplay),
          format: v.optional(vFileFormat),
          filterByPosition: v.optional(v.number()),
          sortByStat: v.optional(
            v.object({
              stat: v.union(
                v.literal("sg_putt"),
                v.literal("sg_arg"),
                v.literal("sg_app"),
                v.literal("sg_ott"),
                v.literal("sg_t2g"),
                v.literal("sg_bs"),
                v.literal("sg_total"),
                v.literal("distance"),
                v.literal("accuracy"),
                v.literal("gir"),
                v.literal("prox_fw"),
                v.literal("prox_rgh"),
                v.literal("scrambling"),
                v.literal("great_shots"),
                v.literal("poor_shots"),
              ),
              value: v.number(),
            }),
          ),
          minValue: v.optional(
            v.object({
              stat: v.union(
                v.literal("sg_putt"),
                v.literal("sg_arg"),
                v.literal("sg_app"),
                v.literal("sg_ott"),
                v.literal("sg_t2g"),
                v.literal("sg_bs"),
                v.literal("sg_total"),
                v.literal("distance"),
                v.literal("accuracy"),
                v.literal("gir"),
                v.literal("prox_fw"),
                v.literal("prox_rgh"),
                v.literal("scrambling"),
                v.literal("great_shots"),
                v.literal("poor_shots"),
              ),
              value: v.number(),
            }),
          ),
          onlyCompleteRounds: v.optional(v.boolean()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchHistoricalRoundData: {
      tournament: v.object({
        _id: v.id("tournaments"),
        name: v.string(),
        apiId: v.optional(v.string()),
        seasonId: v.id("seasons"),
      }),
      options: v.object({
        tzOffset: v.optional(v.number()),
        tour: v.string(),
        year: v.number(),
        format: v.optional(vFileFormat),
        filterByPlayer: v.optional(v.string()),
        filterByRound: v.optional(v.number()),
        minScore: v.optional(v.number()),
        maxScore: v.optional(v.number()),
        sortByScore: v.optional(v.boolean()),
        limit: v.optional(v.number()),
        skip: v.optional(v.number()),
      }),
    },
    fetchHistoricalEventDataEvents: {
      tournament: v.object({
        _id: v.id("tournaments"),
        name: v.string(),
        apiId: v.optional(v.string()),
        seasonId: v.id("seasons"),
      }),
      options: v.object({
        tour: vHistoricalEventDataTour,
        year: v.number(),
        format: v.optional(vFileFormat),
      }),
    },
    fetchLiveStrokesGained: {
      options: v.optional(
        v.object({
          sg: v.optional(vLiveStrokesGainedView),
          format: v.optional(vFileFormat),
        }),
      ),
    },
  },
} as const;

export function validateDataGolfLiveModelGolfer(
  golfer: Record<string, unknown>,
): DataGolfLiveModelPlayer {
  return {
    current_pos: String(golfer.current_pos).trim().toUpperCase(),
    current_score: Number(golfer.current_score),
    dg_id: Number(golfer.dg_id),
    end_hole: Number(golfer.end_hole),
    make_cut: Number(golfer.make_cut),
    player_name: normalizePlayerNameFromDataGolf(String(golfer.player_name)),
    round: Number(golfer.round),
    thru: String(golfer.thru).trim().toUpperCase(),
    today: Number(golfer.today),
    R1: golfer.R1 !== undefined ? Number(golfer.R1) : undefined,
    R2: golfer.R2 !== undefined ? Number(golfer.R2) : undefined,
    R3: golfer.R3 !== undefined ? Number(golfer.R3) : undefined,
    R4: golfer.R4 !== undefined ? Number(golfer.R4) : undefined,
    top_10: Number(golfer.top_10),
    top_20: Number(golfer.top_20),
    top_5: Number(golfer.top_5),
    win: Number(golfer.win),
  };
}
export function validateDataGolfFieldPlayer(
  player: Record<string, unknown>,
): DataGolfFieldPlayer {
  return {
    am: Number(player.am),
    country: String(player.country).trim(),
    dg_id: Number(player.dg_id),
    dg_rank: Number(player.dg_rank),
    owgr_rank: Number(player.owgr_rank),
    player_name: normalizePlayerNameFromDataGolf(String(player.player_name)),
    player_num: Number(player.player_num),
    pre_tourn_pageviews: Number(player.pre_tourn_pageviews),
    teetimes: (player.teetimes as unknown[]).map((t: unknown) => {
      return {
        course_code: String((t as Record<string, unknown>).course_code).trim(),
        course_name: String((t as Record<string, unknown>).course_name).trim(),
        course_num: Number((t as Record<string, unknown>).course_num),
        round_num: Number((t as Record<string, unknown>).round_num),
        start_hole: Number((t as Record<string, unknown>).start_hole),
        teetime: parseDataGolfTeeTimeToMs(
          String((t as Record<string, unknown>).teetime),
        ),
        wave: String((t as Record<string, unknown>).wave) as "early" | "late",
      };
    }),
    tour_rank: String(player.tour_rank).trim(),
  };
}
export function validateDataGolfRankedPlayer(
  player: Record<string, unknown>,
): DataGolfRankedPlayer {
  return {
    am: Number(player.am),
    country: String(player.country).trim(),
    datagolf_rank: Number(player.datagolf_rank),
    dg_id: Number(player.dg_id),
    dg_skill_estimate: Number(player.dg_skill_estimate),
    owgr_rank: Number(player.owgr_rank),
    player_name: normalizePlayerNameFromDataGolf(String(player.player_name)),
    primary_tour: String(player.primary_tour).trim(),
  };
}
export function validateDataGolfHistoricalPlayer(
  player: Record<string, unknown>,
  tzOffset: number,
  endDate: number,
): DataGolfHistoricalPlayer {
  return {
    dg_id: Number(player.dg_id),
    fin_text: String(player.fin_text).trim(),
    player_name: normalizePlayerNameFromDataGolf(String(player.player_name)),
    round_1:
      player.round_1 && typeof player.round_1 === "object"
        ? {
            score: Number((player.round_1 as Record<string, unknown>).score),
            teetime: parseDataGolfTeeTimeToMs(
              String((player.round_1 as Record<string, unknown>).teetime),
              {
                baseDateMs: endDate - 3 * 24 * 60 * 60 * 1000,
                sourceUtcOffsetSeconds: tzOffset,
              },
            ),
            course_par: Number(
              (player.round_1 as Record<string, unknown>).course_par,
            ),
          }
        : undefined,
    round_2:
      player.round_2 && typeof player.round_2 === "object"
        ? {
            score: Number((player.round_2 as Record<string, unknown>).score),
            teetime: parseDataGolfTeeTimeToMs(
              String((player.round_2 as Record<string, unknown>).teetime),
              {
                baseDateMs: endDate - 2 * 24 * 60 * 60 * 1000,
                sourceUtcOffsetSeconds: tzOffset,
              },
            ),
            course_par: Number(
              (player.round_2 as Record<string, unknown>).course_par,
            ),
          }
        : undefined,
    round_3:
      player.round_3 && typeof player.round_3 === "object"
        ? {
            score: Number((player.round_3 as Record<string, unknown>).score),
            teetime: parseDataGolfTeeTimeToMs(
              String((player.round_3 as Record<string, unknown>).teetime),
              {
                baseDateMs: endDate - 1 * 24 * 60 * 60 * 1000,
                sourceUtcOffsetSeconds: tzOffset,
              },
            ),
            course_par: Number(
              (player.round_3 as Record<string, unknown>).course_par,
            ),
          }
        : undefined,
    round_4:
      player.round_4 && typeof player.round_4 === "object"
        ? {
            score: Number((player.round_4 as Record<string, unknown>).score),
            teetime: parseDataGolfTeeTimeToMs(
              String((player.round_4 as Record<string, unknown>).teetime),
              {
                baseDateMs: endDate - 0 * 24 * 60 * 60 * 1000,
                sourceUtcOffsetSeconds: tzOffset,
              },
            ),
            course_par: Number(
              (player.round_4 as Record<string, unknown>).course_par,
            ),
          }
        : undefined,
  };
}
export function validateDataGolfWinningsPlayer(
  player: Record<string, unknown>,
): DataGolfHistoricalEventDataStat {
  return {
    dg_id: Number(player.dg_id),
    dg_points: Number(player.dg_points),
    earnings: Number(player.earnings),
    fec_points: Number(player.fec_points),
    fin_text: String(player.fin_text).trim(),
    player_name: normalizePlayerNameFromDataGolf(String(player.player_name)),
  };
}

export function convertDataGolfRankedPlayerToGolferDoc(
  rankedPlayer: DataGolfRankedPlayer,
): Omit<Doc<"golfers">, "_id" | "_creationTime" | "updatedAt"> {
  return {
    apiId: rankedPlayer.dg_id,
    playerName: rankedPlayer.player_name,
    country: rankedPlayer.country,
    worldRank: rankedPlayer.owgr_rank,
  };
}
export function convertEnhancedGolferToTournamentGolferDoc(
  golferId: Id<"golfers">,
  tournamentId: Id<"tournaments">,
  golfer: EnhancedGolfer,
  group?: number,
  usage?: number,
): Omit<Doc<"tournamentGolfers">, "_id" | "_creationTime" | "updatedAt"> {
  return {
    golferId,
    tournamentId,
    position:
      golfer.live?.current_pos ??
      golfer.historical?.fin_text ??
      golfer.tournamentGolfer?.position ??
      undefined,
    posChange: undefined,
    score:
      golfer.live?.current_score ??
      (golfer.historical
        ? (golfer.historical?.round_1?.score ?? 0) -
          (golfer.historical?.round_1?.course_par ?? 0) +
          (golfer.historical?.round_2?.score ??
            0 - (golfer.historical?.round_2?.course_par ?? 0)) +
          (golfer.historical?.round_3?.score ??
            0 - (golfer.historical?.round_3?.course_par ?? 0)) +
          (golfer.historical?.round_4?.score ??
            0 - (golfer.historical?.round_4?.course_par ?? 0))
        : (golfer.tournamentGolfer?.score ?? undefined)),
    makeCut:
      golfer.live?.make_cut ?? golfer.tournamentGolfer?.makeCut ?? undefined,
    topTen: golfer.live?.top_10 ?? golfer.tournamentGolfer?.topTen ?? undefined,
    win: golfer.live?.win ?? golfer.tournamentGolfer?.win ?? undefined,
    today: golfer.live?.today ?? golfer.tournamentGolfer?.today ?? undefined,
    thru: golfer.live?.thru
      ? Number(golfer.live.thru)
      : ((golfer.historical ? 18 : golfer.tournamentGolfer?.thru) ?? undefined),
    round:
      golfer.live?.round ??
      (golfer.historical ? 4 : golfer.tournamentGolfer?.round) ??
      undefined,
    endHole: undefined,
    group,
    roundOne: 0,
    roundTwo: 0,
    roundThree: 0,
    roundFour: 0,
    roundOneTeeTime:
      golfer.field?.teetimes.find((tt) => tt.round_num === 1)?.teetime ??
      (golfer.historical?.round_1?.teetime
        ? golfer.historical?.round_1?.teetime
        : (golfer.tournamentGolfer?.roundOneTeeTime ?? undefined)),

    roundTwoTeeTime:
      golfer.field?.teetimes.find((tt) => tt.round_num === 2)?.teetime ??
      (golfer.historical?.round_2?.teetime
        ? golfer.historical?.round_2?.teetime
        : (golfer.tournamentGolfer?.roundTwoTeeTime ?? undefined)),

    roundThreeTeeTime:
      golfer.field?.teetimes.find((tt) => tt.round_num === 3)?.teetime ??
      (golfer.historical?.round_3?.teetime
        ? golfer.historical?.round_3?.teetime
        : (golfer.tournamentGolfer?.roundThreeTeeTime ?? undefined)),

    roundFourTeeTime:
      golfer.field?.teetimes.find((tt) => tt.round_num === 4)?.teetime ??
      (golfer.historical?.round_4?.teetime
        ? golfer.historical?.round_4?.teetime
        : (golfer.tournamentGolfer?.roundFourTeeTime ?? undefined)),

    rating: golfer.ranking?.dg_skill_estimate
      ? normalizeDgSkillEstimateToPgcRating(golfer.ranking?.dg_skill_estimate)
      : (golfer.tournamentGolfer?.rating ?? undefined),
    worldRank:
      golfer.field?.owgr_rank ??
      golfer.tournamentGolfer?.worldRank ??
      undefined,
    usage,
  };
}
export function convertDataGolfHistoricalPlayerToTournamentGolferDoc(
  golferId: Id<"golfers">,
  tournamentId: Id<"tournaments">,
  historicalPlayer: DataGolfHistoricalPlayer,
): Omit<Doc<"tournamentGolfers">, "_id" | "_creationTime" | "updatedAt"> {
  return {
    golferId,
    tournamentId,
    roundOneTeeTime: historicalPlayer.round_1?.teetime
      ? historicalPlayer.round_1.teetime
      : undefined,
    roundTwoTeeTime: historicalPlayer.round_2?.teetime
      ? historicalPlayer.round_2.teetime
      : undefined,

    roundThreeTeeTime: historicalPlayer.round_3?.teetime
      ? historicalPlayer.round_3.teetime
      : undefined,

    roundFourTeeTime: historicalPlayer.round_4?.teetime
      ? historicalPlayer.round_4.teetime
      : undefined,

    roundOne: historicalPlayer.round_1?.score,
    roundTwo: historicalPlayer.round_2?.score,
    roundThree: historicalPlayer.round_3?.score,
    roundFour: historicalPlayer.round_4?.score,
    score:
      ((historicalPlayer.round_1?.score ?? 0) &&
        (historicalPlayer.round_1?.course_par ?? 0)) +
      ((historicalPlayer.round_2?.score ?? 0) &&
        (historicalPlayer.round_2?.course_par ?? 0)) +
      ((historicalPlayer.round_3?.score ?? 0) &&
        (historicalPlayer.round_3?.course_par ?? 0)) +
      ((historicalPlayer.round_4?.score ?? 0) &&
        (historicalPlayer.round_4?.course_par ?? 0)),
    thru: 18,
    position: historicalPlayer.fin_text,
  };
}
