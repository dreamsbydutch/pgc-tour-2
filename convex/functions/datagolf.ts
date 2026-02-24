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
import {
  datagolfValidators,
  validateDataGolfFieldPlayer,
  validateDataGolfHistoricalPlayer,
  validateDataGolfLiveModelGolfer,
  validateDataGolfRankedPlayer,
  validateDataGolfWinningsPlayer,
} from "../validators/datagolf";
import { processData } from "../utils/batchProcess";
import {
  checkCompatabilityOfEventNames,
  fetchFromDataGolf,
} from "../utils/datagolf";
import type {
  DataGolfFieldUpdatesResponse,
  DataGolfRankingsResponse,
  DataGolfLiveModelPredictionsResponse,
  DataGolfHistoricalEventDataResponse,
  DataGolfHistoricalRoundDataResponse,
} from "../types/datagolf";
import { Id } from "../_generated/dataModel";

/**
 * Fetches the current event field (and metadata) from DataGolf.
 *
 * Inputs
 * - `args`: validated by `datagolfValidators.args.fetchFieldUpdates`
 * - `args.options?: object`
 *   - `tour?: string` (default: `"pga"`)
 *   - `format?: "json" | "csv"` (default: `"json"`)
 *   - `filterByCountry?: string`
 *   - `filterWithdrawn?: boolean` (withdrawn = `flag === "WD"` OR `unofficial === 1`)
 *   - `minSalary?: number` (DraftKings salary)
 *   - `maxSalary?: number` (DraftKings salary)
 *   - `sortBySalary?: boolean` (descending)
 *   - `sortByName?: boolean` (ascending)
 *   - `limit?: number`
 *   - `skip?: number`
 *
 * Output
 * - Returns `Promise<DataGolfFieldUpdatesResponse>`.
 * - When the upstream payload contains a `field` array, this function may return a filtered/sorted/paginated view
 *   of that `field`, but it preserves all other keys from the upstream response.
 *
 * Function blocks
 * 1. Options normalization and endpoint construction.
 * 2. DataGolf fetch.
 * 3. Optional local processing (`filter`/`sort`/`limit`/`skip`) of `data.field`.
 * 4. Return upstream payload with the (possibly) processed `field`.
 */
export const fetchFieldUpdates = action({
  args: datagolfValidators.args.fetchFieldUpdates,
  handler: async (
    _ctx,
    args,
  ): Promise<
    | DataGolfFieldUpdatesResponse
    | {
        ok: boolean;
        skipped: true;
        reason:
          | "missing_datagolf_event_name"
          | "event_name_mismatch"
          | "empty_field";
        tournamentId: Id<"tournaments">;
        tournamentName: string;
        dataGolfEventName?: string;
        score?: number;
        intersection?: string[];
        expectedTokens?: string[];
        actualTokens?: string[];
      }
  > => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";
    const endpoint = `/field-updates?tour=${tour}&file_format=${format}`;
    const data = await fetchFromDataGolf<Record<string, unknown>>(endpoint);
    if (!data.field || !Array.isArray(data.field))
      return {
        ok: false,
        skipped: true,
        reason: "empty_field",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
      };

    const processedField = processData(data.field, {
      filter: (player) => {
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
        ? (a, b) => (b.dk_salary || 0) - (a.dk_salary || 0)
        : options.sortByName
          ? (a, b) => a.player_name.localeCompare(b.player_name)
          : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    const eventName = String(data.event_name || "").trim();
    const compatible = checkCompatabilityOfEventNames(
      args.tournament.name,
      eventName,
    );
    if (!eventName) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_datagolf_event_name",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
      };
    }
    if (!compatible.ok) {
      return {
        ok: true,
        skipped: true,
        reason: "event_name_mismatch",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
        dataGolfEventName: eventName,
        score: compatible.score,
        intersection: compatible.intersection,
        expectedTokens: compatible.expectedTokens,
        actualTokens: compatible.actualTokens,
      };
    }
    if (!processedField.length) {
      return {
        ok: true,
        skipped: true,
        reason: "empty_field",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
        dataGolfEventName: eventName,
      };
    }
    return {
      ...data,
      field: processedField.map(validateDataGolfFieldPlayer),
    } as DataGolfFieldUpdatesResponse;
  },
});
/**
 * Fetches DataGolf world rankings (DataGolf rank + skill estimate).
 *
 * Inputs
 * - `args`: validated by `datagolfValidators.args.fetchDataGolfRankings`
 * - `args.options?: object`
 *   - `format?: "json" | "csv"` (default: `"json"`)
 *   - `filterByCountry?: string`
 *   - `filterByTour?: string`
 *   - `topN?: number` (keeps ranks `<= topN`)
 *   - `minSkillEstimate?: number` (keeps players where `dg_skill_estimate >= minSkillEstimate`)
 *   - `sortBySkill?: boolean` (descending)
 *   - `limit?: number`
 *   - `skip?: number`
 *
 * Output
 * - Returns `Promise<DataGolfRankingsResponse>`.
 * - If the upstream payload includes a `rankings` array, this function may return a processed view of it.
 *
 * Function blocks
 * 1. Options normalization and endpoint construction.
 * 2. DataGolf fetch.
 * 3. Optional local processing of `data.rankings`.
 * 4. Return upstream payload with processed `rankings`.
 */
export const fetchDataGolfRankings = action({
  args: datagolfValidators.args.fetchDataGolfRankings,
  handler: async (
    _ctx,
    args,
  ): Promise<DataGolfRankingsResponse | undefined> => {
    const options = args.options || {};
    const format = options.format || "json";

    const endpoint = `/preds/get-dg-rankings?file_format=${format}`;
    const data = await fetchFromDataGolf<Record<string, unknown>>(endpoint);

    if (!data.rankings || !Array.isArray(data.rankings)) return undefined;

    const processedRankings = processData(data.rankings, {
      filter: (player) => {
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
        ? (a, b) => b.dg_skill_estimate - a.dg_skill_estimate
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    return {
      ...data,
      rankings: processedRankings.map(validateDataGolfRankedPlayer),
    } as DataGolfRankingsResponse;
  },
});
/**
 * Fetches live in-play win/top-X probabilities from DataGolf.
 *
 * Inputs
 * - `args`: validated by `datagolfValidators.args.fetchLiveModelPredictions`
 * - `args.options?: object`
 *   - `tour?: string` (default: `"pga"`)
 *   - `format?: "json" | "csv"` (default: `"json"`)
 *   - `oddsFormat?: "percent" | "american" | "decimal"` (default: `"percent"`)
 *   - `deadHeat?: boolean` (default: `false`)
 *   - `onlyActivePlayers?: boolean` (filters out `thru === "WD"`)
 *   - `filterByPosition?: { current?: string; maxPosition?: number }`
 *   - `minWinProbability?: number`
 *   - `sortByPosition?: boolean` (ascending numeric position, non-numeric sorts to bottom)
 *   - `limit?: number`
 *   - `skip?: number`
 *
 * Output
 * - Returns `Promise<DataGolfLiveModelPredictionsResponse>`.
 * - If the upstream payload includes a `data` array, this function may return a processed view of it.
 *
 * Function blocks
 * 1. Options normalization and endpoint construction.
 * 2. DataGolf fetch.
 * 3. Optional local processing of `data.data`.
 * 4. Return upstream payload with processed `data`.
 */
export const fetchLiveModelPredictions = action({
  args: datagolfValidators.args.fetchLiveModelPredictions,
  handler: async (
    _ctx,
    args,
  ): Promise<
    | DataGolfLiveModelPredictionsResponse
    | {
        ok: boolean;
        skipped: boolean;
        reason:
          | "missing_datagolf_event_name"
          | "event_name_mismatch"
          | "empty_data";
        tournamentId: Id<"tournaments">;
        tournamentName: string;
        dataGolfEventName?: string;
        score?: number;
        intersection?: string[];
        expectedTokens?: string[];
        actualTokens?: string[];
      }
  > => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";
    const oddsFormat = options.oddsFormat || "percent";
    const deadHeat = options.deadHeat === true ? "yes" : "no";

    const endpoint = `/preds/in-play?tour=${tour}&dead_heat=${deadHeat}&odds_format=${oddsFormat}&file_format=${format}`;
    const data = await fetchFromDataGolf<Record<string, unknown>>(endpoint);

    if (!data.data || !Array.isArray(data.data))
      return {
        ok: true,
        skipped: true,
        reason: "empty_data",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
      };

    const processedData = processData(data.data, {
      filter: (player) => {
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
        ? (a, b) => {
            const posA = parseInt(a.current_pos.replace(/[^\d]/g, "")) || 999;
            const posB = parseInt(b.current_pos.replace(/[^\d]/g, "")) || 999;
            return posA - posB;
          }
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    const info = data.info as { event_name?: string } | undefined;
    const eventName = String(info?.event_name || "").trim();
    const compatible = checkCompatabilityOfEventNames(
      args.tournament.name,
      eventName,
    );
    if (!eventName) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_datagolf_event_name",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
      };
    }
    if (!compatible.ok) {
      return {
        ok: true,
        skipped: true,
        reason: "event_name_mismatch",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
        dataGolfEventName: eventName,
        score: compatible.score,
        intersection: compatible.intersection,
        expectedTokens: compatible.expectedTokens,
        actualTokens: compatible.actualTokens,
      };
    }
    if (!processedData.length) {
      return {
        ok: true,
        skipped: true,
        reason: "empty_data",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
        dataGolfEventName: eventName,
      };
    }
    return {
      ...data,
      data: processedData.map(validateDataGolfLiveModelGolfer),
    } as DataGolfLiveModelPredictionsResponse;
  },
});
/**
 * Fetches historical per-round scoring data from DataGolf raw historical endpoint.
 *
 * Inputs
 * - `args`: validated by `datagolfValidators.args.fetchHistoricalRoundData`
 * - `args.options`: object
 *   - `tour: string`
 *   - `eventId: string`
 *   - `year: number`
 *   - `format?: "json" | "csv"` (default: `"json"`)
 *   - `filterByPlayer?: string` (case-insensitive substring match on `player_name`)
 *   - `filterByRound?: 1 | 2 | 3 | 4` (keeps players having `round_N`)
 *   - `sortByScore?: boolean` (ascending numeric `fin_text`, non-numeric sorts to bottom)
 *   - `includeStats?: boolean` (default: `true`; when `false`, strips most per-round fields)
 *   - `limit?: number`
 *   - `skip?: number`
 *
 * Output
 * - Returns `Promise<DataGolfHistoricalRoundDataResponse>`.
 * - If `includeStats` is `false`, each `round_N` object is reduced to a small subset
 *   (`score`, `birdies`, `bogies`, `eagles_or_better`, `doubles_or_worse`).
 *
 * Function blocks
 * 1. Options normalization and endpoint construction.
 * 2. DataGolf fetch.
 * 3. Optional local processing of `data.scores`.
 * 4. Optional post-processing to strip heavy stats payload.
 * 5. Return upstream payload with processed `scores`.
 */
export const fetchHistoricalRoundData = action({
  args: datagolfValidators.args.fetchHistoricalRoundData,
  handler: async (
    _ctx,
    args,
  ): Promise<
    | DataGolfHistoricalRoundDataResponse
    | {
        ok: boolean;
        skipped: boolean;
        reason:
          | "missing_datagolf_event_name"
          | "event_name_mismatch"
          | "empty_data";
        tournamentId: Id<"tournaments">;
        tournamentName: string;
        dataGolfEventName?: string;
        score?: number;
        intersection?: string[];
        expectedTokens?: string[];
        actualTokens?: string[];
      }
  > => {
    const options = args.options;
    const format = options.format || "json";
    if (!args.tournament.apiId) {
      console.warn("eventId is required to fetch historical round data");
    }
    const endpoint = `/historical-raw-data/rounds?tour=${options.tour}&event_id=${args.tournament.apiId}&year=${options.year}&file_format=${format}`;
    const data = await fetchFromDataGolf<Record<string, unknown>>(endpoint);
    if (!data.scores || !Array.isArray(data.scores))
      return {
        ok: true,
        skipped: true,
        reason: "empty_data",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
      };

    const processedScores = processData(data.scores, {
      filter: (player) => {
        if (
          options.filterByPlayer &&
          !player.player_name
            .toLowerCase()
            .includes(options.filterByPlayer.toLowerCase())
        )
          return false;

        if (options.filterByRound) {
          const roundKey = `round_${options.filterByRound}`;
          if (!player[roundKey]) return false;
        }

        return true;
      },
      sort: options.sortByScore
        ? (a, b) => {
            const finA = parseInt(a.fin_text) || 999;
            const finB = parseInt(b.fin_text) || 999;
            return finA - finB;
          }
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });
    const info = data as { event_name?: string } | undefined;
    const eventName = String(info?.event_name || "").trim();
    const compatible = checkCompatabilityOfEventNames(
      args.tournament.name,
      eventName,
    );
    if (!eventName) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_datagolf_event_name",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
      };
    }
    if (!compatible.ok) {
      return {
        ok: true,
        skipped: true,
        reason: "event_name_mismatch",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
        dataGolfEventName: eventName,
        score: compatible.score,
        intersection: compatible.intersection,
        expectedTokens: compatible.expectedTokens,
        actualTokens: compatible.actualTokens,
      };
    }
    if (!processedScores.length) {
      return {
        ok: true,
        skipped: true,
        reason: "empty_data",
        tournamentId: args.tournament._id,
        tournamentName: args.tournament.name,
        dataGolfEventName: eventName,
      };
    }

    return {
      ...data,
      scores: processedScores.map((g) =>
        validateDataGolfHistoricalPlayer(
          g,
          args.options.tzOffset ?? -18000000,
          new Date(data.event_completed as string).getTime(),
        ),
      ),
    } as DataGolfHistoricalRoundDataResponse;
  },
});

/**
 * Fetches historical event-level statistics for a specific event/year from DataGolf.
 *
 * Inputs
 * - `args`: validated by `datagolfValidators.args.fetchHistoricalEventDataEvents`
 * - `args.options`: object
 *   - `tour: string`
 *   - `eventId: string`
 *   - `year: number`
 *   - `format?: "json" | "csv"` (default: `"json"`)
 *
 * Output
 * - Returns `Promise<DataGolfHistoricalEventDataResponse>`.
 * - The fetch uses a runtime shape check to ensure the JSON contains `event_stats` as an array.
 *
 * Function blocks
 * 1. Options normalization and endpoint construction.
 * 2. DataGolf fetch with a response guard.
 */
export const fetchHistoricalEventDataEvents = action({
  args: datagolfValidators.args.fetchHistoricalEventDataEvents,
  handler: async (
    ctx,
    { tournament, options },
  ): Promise<
    | DataGolfHistoricalEventDataResponse
    | {
        ok: boolean;
        skipped: boolean;
        reason:
          | "missing_datagolf_event_name"
          | "event_name_mismatch"
          | "empty_data";
        tournamentId: Id<"tournaments">;
        tournamentName: string;
        dataGolfEventName?: string;
        score?: number;
        intersection?: string[];
        expectedTokens?: string[];
        actualTokens?: string[];
      }
  > => {
    void ctx;
    if (!tournament.apiId) {
      console.warn("eventId is required to fetch historical event data");
    }
    const format = (options.format || "json") as "json" | "csv";
    const endpoint = `/historical-event-data/events?tour=${options.tour}&event_id=${tournament.apiId}&year=${options.year}&file_format=${format}`;
    const data = await fetchFromDataGolf<Record<string, unknown>>(endpoint);
    if (!data.scores || !Array.isArray(data.scores))
      return {
        ok: true,
        skipped: true,
        reason: "empty_data",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
      };

    const processedScores =
      data.event_stats && Array.isArray(data.event_stats)
        ? data.event_stats
        : [];
    const info = data as { event_name?: string } | undefined;
    const eventName = String(info?.event_name || "").trim();
    const compatible = checkCompatabilityOfEventNames(
      tournament.name,
      eventName,
    );
    if (!eventName) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_datagolf_event_name",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
      };
    }
    if (!compatible.ok) {
      return {
        ok: true,
        skipped: true,
        reason: "event_name_mismatch",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        dataGolfEventName: eventName,
        score: compatible.score,
        intersection: compatible.intersection,
        expectedTokens: compatible.expectedTokens,
        actualTokens: compatible.actualTokens,
      };
    }
    if (!processedScores.length) {
      return {
        ok: true,
        skipped: true,
        reason: "empty_data",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        dataGolfEventName: eventName,
      };
    }

    return {
      ...data,
      event_stats: processedScores.map(validateDataGolfWinningsPlayer),
    } as DataGolfHistoricalEventDataResponse;
  },
});
