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

import { action } from "../_generated/server";
import { datagolfValidators } from "../validators/datagolf";
import { processData } from "../utils/processData";
import {
  buildQueryParams,
  fetchFromDataGolf,
  impliedProbabilityFromOdds,
  isLiveTournamentStat,
  isNonEmptyString,
  isSkillRatingCategoryKey,
} from "../utils/datagolf";
import type {
  BettingMarketMatchups,
  BettingMarketOutright,
  BettingToolAllPairingsResponse,
  BettingToolMatchupsResponse,
  BettingToolOutrightsResponse,
  DataGolfEventId,
  FantasyProjectionPlayer,
  FantasyProjectionResponse,
  FantasySite,
  FantasySlate,
  HistoricalDfsEventListResponse,
  HistoricalDfsPointsResponse,
  HistoricalOddsEventListResponse,
  HistoricalOddsMatchupsResponse,
  HistoricalOddsOutrightsResponse,
  HistoricalOddsTour,
  LiveStrokesGainedResponse,
  LiveStrokesGainedView,
  OddsFormat,
  Player,
  ScheduleEvent,
  TourScheduleResponse,
  FieldPlayer,
  FieldUpdatesResponse,
  RankedPlayer,
  DataGolfRankingsResponse,
  PredictionPlayer,
  PreTournamentArchivePlayer,
  PreTournamentPredictionsArchiveResponse,
  PreTournamentPredictionsResponse,
  SkillDecompositionPlayer,
  SkillDecompositionsResponse,
  SkillRatingPlayer,
  SkillRatingsResponse,
  ApproachSkillFieldKey,
  ApproachSkillPlayer,
  ApproachSkillResponse,
  LiveModelPlayer,
  LiveModelPredictionsResponse,
  LiveStatsPlayer,
  LiveTournamentStatsResponse,
  HoleStats,
  LiveHoleStatsResponse,
  HistoricalEvent,
  HistoricalEventDataResponse,
  HistoricalPlayer,
  HistoricalRoundDataResponse,
} from "../types/datagolf";

/**
 * Fetch player list with comprehensive filtering and sorting options
 *
 * @example
 * const players = await ctx.runQuery(api.functions.datagolf.fetchPlayerList, {
 *   options: {
 *     filterByCountry: "USA",
 *     sortByName: true,
 *     limit: 50
 *   }
 * });
 */
export const fetchPlayerList = action({
  args: datagolfValidators.args.fetchPlayerList,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const format = options.format || "json";

    const endpoint = `/get-player-list?file_format=${format}`;
    const data = await fetchFromDataGolf<Player[]>(
      endpoint,
      (json): json is Player[] =>
        Array.isArray(json) &&
        (json.length === 0 ||
          json.every(
            (p) =>
              p && typeof p === "object" && "player_name" in p && "dg_id" in p,
          )),
    );

    if (!Array.isArray(data)) return data;

    return processData(data, {
      filter: (player: Player) => {
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
        ? (a: Player, b: Player) => a.player_name.localeCompare(b.player_name)
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });
  },
});

/**
 * Fetch tour schedule with location filtering and date sorting
 *
 * @example
 * const schedule = await ctx.runQuery(api.functions.datagolf.fetchTourSchedule, {
 *   options: {
 *     tour: "pga",
 *     upcomingOnly: true,
 *     sortByDate: true
 *   }
 * });
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
    const data = await fetchFromDataGolf<TourScheduleResponse>(
      endpoint,
      (json): json is TourScheduleResponse =>
        typeof json === "object" &&
        json !== null &&
        "schedule" in json &&
        Array.isArray((json as TourScheduleResponse).schedule),
    );

    if (!data.schedule || !Array.isArray(data.schedule)) return data;

    const processedSchedule = processData(data.schedule, {
      filter: (event: ScheduleEvent) => {
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
        ? (a: ScheduleEvent, b: ScheduleEvent) =>
            new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, schedule: processedSchedule };
  },
});

/**
 * Fetch field updates with salary and player filtering
 *
 * @example
 * const fieldUpdates = await ctx.runQuery(api.functions.datagolf.fetchFieldUpdates, {
 *   options: {
 *     tour: "pga",
 *     sortBySalary: true,
 *     minSalary: 8000,
 *     filterWithdrawn: false
 *   }
 * });
 */
export const fetchFieldUpdates = action({
  args: datagolfValidators.args.fetchFieldUpdates,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";

    const endpoint = `/field-updates?tour=${tour}&file_format=${format}`;
    const data = await fetchFromDataGolf<FieldUpdatesResponse>(endpoint);

    if (!data.field || !Array.isArray(data.field)) return data;

    const processedField = processData(data.field, {
      filter: (player: FieldPlayer) => {
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
        ? (a: FieldPlayer, b: FieldPlayer) =>
            (b.dk_salary || 0) - (a.dk_salary || 0)
        : options.sortByName
          ? (a: FieldPlayer, b: FieldPlayer) =>
              a.player_name.localeCompare(b.player_name)
          : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, field: processedField };
  },
});

/**
 * Fetch DataGolf rankings with country and skill filtering
 *
 * @example
 * const rankings = await ctx.runQuery(api.functions.datagolf.fetchDataGolfRankings, {
 *   options: {
 *     topN: 50,
 *     filterByCountry: "USA",
 *     sortBySkill: true
 *   }
 * });
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
      filter: (player: RankedPlayer) => {
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
        ? (a: RankedPlayer, b: RankedPlayer) =>
            b.dg_skill_estimate - a.dg_skill_estimate
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, rankings: processedRankings };
  },
});

/**
 * Fetch pre-tournament predictions with comprehensive filtering
 *
 * @example
 * const predictions = await ctx.runQuery(api.functions.datagolf.fetchPreTournamentPredictions, {
 *   options: {
 *     tour: "pga",
 *     model: "baseline",
 *     sortByWinProbability: true,
 *     minWinProbability: 0.05
 *   }
 * });
 */
export const fetchPreTournamentPredictions = action({
  args: datagolfValidators.args.fetchPreTournamentPredictions,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";
    const oddsFormat = (options.oddsFormat || "percent") as OddsFormat;
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
      await fetchFromDataGolf<PreTournamentPredictionsResponse>(endpoint);

    const modelKey = options.model || "baseline";
    const modelData = data[modelKey];

    if (!modelData || !Array.isArray(modelData)) return data;
    if (modelData.length > 0 && typeof modelData[0] === "string") return data;

    const predictionPlayers: PredictionPlayer[] = modelData.filter(
      (item): item is PredictionPlayer => typeof item !== "string",
    );

    const getWinProb = (win: number | string): number | null =>
      impliedProbabilityFromOdds(win, oddsFormat);

    const processedPredictions = processData(predictionPlayers, {
      filter: (player: PredictionPlayer) => {
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
        ? (a: PredictionPlayer, b: PredictionPlayer) => {
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
 * Fetch player skill decompositions with detailed prediction breakdowns
 */
export const fetchPlayerSkillDecompositions = action({
  args: datagolfValidators.args.fetchPlayerSkillDecompositions,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";

    const endpoint = `/preds/player-decompositions?tour=${tour}&file_format=${format}`;
    const data = await fetchFromDataGolf<SkillDecompositionsResponse>(endpoint);

    if (!data.players || !Array.isArray(data.players)) return data;

    const processedPlayers = processData(data.players, {
      filter: (player: SkillDecompositionPlayer) => {
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
        ? (a: SkillDecompositionPlayer, b: SkillDecompositionPlayer) =>
            b.final_pred - a.final_pred
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
 * Fetch skill ratings with category-specific sorting
 */
export const fetchSkillRatings = action({
  args: datagolfValidators.args.fetchSkillRatings,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const display = options.display || "value";
    const format = options.format || "json";

    const endpoint = `/preds/skill-ratings?display=${display}&file_format=${format}`;
    const data = await fetchFromDataGolf<SkillRatingsResponse>(endpoint);

    if (!data.players || !Array.isArray(data.players)) return data;

    const processedPlayers = processData(data.players, {
      filter: (player: SkillRatingPlayer) => {
        if (options.minTotalSG && player.sg_total < options.minTotalSG)
          return false;
        return true;
      },
      sort: options.sortByCategory
        ? (a: SkillRatingPlayer, b: SkillRatingPlayer) => {
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
 * Fetch approach skill data with distance-based filtering
 */
export const fetchApproachSkill = action({
  args: datagolfValidators.args.fetchApproachSkill,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const period = options.period || "l24";
    const format = options.format || "json";

    const endpoint = `/preds/approach-skill?period=${period}&file_format=${format}`;
    const data = await fetchFromDataGolf<ApproachSkillResponse>(endpoint);

    if (!data.data || !Array.isArray(data.data)) return data;

    const processedData = processData(data.data, {
      filter: (player: ApproachSkillPlayer) => {
        if (options.minShotCount) {
          const shotCountField: ApproachSkillFieldKey = options.distanceRange
            ? (`${options.distanceRange}_shot_count` as ApproachSkillFieldKey)
            : "50_100_fw_shot_count";
          if ((player[shotCountField] ?? 0) < options.minShotCount)
            return false;
        }
        return true;
      },
      sort: options.sortByProximity
        ? (a: ApproachSkillPlayer, b: ApproachSkillPlayer) => {
            const proximityField: ApproachSkillFieldKey = options.distanceRange
              ? (`${options.distanceRange}_proximity_per_shot` as ApproachSkillFieldKey)
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
 * Fetch live model predictions with position and probability filtering
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
      await fetchFromDataGolf<LiveModelPredictionsResponse>(endpoint);

    if (!data.data || !Array.isArray(data.data)) return data;

    const processedData = processData(data.data, {
      filter: (player: LiveModelPlayer) => {
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
        ? (a: LiveModelPlayer, b: LiveModelPlayer) => {
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
 * Fetch live tournament stats with comprehensive stat filtering
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
    const data = await fetchFromDataGolf<LiveTournamentStatsResponse>(endpoint);

    if (!data.live_stats || !Array.isArray(data.live_stats)) return data;

    const processedStats = processData(data.live_stats, {
      filter: (player: LiveStatsPlayer) => {
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
        ? (a: LiveStatsPlayer, b: LiveStatsPlayer) => {
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
 * Fetch live hole statistics with hole and difficulty filtering
 */
export const fetchLiveHoleStats = action({
  args: datagolfValidators.args.fetchLiveHoleStats,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";

    const endpoint = `/preds/live-hole-stats?tour=${tour}&file_format=${format}`;
    const data = await fetchFromDataGolf<LiveHoleStatsResponse>(endpoint);

    if (!data.courses || !Array.isArray(data.courses)) return data;

    const processedCourses = data.courses.map((course) => ({
      ...course,
      rounds: course.rounds?.map((round) => ({
        ...round,
        holes: round.holes
          ?.filter((hole: HoleStats) => {
            if (options.filterByHole && hole.hole !== options.filterByHole)
              return false;
            if (options.filterByPar && hole.par !== options.filterByPar)
              return false;
            return true;
          })
          .sort(
            options.sortByDifficulty
              ? (a: HoleStats, b: HoleStats) => {
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
 * Fetch historical raw data event list
 */
export const fetchHistoricalEventList = action({
  args: datagolfValidators.args.fetchHistoricalEventList,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const format = options.format || "json";

    const endpoint = `/historical-raw-data/event-list?file_format=${format}`;
    const data = await fetchFromDataGolf<HistoricalEvent[]>(endpoint);

    if (!Array.isArray(data)) return data;

    return processData(data, {
      filter: (event: HistoricalEvent) => {
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
        ? (a: HistoricalEvent, b: HistoricalEvent) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });
  },
});

/**
 * Fetch historical round data with comprehensive filtering
 */
export const fetchHistoricalRoundData = action({
  args: datagolfValidators.args.fetchHistoricalRoundData,
  handler: async (_ctx, args) => {
    const options = args.options;
    const format = options.format || "json";

    const endpoint = `/historical-raw-data/rounds?tour=${options.tour}&event_id=${options.eventId}&year=${options.year}&file_format=${format}`;
    const data = await fetchFromDataGolf<HistoricalRoundDataResponse>(endpoint);

    if (!data.scores || !Array.isArray(data.scores)) return data;

    const processedScores = processData(data.scores, {
      filter: (player: HistoricalPlayer) => {
        if (
          options.filterByPlayer &&
          !player.player_name
            .toLowerCase()
            .includes(options.filterByPlayer.toLowerCase())
        )
          return false;

        if (options.filterByRound) {
          const roundKey =
            `round_${options.filterByRound}` as keyof HistoricalPlayer;
          if (!player[roundKey]) return false;
        }

        return true;
      },
      sort: options.sortByScore
        ? (a: HistoricalPlayer, b: HistoricalPlayer) => {
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
  handler: async (ctx, { options }): Promise<HistoricalEventDataResponse> => {
    void ctx;

    const format = (options.format || "json") as "json" | "csv";
    const endpoint = `/historical-event-data/events?tour=${options.tour}&event_id=${options.eventId}&year=${options.year}&file_format=${format}`;

    return fetchFromDataGolf<HistoricalEventDataResponse>(endpoint, (json) => {
      if (!json || typeof json !== "object") return false;
      const maybe = json as { event_stats?: unknown };
      return Array.isArray(maybe.event_stats);
    });
  },
});

export const fetchPreTournamentPredictionsArchive = action({
  args: datagolfValidators.args.fetchPreTournamentPredictionsArchive,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const format = options.format || "json";
    const oddsFormat = (options.oddsFormat || "percent") as OddsFormat;

    const params = buildQueryParams({
      event_id: options.eventId as DataGolfEventId | undefined,
      year: options.year,
      odds_format: oddsFormat,
      file_format: format,
    });

    const endpoint = `/preds/pre-tournament-archive?${params}`;
    const data =
      await fetchFromDataGolf<PreTournamentPredictionsArchiveResponse>(
        endpoint,
      );

    const modelKey = options.model || "baseline";
    const modelData = (data as Record<string, unknown>)[modelKey];
    if (!Array.isArray(modelData)) return data;

    const processed = processData(modelData as PreTournamentArchivePlayer[], {
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, [modelKey]: processed };
  },
});

export const fetchFantasyProjectionDefaults = action({
  args: datagolfValidators.args.fetchFantasyProjectionDefaults,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const site = (options.site || "draftkings") as FantasySite;
    const slate = (options.slate || "main") as FantasySlate;
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      site,
      slate,
      file_format: format,
    });

    const endpoint = `/preds/fantasy-projection-defaults?${params}`;
    const data = await fetchFromDataGolf<FantasyProjectionResponse>(endpoint);

    if (!Array.isArray(data.projections)) return data;

    const processed = processData(data.projections, {
      filter: (p: FantasyProjectionPlayer) => {
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
        ? (a: FantasyProjectionPlayer, b: FantasyProjectionPlayer) =>
            b.salary - a.salary
        : options.sortByProjection
          ? (a: FantasyProjectionPlayer, b: FantasyProjectionPlayer) =>
              b.proj_points - a.proj_points
          : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return { ...data, projections: processed };
  },
});

/**
 * DEPRECATED by DataGolf (prefer fetchLiveTournamentStats).
 */
export const fetchLiveStrokesGained = action({
  args: datagolfValidators.args.fetchLiveStrokesGained,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const sg = (options.sg || "raw") as LiveStrokesGainedView;
    const format = options.format || "json";

    const params = buildQueryParams({
      sg,
      file_format: format,
    });
    const endpoint = `/preds/live-strokes-gained?${params}`;

    return fetchFromDataGolf<LiveStrokesGainedResponse>(endpoint);
  },
});

export const fetchBettingToolsOutrights = action({
  args: datagolfValidators.args.fetchBettingToolsOutrights,
  handler: async (_ctx, args) => {
    const options = args.options;
    const tour = options.tour || "pga";
    const market = options.market as BettingMarketOutright;
    const oddsFormat = (options.oddsFormat || "decimal") as OddsFormat;
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      market,
      odds_format: oddsFormat,
      file_format: format,
    });

    const endpoint = `/betting-tools/outrights?${params}`;
    return fetchFromDataGolf<BettingToolOutrightsResponse>(endpoint);
  },
});

export const fetchBettingToolsMatchups = action({
  args: datagolfValidators.args.fetchBettingToolsMatchups,
  handler: async (_ctx, args) => {
    const options = args.options;
    const tour = options.tour || "pga";
    const market = options.market as BettingMarketMatchups;
    const oddsFormat = (options.oddsFormat || "decimal") as OddsFormat;
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      market,
      odds_format: oddsFormat,
      file_format: format,
    });

    const endpoint = `/betting-tools/matchups?${params}`;
    return fetchFromDataGolf<BettingToolMatchupsResponse>(endpoint);
  },
});

export const fetchBettingToolsMatchupsAllPairings = action({
  args: datagolfValidators.args.fetchBettingToolsMatchupsAllPairings,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const oddsFormat = (options.oddsFormat || "decimal") as OddsFormat;
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      odds_format: oddsFormat,
      file_format: format,
    });

    const endpoint = `/betting-tools/matchups-all-pairings?${params}`;
    return fetchFromDataGolf<BettingToolAllPairingsResponse>(endpoint);
  },
});

export const fetchHistoricalOddsEventList = action({
  args: datagolfValidators.args.fetchHistoricalOddsEventList,
  handler: async (_ctx, args) => {
    const options = args.options || {};
    const tour = options.tour as HistoricalOddsTour | undefined;
    const format = options.format || "json";

    const params = buildQueryParams({
      tour,
      file_format: format,
    });

    const endpoint = `/historical-odds/event-list?${params}`;
    return fetchFromDataGolf<HistoricalOddsEventListResponse>(endpoint);
  },
});

export const fetchHistoricalOddsOutrights = action({
  args: datagolfValidators.args.fetchHistoricalOddsOutrights,
  handler: async (_ctx, args) => {
    const options = args.options;
    const tour = (options.tour || "pga") as HistoricalOddsTour;
    const format = options.format || "json";
    const oddsFormat = (options.oddsFormat || "decimal") as OddsFormat;

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
    return fetchFromDataGolf<HistoricalOddsOutrightsResponse>(endpoint);
  },
});

export const fetchHistoricalOddsMatchups = action({
  args: datagolfValidators.args.fetchHistoricalOddsMatchups,
  handler: async (_ctx, args) => {
    const options = args.options;
    const tour = (options.tour || "pga") as HistoricalOddsTour;
    const format = options.format || "json";
    const oddsFormat = (options.oddsFormat || "decimal") as OddsFormat;

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
    return fetchFromDataGolf<HistoricalOddsMatchupsResponse>(endpoint);
  },
});

export const fetchHistoricalDfsEventList = action({
  args: datagolfValidators.args.fetchHistoricalDfsEventList,
  handler: async (_ctx, args) => {
    const format = args.options?.format || "json";
    const endpoint = `/historical-dfs-data/event-list?file_format=${format}`;
    return fetchFromDataGolf<HistoricalDfsEventListResponse>(endpoint);
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
    return fetchFromDataGolf<HistoricalDfsPointsResponse>(endpoint);
  },
});
