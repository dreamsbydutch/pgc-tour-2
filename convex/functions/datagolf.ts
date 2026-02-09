/**
 * DataGolf API Integration Functions - Comprehensive Suite
 *
 * Handles all DataGolf API interactions including:
 * - General Use: Player lists, schedules, field updates
 * - Model Predictions: Rankings, predictions, skill ratings
 * - Live Model: Real-time predictions, stats, hole scoring
 * - Historical Data: Raw data, event lists, round scoring
 *
 * Each function includes comprehensive options for filtering, sorting, and data manipulation.
 * Includes all DataGolf API categories (General Use, Predictions, Live Model, Historical,
 * Betting Tools, Historical Odds, Historical DFS).
 */

import { action, internalMutation } from "../_generated/server";
import { datagolfValidators } from "../validators/datagolf";
import { processData } from "../utils/batchProcess";
import {
  buildQueryParams,
  fetchFromDataGolf,
  impliedProbabilityFromOdds,
  isLiveTournamentStat,
  isNonEmptyString,
  isRoundRunningFromLiveStats,
  isSkillRatingCategoryKey,
  normalizeDgSkillEstimateToPgcRating,
  normalizePlayerNameFromDataGolf,
  parseThruFromLiveModel,
} from "../utils/datagolf";
import type {
  DataGolfBettingMarketMatchups,
  DataGolfBettingMarketOutright,
  DataGolfBettingToolAllPairingsResponse,
  DataGolfBettingToolMatchupsResponse,
  DataGolfBettingToolOutrightsResponse,
  DataGolfEventId,
  DataGolfFantasyProjectionPlayer,
  DataGolfFantasyProjectionResponse,
  DataGolfFantasySite,
  DataGolfFantasySlate,
  DataGolfHistoricalDfsEventListResponse,
  DataGolfHistoricalDfsPointsResponse,
  DataGolfHistoricalOddsEventListResponse,
  DataGolfHistoricalOddsMatchupsResponse,
  DataGolfHistoricalOddsOutrightsResponse,
  DataGolfHistoricalOddsTour,
  DataGolfLiveStrokesGainedResponse,
  DataGolfLiveStrokesGainedView,
  DataGolfOddsFormat,
  DataGolfPlayer,
  DataGolfScheduleEvent,
  DataGolfTourScheduleResponse,
  DataGolfFieldPlayer,
  DataGolfFieldUpdatesResponse,
  DataGolfRankedPlayer,
  DataGolfRankingsResponse,
  DataGolfPredictionPlayer,
  DataGolfPreTournamentArchivePlayer,
  DataGolfPreTournamentPredictionsArchiveResponse,
  DataGolfPreTournamentPredictionsResponse,
  DataGolfSkillDecompositionPlayer,
  DataGolfSkillDecompositionsResponse,
  DataGolfSkillRatingPlayer,
  DataGolfSkillRatingsResponse,
  DataGolfApproachSkillFieldKey,
  DataGolfApproachSkillPlayer,
  DataGolfApproachSkillResponse,
  DataGolfLiveModelPlayer,
  DataGolfLiveModelPredictionsResponse,
  DataGolfLiveStatsPlayer,
  DataGolfLiveTournamentStatsResponse,
  DataGolfHoleStats,
  DataGolfLiveHoleStatsResponse,
  DataGolfHistoricalEvent,
  DataGolfHistoricalEventDataResponse,
  DataGolfHistoricalPlayer,
  DataGolfHistoricalRoundDataResponse,
} from "../types/datagolf";
import {
  buildUsageRateByGolferApiId,
  computePosChange,
  earliestTimeStr,
  roundToDecimalPlace,
} from "../utils";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";

/**
 * Fetches the DataGolf player list.
 *
 * Endpoint: `/get-player-list`
 *
 * Supports optional filtering/sorting/pagination via `args.options`.
 */
export const fetchPlayerList = action({
  args: datagolfValidators.args.fetchPlayerList,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const format = options.format || "json";

    const endpoint = `/get-player-list?file_format=${format}`;
    const data = await fetchFromDataGolf<DataGolfPlayer[]>(
      endpoint,
      (json): json is DataGolfPlayer[] =>
        Array.isArray(json) &&
        (json.length === 0 ||
          json.every(
            (p) =>
              p && typeof p === "object" && "player_name" in p && "dg_id" in p,
          )),
    );

    if (!Array.isArray(data)) return data;

    return processData(data, {
      filter: (player: DataGolfPlayer) => {
        if (
          options.filterByCountry &&
          player.country !== options.filterByCountry
        )
          return false;
        if (
          options.filterByAmateur !== undefined &&
          player.amateur !== (options.filterByAmateur ? 1 : 0)
        )
          return false;
        return true;
      },
      sort: options.sortByName
        ? (a: DataGolfPlayer, b: DataGolfPlayer) =>
            a.player_name.localeCompare(b.player_name)
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });
  },
});

/**
 * Fetches the DataGolf tour schedule.
 *
 * Endpoint: `/get-schedule`
 *
 * Supports optional filtering (location, upcoming-only), sorting (date), and pagination.
 */
export const fetchTourSchedule = action({
  args: datagolfValidators.args.fetchTourSchedule,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "all";
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      season: options.season,
      upcoming_only: options.upcomingOnly ? "yes" : undefined,
      file_format: format,
    });

    const endpoint = `/get-schedule?${params}`;
    const data = await fetchFromDataGolf<DataGolfTourScheduleResponse>(
      endpoint,
      (json): json is DataGolfTourScheduleResponse =>
        typeof json === "object" &&
        json !== null &&
        "schedule" in json &&
        Array.isArray((json as DataGolfTourScheduleResponse).schedule),
    );

    if (!data.schedule || !Array.isArray(data.schedule)) return data;

    const processedSchedule = processData(data.schedule, {
      filter: (event: DataGolfScheduleEvent) => {
        if (
          options.filterByLocation &&
          !event.location
            .toLowerCase()
            .includes(options.filterByLocation.toLowerCase())
        )
          return false;
        return true;
      },
      sort: options.sortByDate
        ? (a: DataGolfScheduleEvent, b: DataGolfScheduleEvent) =>
            new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, schedule: processedSchedule };
  },
});

/**
 * Fetches DataGolf field updates.
 *
 * Endpoint: `/field-updates`
 *
 * Supports optional filtering (country, withdrawn, salary range), sorting, and pagination.
 */
export const fetchFieldUpdates = action({
  args: datagolfValidators.args.fetchFieldUpdates,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";

    const endpoint = `/field-updates?tour=${tour}&file_format=${format}`;
    const data =
      await fetchFromDataGolf<DataGolfFieldUpdatesResponse>(endpoint);

    if (!data.field || !Array.isArray(data.field)) return data;

    const processedField = processData(data.field, {
      filter: (player: DataGolfFieldPlayer) => {
        if (
          options.filterByCountry &&
          player.country !== options.filterByCountry
        )
          return false;
        if (options.filterWithdrawn !== undefined) {
          const isWithdrawn = player.flag === "WD" || player.unofficial === 1;
          if (options.filterWithdrawn !== isWithdrawn) return false;
        }
        if (
          options.minSalary &&
          player.dk_salary &&
          player.dk_salary < options.minSalary
        )
          return false;
        if (
          options.maxSalary &&
          player.dk_salary &&
          player.dk_salary > options.maxSalary
        )
          return false;
        return true;
      },
      sort: options.sortBySalary
        ? (a: DataGolfFieldPlayer, b: DataGolfFieldPlayer) =>
            (b.dk_salary || 0) - (a.dk_salary || 0)
        : options.sortByName
          ? (a: DataGolfFieldPlayer, b: DataGolfFieldPlayer) =>
              a.player_name.localeCompare(b.player_name)
          : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, field: processedField };
  },
});

/**
 * Fetches DataGolf rankings.
 *
 * Endpoint: `/preds/get-dg-rankings`
 *
 * Supports optional filtering (country, tour, top-N, min skill) and pagination.
 */
export const fetchDataGolfRankings = action({
  args: datagolfValidators.args.fetchDataGolfRankings,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const format = options.format || "json";

    const endpoint = `/preds/get-dg-rankings?file_format=${format}`;
    const data = await fetchFromDataGolf<DataGolfRankingsResponse>(endpoint);

    if (!data.rankings || !Array.isArray(data.rankings)) return data;

    const processedRankings = processData(data.rankings, {
      filter: (player: DataGolfRankedPlayer) => {
        if (
          options.filterByCountry &&
          player.country !== options.filterByCountry
        )
          return false;
        if (
          options.filterByTour &&
          player.primary_tour !== options.filterByTour
        )
          return false;
        if (options.topN && player.datagolf_rank > options.topN) return false;
        if (
          options.minSkillEstimate &&
          player.dg_skill_estimate < options.minSkillEstimate
        )
          return false;
        return true;
      },
      sort: options.sortBySkill
        ? (a: DataGolfRankedPlayer, b: DataGolfRankedPlayer) =>
            b.dg_skill_estimate - a.dg_skill_estimate
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, rankings: processedRankings };
  },
});

/**
 * Fetches DataGolf pre-tournament predictions.
 *
 * Endpoint: `/preds/pre-tournament`
 *
 * Uses `options.model` as the response key to extract and post-process a single model output.
 */
export const fetchPreTournamentPredictions = action({
  args: datagolfValidators.args.fetchPreTournamentPredictions,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";
    const oddsFormat = (options.oddsFormat || "percent") as DataGolfOddsFormat;
    const deadHeat = options.deadHeat !== false ? "yes" : "no";

    const params = buildQueryParams({
      tour,
      file_format: format,
      odds_format: oddsFormat,
      dead_heat: deadHeat,
      add_position: options.addPosition?.join(","),
    });

    const endpoint = `/preds/pre-tournament?${params}`;
    const data =
      await fetchFromDataGolf<DataGolfPreTournamentPredictionsResponse>(
        endpoint,
      );

    const modelKey = options.model || "baseline";
    const modelData = data[modelKey];

    if (!modelData || !Array.isArray(modelData)) return data;
    if (modelData.length > 0 && typeof modelData[0] === "string") return data;

    const predictionPlayers: DataGolfPredictionPlayer[] = modelData.filter(
      (item): item is DataGolfPredictionPlayer => typeof item !== "string",
    );

    const getWinProb = (win: number | string): number | null =>
      impliedProbabilityFromOdds(win, oddsFormat);

    const processedPredictions = processData(predictionPlayers, {
      filter: (player: DataGolfPredictionPlayer) => {
        if (
          options.filterByCountry &&
          player.country !== options.filterByCountry
        )
          return false;
        if (options.minWinProbability) {
          const winProb = getWinProb(player.win as number | string);
          if (winProb === null) return false;
          if (winProb < options.minWinProbability) return false;
        }
        if (options.maxWinOdds && oddsFormat === "decimal") {
          const decimalOdds =
            typeof player.win === "number"
              ? player.win
              : typeof player.win === "string"
                ? Number(player.win)
                : Number.NaN;
          if (Number.isFinite(decimalOdds) && decimalOdds > options.maxWinOdds)
            return false;
        }
        return true;
      },
      sort: options.sortByWinProbability
        ? (a: DataGolfPredictionPlayer, b: DataGolfPredictionPlayer) => {
            const aWinProb = getWinProb(a.win as number | string) ?? -1;
            const bWinProb = getWinProb(b.win as number | string) ?? -1;
            return bWinProb - aWinProb;
          }
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, [modelKey]: processedPredictions };
  },
});

/**
 * Fetches player skill decompositions.
 *
 * Endpoint: `/preds/player-decompositions`
 */
export const fetchPlayerSkillDecompositions = action({
  args: datagolfValidators.args.fetchPlayerSkillDecompositions,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";

    const endpoint = `/preds/player-decompositions?tour=${tour}&file_format=${format}`;
    const data =
      await fetchFromDataGolf<DataGolfSkillDecompositionsResponse>(endpoint);

    if (!data.players || !Array.isArray(data.players)) return data;

    const processedPlayers = processData(data.players, {
      filter: (player: DataGolfSkillDecompositionPlayer) => {
        if (
          options.filterByCountry &&
          player.country !== options.filterByCountry
        )
          return false;
        if (options.minPrediction && player.final_pred < options.minPrediction)
          return false;
        return true;
      },
      sort: options.sortByPrediction
        ? (
            a: DataGolfSkillDecompositionPlayer,
            b: DataGolfSkillDecompositionPlayer,
          ) => b.final_pred - a.final_pred
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    if (!options.includeAdjustments) {
      processedPlayers.forEach((player) => {
        player.age_adjustment = 0;
        player.course_experience_adjustment = 0;
        player.course_history_adjustment = 0;
        player.driving_accuracy_adjustment = 0;
        player.driving_distance_adjustment = 0;
        player.other_fit_adjustment = 0;
        player.strokes_gained_category_adjustment = 0;
        player.total_course_history_adjustment = 0;
        player.total_fit_adjustment = 0;
        player.true_sg_adjustments = 0;
      });
    }

    return { ...data, players: processedPlayers };
  },
});

/**
 * Fetches skill ratings.
 *
 * Endpoint: `/preds/skill-ratings`
 */
export const fetchSkillRatings = action({
  args: datagolfValidators.args.fetchSkillRatings,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const display = options.display || "value";
    const format = options.format || "json";

    const endpoint = `/preds/skill-ratings?display=${display}&file_format=${format}`;
    const data =
      await fetchFromDataGolf<DataGolfSkillRatingsResponse>(endpoint);

    if (!data.players || !Array.isArray(data.players)) return data;

    const processedPlayers = processData(data.players, {
      filter: (player: DataGolfSkillRatingPlayer) => {
        if (options.minTotalSG && player.sg_total < options.minTotalSG)
          return false;
        return true;
      },
      sort: options.sortByCategory
        ? (a: DataGolfSkillRatingPlayer, b: DataGolfSkillRatingPlayer) => {
            if (!options.sortByCategory) return 0;
            if (!isSkillRatingCategoryKey(options.sortByCategory)) return 0;
            return b[options.sortByCategory] - a[options.sortByCategory];
          }
        : undefined,
      limit: options.topNInCategory || options.limit,
      skip: options.skip,
    });

    return { ...data, players: processedPlayers };
  },
});

/**
 * Fetches approach skill data.
 *
 * Endpoint: `/preds/approach-skill`
 */
export const fetchApproachSkill = action({
  args: datagolfValidators.args.fetchApproachSkill,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const period = options.period || "l24";
    const format = options.format || "json";

    const endpoint = `/preds/approach-skill?period=${period}&file_format=${format}`;
    const data =
      await fetchFromDataGolf<DataGolfApproachSkillResponse>(endpoint);

    if (!data.data || !Array.isArray(data.data)) return data;

    const processedData = processData(data.data, {
      filter: (player: DataGolfApproachSkillPlayer) => {
        if (options.minShotCount) {
          const shotCountField: DataGolfApproachSkillFieldKey =
            options.distanceRange
              ? (`${options.distanceRange}_shot_count` as DataGolfApproachSkillFieldKey)
              : "50_100_fw_shot_count";
          if ((player[shotCountField] ?? 0) < options.minShotCount)
            return false;
        }
        return true;
      },
      sort: options.sortByProximity
        ? (a: DataGolfApproachSkillPlayer, b: DataGolfApproachSkillPlayer) => {
            const proximityField: DataGolfApproachSkillFieldKey =
              options.distanceRange
                ? (`${options.distanceRange}_proximity_per_shot` as DataGolfApproachSkillFieldKey)
                : "50_100_fw_proximity_per_shot";
            return (a[proximityField] ?? 999) - (b[proximityField] ?? 999);
          }
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, data: processedData };
  },
});

/**
 * Fetches live model predictions.
 *
 * Endpoint: `/preds/in-play`
 */
export const fetchLiveModelPredictions = action({
  args: datagolfValidators.args.fetchLiveModelPredictions,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";
    const oddsFormat = options.oddsFormat || "percent";
    const deadHeat = options.deadHeat === true ? "yes" : "no";

    const endpoint = `/preds/in-play?tour=${tour}&dead_heat=${deadHeat}&odds_format=${oddsFormat}&file_format=${format}`;
    const data =
      await fetchFromDataGolf<DataGolfLiveModelPredictionsResponse>(endpoint);

    if (!data.data || !Array.isArray(data.data)) return data;

    const processedData = processData(data.data, {
      filter: (player: DataGolfLiveModelPlayer) => {
        if (options.onlyActivePlayers && player.thru === "WD") return false;
        if (
          options.filterByPosition?.current &&
          player.current_pos !== options.filterByPosition.current
        )
          return false;
        if (options.filterByPosition?.maxPosition) {
          const position =
            parseInt(player.current_pos.replace(/[^\d]/g, "")) || 999;
          if (position > options.filterByPosition.maxPosition) return false;
        }
        if (options.minWinProbability && player.win < options.minWinProbability)
          return false;
        return true;
      },
      sort: options.sortByPosition
        ? (a: DataGolfLiveModelPlayer, b: DataGolfLiveModelPlayer) => {
            const posA = parseInt(a.current_pos.replace(/[^\d]/g, "")) || 999;
            const posB = parseInt(b.current_pos.replace(/[^\d]/g, "")) || 999;
            return posA - posB;
          }
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, data: processedData };
  },
});

/**
 * Fetches live tournament stats.
 *
 * Endpoint: `/preds/live-tournament-stats`
 */
export const fetchLiveTournamentStats = action({
  args: datagolfValidators.args.fetchLiveTournamentStats,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const format = options.format || "json";
    const display = options.display || "value";
    const round = options.round || "event_cumulative";
    const stats = options.stats || ["sg_total", "sg_putt", "sg_app", "sg_ott"];

    const params = buildQueryParams({
      stats: stats.join(","),
      round,
      display,
      file_format: format,
    });

    const endpoint = `/preds/live-tournament-stats?${params}`;
    const data =
      await fetchFromDataGolf<DataGolfLiveTournamentStatsResponse>(endpoint);

    if (!data.live_stats || !Array.isArray(data.live_stats)) return data;

    const processedStats = processData(data.live_stats, {
      filter: (player: DataGolfLiveStatsPlayer) => {
        if (options.onlyCompleteRounds && player.thru !== 18) return false;
        if (options.filterByPosition) {
          const position = parseInt(player.position) || 999;
          if (position > options.filterByPosition) return false;
        }
        if (options.minValue) {
          const stat = options.minValue.stat;
          const statValue =
            typeof stat === "string" && isLiveTournamentStat(stat)
              ? (player[stat] ?? 0)
              : 0;
          if (statValue < options.minValue.value) return false;
        }
        return true;
      },
      sort: options.sortByStat
        ? (a: DataGolfLiveStatsPlayer, b: DataGolfLiveStatsPlayer) => {
            const stat = options.sortByStat;
            if (!stat) return 0;
            if (typeof stat !== "string" || !isLiveTournamentStat(stat))
              return 0;
            return (b[stat] ?? 0) - (a[stat] ?? 0);
          }
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, live_stats: processedStats };
  },
});

/**
 * Fetches live hole statistics.
 *
 * Endpoint: `/preds/live-hole-stats`
 */
export const fetchLiveHoleStats = action({
  args: datagolfValidators.args.fetchLiveHoleStats,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";

    const endpoint = `/preds/live-hole-stats?tour=${tour}&file_format=${format}`;
    const data =
      await fetchFromDataGolf<DataGolfLiveHoleStatsResponse>(endpoint);

    if (!data.courses || !Array.isArray(data.courses)) return data;

    const processedCourses = data.courses.map((course) => ({
      ...course,
      rounds: course.rounds?.map((round) => ({
        ...round,
        holes: round.holes
          ?.filter((hole: DataGolfHoleStats) => {
            if (options.filterByHole && hole.hole !== options.filterByHole)
              return false;
            if (options.filterByPar && hole.par !== options.filterByPar)
              return false;
            return true;
          })
          .sort(
            options.sortByDifficulty
              ? (a: DataGolfHoleStats, b: DataGolfHoleStats) => {
                  const waveA =
                    options.wave === "morning"
                      ? a.morning_wave
                      : options.wave === "afternoon"
                        ? a.afternoon_wave
                        : a.total;
                  const waveB =
                    options.wave === "morning"
                      ? b.morning_wave
                      : options.wave === "afternoon"
                        ? b.afternoon_wave
                        : b.total;
                  return (waveB?.avg_score || 0) - (waveA?.avg_score || 0);
                }
              : undefined,
          ),
      })),
    }));

    return { ...data, courses: processedCourses };
  },
});

/**
 * Fetches the historical raw-data event list.
 *
 * Endpoint: `/historical-raw-data/event-list`
 */
export const fetchHistoricalEventList = action({
  args: datagolfValidators.args.fetchHistoricalEventList,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const format = options.format || "json";

    const endpoint = `/historical-raw-data/event-list?file_format=${format}`;
    const data = await fetchFromDataGolf<DataGolfHistoricalEvent[]>(endpoint);

    if (!Array.isArray(data)) return data;

    return processData(data, {
      filter: (event: DataGolfHistoricalEvent) => {
        if (options.filterByTour && event.tour !== options.filterByTour)
          return false;
        if (
          options.filterByYear &&
          event.calendar_year !== options.filterByYear
        )
          return false;
        if (options.onlyWithSG && event.sg_categories !== "yes") return false;
        return true;
      },
      sort: options.sortByDate
        ? (a: DataGolfHistoricalEvent, b: DataGolfHistoricalEvent) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });
  },
});

/**
 * Fetches historical round scoring data.
 *
 * Endpoint: `/historical-raw-data/rounds`
 */
export const fetchHistoricalRoundData = action({
  args: datagolfValidators.args.fetchHistoricalRoundData,
  handler: async (_ctx, args) => {
    const options = args.options;
    const format = options.format || "json";

    const endpoint = `/historical-raw-data/rounds?tour=${options.tour}&event_id=${options.eventId}&year=${options.year}&file_format=${format}`;
    const data =
      await fetchFromDataGolf<DataGolfHistoricalRoundDataResponse>(endpoint);

    if (!data.scores || !Array.isArray(data.scores)) return data;

    const processedScores = processData(data.scores, {
      filter: (player: DataGolfHistoricalPlayer) => {
        if (
          options.filterByPlayer &&
          !player.player_name
            .toLowerCase()
            .includes(options.filterByPlayer.toLowerCase())
        )
          return false;

        if (options.filterByRound) {
          const roundKey =
            `round_${options.filterByRound}` as keyof DataGolfHistoricalPlayer;
          if (!player[roundKey]) return false;
        }

        return true;
      },
      sort: options.sortByScore
        ? (a: DataGolfHistoricalPlayer, b: DataGolfHistoricalPlayer) => {
            const finA = parseInt(a.fin_text) || 999;
            const finB = parseInt(b.fin_text) || 999;
            return finA - finB;
          }
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    if (!options.includeStats) {
      const roundKeys = ["round_1", "round_2", "round_3", "round_4"] as const;
      processedScores.forEach((player) => {
        roundKeys.forEach((key) => {
          const round = player[key];
          if (!round) return;
          const { score, birdies, bogies, eagles_or_better, doubles_or_worse } =
            round;
          player[key] = {
            score,
            birdies,
            bogies,
            eagles_or_better,
            doubles_or_worse,
          };
        });
      });
    }

    return { ...data, scores: processedScores };
  },
});

export const fetchHistoricalEventDataEvents = action({
  args: datagolfValidators.args.fetchHistoricalEventDataEvents,
  handler: async (
    ctx,
    { options },
  ): Promise<DataGolfHistoricalEventDataResponse> => {
    void ctx;

    const format = (options.format || "json") as "json" | "csv";
    const endpoint = `/historical-event-data/events?tour=${options.tour}&event_id=${options.eventId}&year=${options.year}&file_format=${format}`;

    return fetchFromDataGolf<DataGolfHistoricalEventDataResponse>(
      endpoint,
      (json) => {
        if (!json || typeof json !== "object") return false;
        const maybe = json as { event_stats?: unknown };
        return Array.isArray(maybe.event_stats);
      },
    );
  },
});

export const fetchPreTournamentPredictionsArchive = action({
  args: datagolfValidators.args.fetchPreTournamentPredictionsArchive,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const format = options.format || "json";
    const oddsFormat = (options.oddsFormat || "percent") as DataGolfOddsFormat;

    const params = buildQueryParams({
      event_id: options.eventId as DataGolfEventId | undefined,
      year: options.year,
      odds_format: oddsFormat,
      file_format: format,
    });

    const endpoint = `/preds/pre-tournament-archive?${params}`;
    const data =
      await fetchFromDataGolf<DataGolfPreTournamentPredictionsArchiveResponse>(
        endpoint,
      );

    const modelKey = options.model || "baseline";
    const modelData = (data as Record<string, unknown>)[modelKey];
    if (!Array.isArray(modelData)) return data;

    const processed = processData(
      modelData as DataGolfPreTournamentArchivePlayer[],
      {
        limit: options.limit,
        skip: options.skip,
      },
    );

    return { ...data, [modelKey]: processed };
  },
});

export const fetchFantasyProjectionDefaults = action({
  args: datagolfValidators.args.fetchFantasyProjectionDefaults,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const site = (options.site || "draftkings") as DataGolfFantasySite;
    const slate = (options.slate || "main") as DataGolfFantasySlate;
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      site,
      slate,
      file_format: format,
    });

    const endpoint = `/preds/fantasy-projection-defaults?${params}`;
    const data =
      await fetchFromDataGolf<DataGolfFantasyProjectionResponse>(endpoint);

    if (!Array.isArray(data.projections)) return data;

    const processed = processData(data.projections, {
      filter: (p: DataGolfFantasyProjectionPlayer) => {
        if (options.minSalary !== undefined && p.salary < options.minSalary)
          return false;
        if (options.maxSalary !== undefined && p.salary > options.maxSalary)
          return false;
        if (options.filterByOwnership?.min !== undefined) {
          if (p.proj_ownership < options.filterByOwnership.min) return false;
        }
        if (options.filterByOwnership?.max !== undefined) {
          if (p.proj_ownership > options.filterByOwnership.max) return false;
        }
        return true;
      },
      sort: options.sortBySalary
        ? (
            a: DataGolfFantasyProjectionPlayer,
            b: DataGolfFantasyProjectionPlayer,
          ) => b.salary - a.salary
        : options.sortByProjection
          ? (
              a: DataGolfFantasyProjectionPlayer,
              b: DataGolfFantasyProjectionPlayer,
            ) => b.proj_points - a.proj_points
          : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, projections: processed };
  },
});

/**
 * Fetches live strokes-gained data.
 *
 * Endpoint: `/preds/live-strokes-gained`
 *
 * This endpoint is deprecated by DataGolf; prefer `fetchLiveTournamentStats`.
 */
export const fetchLiveStrokesGained = action({
  args: datagolfValidators.args.fetchLiveStrokesGained,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const sg = (options.sg || "raw") as DataGolfLiveStrokesGainedView;
    const format = options.format || "json";

    const params = buildQueryParams({
      sg,
      file_format: format,
    });
    const endpoint = `/preds/live-strokes-gained?${params}`;

    return fetchFromDataGolf<DataGolfLiveStrokesGainedResponse>(endpoint);
  },
});

export const fetchBettingToolsOutrights = action({
  args: datagolfValidators.args.fetchBettingToolsOutrights,
  handler: async (_ctx, args) => {
    const options = args.options;
    const tour = options.tour || "pga";
    const market = options.market as DataGolfBettingMarketOutright;
    const oddsFormat = (options.oddsFormat || "decimal") as DataGolfOddsFormat;
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      market,
      odds_format: oddsFormat,
      file_format: format,
    });

    const endpoint = `/betting-tools/outrights?${params}`;
    return fetchFromDataGolf<DataGolfBettingToolOutrightsResponse>(endpoint);
  },
});

export const fetchBettingToolsMatchups = action({
  args: datagolfValidators.args.fetchBettingToolsMatchups,
  handler: async (_ctx, args) => {
    const options = args.options;
    const tour = options.tour || "pga";
    const market = options.market as DataGolfBettingMarketMatchups;
    const oddsFormat = (options.oddsFormat || "decimal") as DataGolfOddsFormat;
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      market,
      odds_format: oddsFormat,
      file_format: format,
    });

    const endpoint = `/betting-tools/matchups?${params}`;
    return fetchFromDataGolf<DataGolfBettingToolMatchupsResponse>(endpoint);
  },
});

export const fetchBettingToolsMatchupsAllPairings = action({
  args: datagolfValidators.args.fetchBettingToolsMatchupsAllPairings,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const oddsFormat = (options.oddsFormat || "decimal") as DataGolfOddsFormat;
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      odds_format: oddsFormat,
      file_format: format,
    });

    const endpoint = `/betting-tools/matchups-all-pairings?${params}`;
    return fetchFromDataGolf<DataGolfBettingToolAllPairingsResponse>(endpoint);
  },
});

export const fetchHistoricalOddsEventList = action({
  args: datagolfValidators.args.fetchHistoricalOddsEventList,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour as DataGolfHistoricalOddsTour | undefined;
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      file_format: format,
    });

    const endpoint = `/historical-odds/event-list?${params}`;
    return fetchFromDataGolf<DataGolfHistoricalOddsEventListResponse>(endpoint);
  },
});

export const fetchHistoricalOddsOutrights = action({
  args: datagolfValidators.args.fetchHistoricalOddsOutrights,
  handler: async (_ctx, args) => {
    const options = args.options;
    const tour = (options.tour || "pga") as DataGolfHistoricalOddsTour;
    const format = options.format || "json";
    const oddsFormat = (options.oddsFormat || "decimal") as DataGolfOddsFormat;

    if (!isNonEmptyString(options.book)) {
      throw new Error("book is required");
    }

    const params = buildQueryParams({
      tour,
      event_id: options.eventId as DataGolfEventId | undefined,
      year: options.year,
      market: options.market,
      book: options.book,
      odds_format: oddsFormat,
      file_format: format,
    });

    const endpoint = `/historical-odds/outrights?${params}`;
    return fetchFromDataGolf<DataGolfHistoricalOddsOutrightsResponse>(endpoint);
  },
});

export const fetchHistoricalOddsMatchups = action({
  args: datagolfValidators.args.fetchHistoricalOddsMatchups,
  handler: async (_ctx, args) => {
    const options = args.options;
    const tour = (options.tour || "pga") as DataGolfHistoricalOddsTour;
    const format = options.format || "json";
    const oddsFormat = (options.oddsFormat || "decimal") as DataGolfOddsFormat;

    if (!isNonEmptyString(options.book)) {
      throw new Error("book is required");
    }

    const params = buildQueryParams({
      tour,
      event_id: options.eventId as DataGolfEventId | undefined,
      year: options.year,
      book: options.book,
      odds_format: oddsFormat,
      file_format: format,
    });

    const endpoint = `/historical-odds/matchups?${params}`;
    return fetchFromDataGolf<DataGolfHistoricalOddsMatchupsResponse>(endpoint);
  },
});

export const fetchHistoricalDfsEventList = action({
  args: datagolfValidators.args.fetchHistoricalDfsEventList,
  handler: async (_ctx, args) => {
    const format = args.options?.format || "json";
    const endpoint = `/historical-dfs-data/event-list?file_format=${format}`;
    return fetchFromDataGolf<DataGolfHistoricalDfsEventListResponse>(endpoint);
  },
});

export const fetchHistoricalDfsPoints = action({
  args: datagolfValidators.args.fetchHistoricalDfsPoints,
  handler: async (_ctx, args) => {
    const options = args.options;
    const tour = options.tour;
    const site = (options.site || "draftkings") as "draftkings" | "fanduel";
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      site,
      event_id: options.eventId as DataGolfEventId,
      year: options.year,
      file_format: format,
    });

    const endpoint = `/historical-dfs-data/points?${params}`;
    return fetchFromDataGolf<DataGolfHistoricalDfsPointsResponse>(endpoint);
  },
});

/**
 * Applies DataGolf live-sync payloads to the database.
 *
 * This is an internal mutation that:
 * - normalizes/patches `golfers`
 * - inserts/patches `tournamentGolfers`
 * - updates the tournament's live/completion flags based on the in-play feed
 */
export const applyDataGolfLiveSync = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    currentRound: v.optional(v.number()),
    eventName: v.optional(v.string()),
    dataGolfInPlayLastUpdate: v.optional(v.string()),
    roundIsRunning: v.optional(v.boolean()),
    field: v.array(
      v.object({
        am: v.number(),
        country: v.string(),
        course: v.optional(v.string()),
        dg_id: v.number(),
        dk_id: v.optional(v.string()),
        dk_salary: v.optional(v.number()),
        early_late: v.optional(v.number()),
        fd_id: v.optional(v.string()),
        fd_salary: v.optional(v.number()),
        flag: v.optional(v.string()),
        pga_number: v.optional(v.number()),
        player_name: v.string(),
        r1_teetime: v.optional(v.union(v.string(), v.null())),
        r2_teetime: v.optional(v.union(v.string(), v.null())),
        r3_teetime: v.optional(v.union(v.string(), v.null())),
        r4_teetime: v.optional(v.union(v.string(), v.null())),
        start_hole: v.optional(v.number()),
        unofficial: v.optional(v.number()),
        yh_id: v.optional(v.string()),
        yh_salary: v.optional(v.number()),
      }),
    ),
    rankings: v.array(
      v.object({
        am: v.number(),
        country: v.string(),
        datagolf_rank: v.number(),
        dg_id: v.number(),
        dg_skill_estimate: v.number(),
        owgr_rank: v.number(),
        player_name: v.string(),
        primary_tour: v.string(),
      }),
    ),
    liveStats: v.array(
      v.object({
        player_name: v.string(),
        country: v.optional(v.string()),
        course: v.optional(v.string()),
        dg_id: v.number(),
        current_pos: v.string(),
        current_score: v.number(),
        end_hole: v.number(),
        make_cut: v.number(),
        round: v.number(),
        thru: v.union(v.string(), v.number()),
        today: v.number(),
        top_10: v.optional(v.union(v.number(), v.null())),
        top_20: v.number(),
        top_5: v.number(),
        win: v.number(),
        R1: v.optional(v.union(v.number(), v.null())),
        R2: v.optional(v.union(v.number(), v.null())),
        R3: v.optional(v.union(v.number(), v.null())),
        R4: v.optional(v.union(v.number(), v.null())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let _tournamentGolfersDeletedNotInField = 0;
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found for live sync");
    }
    const hasTournamentStarted =
      tournament.status === "active" ||
      tournament.status === "completed" ||
      tournament.livePlay === true ||
      (tournament.status !== "upcoming" &&
        Number.isFinite(tournament.startDate) &&
        tournament.startDate > 0 &&
        Date.now() >= tournament.startDate);

    if (!hasTournamentStarted) {
      const liveFieldApiIds = new Set(args.liveStats.map((p) => p.dg_id));
      const fieldApiIds = new Set(args.field.map((f) => f.dg_id));
      const activeApiIds =
        liveFieldApiIds.size > 0 ? liveFieldApiIds : fieldApiIds;

      const earliestTeeTime = earliestTimeStr(
        args.field.map((f) => f.r1_teetime),
      );
      if (
        typeof earliestTeeTime === "number" &&
        Number.isFinite(earliestTeeTime) &&
        tournament.startDate !== earliestTeeTime
      ) {
        await ctx.db.patch(args.tournamentId, {
          startDate: earliestTeeTime,
          updatedAt: Date.now(),
        });
      }

      const existingTournamentGolfers = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", args.tournamentId),
        )
        .collect();

      for (const tg of existingTournamentGolfers) {
        const golfer = await ctx.db.get(tg.golferId);
        const apiId = golfer?.apiId;
        if (typeof apiId !== "number" || !activeApiIds.has(apiId)) {
          await ctx.db.delete(tg._id);
          _tournamentGolfersDeletedNotInField += 1;
        }
      }
    }

    const fieldById = new Map<number, DataGolfFieldPlayer>();
    for (const f of args.field) {
      fieldById.set(f.dg_id, f);
    }

    const rankingById = new Map<number, DataGolfRankedPlayer>();
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

    if (!hasTournamentStarted) {
      for (const golfer of args.field) {
        const golferApiId = golfer.dg_id;
        const ranking = rankingById.get(golfer.dg_id);

        const existingGolfer = await ctx.db
          .query("golfers")
          .withIndex("by_api_id", (q) => q.eq("apiId", golfer.dg_id))
          .first();

        const golferId = existingGolfer
          ? existingGolfer._id
          : await ctx.db.insert("golfers", {
              apiId: golfer.dg_id,
              playerName: normalizePlayerNameFromDataGolf(golfer.player_name),
              country: golfer.country || ranking?.country,
              worldRank: ranking?.owgr_rank,
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
            group: 0,
            roundOneTeeTime: golfer.r1_teetime ?? undefined,
            worldRank: ranking?.owgr_rank,
            rating: normalizeDgSkillEstimateToPgcRating(
              ranking?.dg_skill_estimate ?? -1.875,
            ),
            usage: usageByGolferApiId.get(golferApiId),
            updatedAt: Date.now(),
          });
          tournamentGolfersInserted += 1;
        } else {
          const patch: Partial<Doc<"tournamentGolfers">> = {
            roundOneTeeTime: golfer.r1_teetime ?? undefined,
            worldRank: ranking?.owgr_rank,
            rating: normalizeDgSkillEstimateToPgcRating(
              ranking?.dg_skill_estimate ?? -1.875,
            ),
            usage: usageByGolferApiId.get(golferApiId),
            updatedAt: Date.now(),
          };

          await ctx.db.patch(existingTournamentGolfer._id, patch);
          tournamentGolfersPatchedFromField += 1;
        }
      }
    }

    const liveStats: Omit<Doc<"tournamentGolfers">, "_id" | "_creationTime">[] =
      [];
    for (const live of args.liveStats) {
      const golferApiId = live.dg_id;
      const field = fieldById.get(golferApiId);
      const ranking = rankingById.get(golferApiId);

      const golfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", golferApiId))
        .first();
      if (!golfer) return undefined;

      const existingTournamentGolfer = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", golfer._id).eq("tournamentId", args.tournamentId),
        )
        .first();
      if (!existingTournamentGolfer) return undefined;

      const nextPosition = live.current_pos;
      const nextPosChange = computePosChange(
        existingTournamentGolfer.position,
        nextPosition,
      );
      const nextUsage = usageByGolferApiId.get(golferApiId);
      const thruNum = parseThruFromLiveModel(live.thru);

      const updated = {
        tournamentId: args.tournamentId,
        golferId: golfer._id,
        position: nextPosition,
        posChange: nextPosChange,
        score: roundToDecimalPlace(live.current_score, 0),
        today: roundToDecimalPlace(live.today, 0),
        thru: thruNum,
        round: live.round,
        endHole: live.end_hole,
        makeCut: live.make_cut,
        topTen: live.top_10 ?? undefined,
        win: live.win ?? undefined,
        roundOne:
          typeof live.R1 === "number"
            ? roundToDecimalPlace(live.R1, 0)
            : undefined,
        roundTwo:
          typeof live.R2 === "number"
            ? roundToDecimalPlace(live.R2, 0)
            : undefined,
        roundThree:
          typeof live.R3 === "number"
            ? roundToDecimalPlace(live.R3, 0)
            : undefined,
        roundFour:
          typeof live.R4 === "number"
            ? roundToDecimalPlace(live.R4, 0)
            : undefined,
        roundOneTeeTime:
          field?.r1_teetime ?? existingTournamentGolfer.roundOneTeeTime,
        roundTwoTeeTime:
          field?.r2_teetime ?? existingTournamentGolfer.roundTwoTeeTime,
        roundThreeTeeTime:
          field?.r3_teetime ?? existingTournamentGolfer.roundThreeTeeTime,
        roundFourTeeTime:
          field?.r4_teetime ?? existingTournamentGolfer.roundFourTeeTime,
        worldRank: ranking?.owgr_rank ?? undefined,
        rating: normalizeDgSkillEstimateToPgcRating(
          ranking?.dg_skill_estimate ?? -1.875,
        ),
        usage: nextUsage ?? undefined,
        updatedAt: Date.now(),
      };
      tournamentGolfersUpdated += 1;

      await ctx.db.patch(existingTournamentGolfer._id, updated);
      liveStats.push(updated);
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

    const tournamentCompleted =
      !args.roundIsRunning &&
      tournament.currentRound === 4 &&
      !isRoundRunningFromLiveStats(liveStats);

    const nextCurrentRound = tournamentCompleted ? 5 : args.currentRound;
    const nextStatus: Doc<"tournaments">["status"] =
      tournament.status === "cancelled"
        ? "cancelled"
        : tournamentCompleted
          ? "completed"
          : tournament.status === "completed"
            ? "completed"
            : isRoundRunningFromLiveStats(liveStats)
              ? "active"
              : tournament.status;

    await ctx.db.patch(args.tournamentId, {
      currentRound: nextCurrentRound,
      ...(isRoundRunningFromLiveStats(liveStats)
        ? { livePlay: true }
        : { livePlay: false }),
      dataGolfInPlayLastUpdate: args.dataGolfInPlayLastUpdate,
      ...(nextStatus !== tournament.status ? { status: nextStatus } : {}),
      leaderboardLastUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      eventName: args.eventName,
      currentRound: tournamentCompleted ? 5 : nextCurrentRound,
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
