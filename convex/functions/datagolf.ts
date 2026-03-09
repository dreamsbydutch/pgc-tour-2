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
  DataGolfHistoricalEventDataResponse,
  DataGolfHistoricalRoundDataResponse,
  DataGolfLiveModelPredictionsResponse,
  DataGolfRankingsResponse,
} from "../types/datagolf";
import { Id } from "../_generated/dataModel";

type DataGolfTournamentRef = {
  _id: Id<"tournaments">;
  name: string;
  apiId?: string;
};

type DataGolfTournamentSkipReason =
  | "missing_tournament_api_id"
  | "missing_datagolf_event_name"
  | "event_name_mismatch"
  | "empty_data"
  | "empty_field";

type DataGolfTournamentSkipDetails = {
  dataGolfEventName?: string;
  score?: number;
  intersection?: string[];
  expectedTokens?: string[];
  actualTokens?: string[];
};

type DataGolfTournamentSkipResult = {
  ok: false;
  skipped: true;
  reason: DataGolfTournamentSkipReason;
  tournamentId: Id<"tournaments">;
  tournamentName: string;
} & DataGolfTournamentSkipDetails;

type DataGolfRankingsSkipResult = {
  ok: false;
  skipped: true;
  reason: "empty_rankings";
};

/**
 * Builds a consistent skip payload for tournament-scoped DataGolf actions.
 *
 * @param tournament Tournament context for the skipped action.
 * @param reason Machine-readable skip reason.
 * @param details Optional event-name comparison metadata.
 * @returns A standardized skip response for callers.
 */
function createTournamentSkipResult(
  tournament: DataGolfTournamentRef,
  reason: DataGolfTournamentSkipReason,
  details: DataGolfTournamentSkipDetails = {},
): DataGolfTournamentSkipResult {
  return {
    ok: false,
    skipped: true,
    reason,
    tournamentId: tournament._id,
    tournamentName: tournament.name,
    ...details,
  };
}

/**
 * Builds a consistent skip payload for ranking actions that are not tournament-scoped.
 *
 * @returns A standardized skip response for callers.
 */
function createRankingsSkipResult(): DataGolfRankingsSkipResult {
  return {
    ok: false,
    skipped: true,
    reason: "empty_rankings",
  };
}

/**
 * Validates that a tournament has the API identifier required for historical DataGolf endpoints.
 *
 * @param tournament Tournament context passed into the action.
 * @returns The API identifier or a standardized skip response.
 */
function getTournamentApiId(
  tournament: DataGolfTournamentRef,
): string | DataGolfTournamentSkipResult {
  const apiId = tournament.apiId?.trim();
  if (apiId) {
    return apiId;
  }

  return createTournamentSkipResult(
    tournament,
    "missing_tournament_api_id",
  );
}

/**
 * Validates the upstream event name against the requested tournament name.
 *
 * @param tournament Tournament context passed into the action.
 * @param eventName Event name returned by DataGolf.
 * @returns A skip response when the event cannot be trusted for this tournament.
 */
function getEventNameValidationSkipResult(
  tournament: DataGolfTournamentRef,
  eventName: string,
): DataGolfTournamentSkipResult | undefined {
  if (!eventName) {
    return createTournamentSkipResult(
      tournament,
      "missing_datagolf_event_name",
    );
  }

  const compatibility = checkCompatabilityOfEventNames(
    tournament.name,
    eventName,
  );
  if (compatibility.ok) {
    return undefined;
  }

  return createTournamentSkipResult(tournament, "event_name_mismatch", {
    dataGolfEventName: eventName,
    score: compatibility.score,
    intersection: compatibility.intersection,
    expectedTokens: compatibility.expectedTokens,
    actualTokens: compatibility.actualTokens,
  });
}

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
 * - Returns `Promise<DataGolfFieldUpdatesResponse | DataGolfTournamentSkipResult>`.
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
  ): Promise<DataGolfFieldUpdatesResponse | DataGolfTournamentSkipResult> => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";
    const endpoint = `/field-updates?tour=${tour}&file_format=${format}`;
    const data = await fetchFromDataGolf<Record<string, unknown>>(endpoint);
    if (!data.field || !Array.isArray(data.field)) {
      return createTournamentSkipResult(args.tournament, "empty_field");
    }

    const eventName = String(data.event_name || "").trim();
    const eventNameSkipResult = getEventNameValidationSkipResult(
      args.tournament,
      eventName,
    );
    if (eventNameSkipResult) {
      return eventNameSkipResult;
    }

    const processedField = processData(data.field, {
      filter: (player: Record<string, unknown>) => {
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
          Number(player.dk_salary) < options.minSalary
        )
          return false;
        if (
          options.maxSalary &&
          player.dk_salary &&
          Number(player.dk_salary) > options.maxSalary
        )
          return false;
        return true;
      },
      sort: options.sortBySalary
        ? (a: Record<string, unknown>, b: Record<string, unknown>) =>
            (Number(b.dk_salary) || 0) - (Number(a.dk_salary) || 0)
        : options.sortByName
          ? (a: Record<string, unknown>, b: Record<string, unknown>) =>
              String(a.player_name).localeCompare(String(b.player_name))
          : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    if (!processedField.length) {
      return createTournamentSkipResult(args.tournament, "empty_field", {
        dataGolfEventName: eventName,
      });
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
 * - Returns `Promise<DataGolfRankingsResponse | DataGolfRankingsSkipResult>`.
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
  ): Promise<DataGolfRankingsResponse | DataGolfRankingsSkipResult> => {
    const options = args.options || {};
    const format = options.format || "json";

    const endpoint = `/preds/get-dg-rankings?file_format=${format}`;
    const data = await fetchFromDataGolf<Record<string, unknown>>(endpoint);

    if (!data.rankings || !Array.isArray(data.rankings)) {
      return createRankingsSkipResult();
    }

    const processedRankings = processData(data.rankings, {
      filter: (player: Record<string, unknown>) => {
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
        if (options.topN && Number(player.datagolf_rank) > options.topN)
          return false;
        if (
          options.minSkillEstimate &&
          Number(player.dg_skill_estimate) < options.minSkillEstimate
        )
          return false;
        return true;
      },
      sort: options.sortBySkill
        ? (a: Record<string, unknown>, b: Record<string, unknown>) =>
            Number(b.dg_skill_estimate) - Number(a.dg_skill_estimate)
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    if (!processedRankings.length) {
      return createRankingsSkipResult();
    }

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
 * - Returns `Promise<DataGolfLiveModelPredictionsResponse | DataGolfTournamentSkipResult>`.
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
    DataGolfLiveModelPredictionsResponse | DataGolfTournamentSkipResult
  > => {
    const options = args.options || {};
    const tour = options.tour || "pga";
    const format = options.format || "json";
    const oddsFormat = options.oddsFormat || "percent";
    const deadHeat = options.deadHeat === true ? "yes" : "no";

    const endpoint = `/preds/in-play?tour=${tour}&dead_heat=${deadHeat}&odds_format=${oddsFormat}&file_format=${format}`;
    const data = await fetchFromDataGolf<Record<string, unknown>>(endpoint);

    if (!data.data || !Array.isArray(data.data)) {
      return createTournamentSkipResult(args.tournament, "empty_data");
    }

    const info = data.info as { event_name?: string } | undefined;
    const eventName = String(info?.event_name || "").trim();
    const eventNameSkipResult = getEventNameValidationSkipResult(
      args.tournament,
      eventName,
    );
    if (eventNameSkipResult) {
      return eventNameSkipResult;
    }

    const processedData = processData(data.data, {
      filter: (player: Record<string, unknown>) => {
        if (options.onlyActivePlayers && player.thru === "WD") return false;
        if (
          options.filterByPosition?.current &&
          player.current_pos !== options.filterByPosition.current
        )
          return false;
        if (options.filterByPosition?.maxPosition) {
          const position =
            parseInt(String(player.current_pos).replace(/[^\d]/g, "")) || 999;
          if (position > options.filterByPosition.maxPosition) return false;
        }
        if (
          options.minWinProbability &&
          Number(player.win) < options.minWinProbability
        )
          return false;
        return true;
      },
      sort: options.sortByPosition
        ? (a: Record<string, unknown>, b: Record<string, unknown>) => {
            const posA =
              parseInt(String(a.current_pos).replace(/[^\d]/g, "")) || 999;
            const posB =
              parseInt(String(b.current_pos).replace(/[^\d]/g, "")) || 999;
            return posA - posB;
          }
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });

    if (!processedData.length) {
      return createTournamentSkipResult(args.tournament, "empty_data", {
        dataGolfEventName: eventName,
      });
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
 *   - `year: number`
 *   - `tzOffset?: number`
 *   - `format?: "json" | "csv"` (default: `"json"`)
 *   - `filterByPlayer?: string` (case-insensitive substring match on `player_name`)
 *   - `filterByRound?: number` (keeps players having `round_N`)
 *   - `sortByScore?: boolean` (ascending numeric `fin_text`, non-numeric sorts to bottom)
 *   - `limit?: number`
 *   - `skip?: number`
 *
 * Output
 * - Returns `Promise<DataGolfHistoricalRoundDataResponse | DataGolfTournamentSkipResult>`.
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
    DataGolfHistoricalRoundDataResponse | DataGolfTournamentSkipResult
  > => {
    const options = args.options;
    const format = options.format || "json";
    const apiId = getTournamentApiId(args.tournament);
    if (typeof apiId !== "string") {
      return apiId;
    }

    const endpoint = `/historical-raw-data/rounds?tour=${options.tour}&event_id=${apiId}&year=${options.year}&file_format=${format}`;
    const data = await fetchFromDataGolf<Record<string, unknown>>(endpoint);
    if (!data.scores || !Array.isArray(data.scores)) {
      return createTournamentSkipResult(args.tournament, "empty_data");
    }

    const info = data as { event_name?: string } | undefined;
    const eventName = String(info?.event_name || "").trim();
    const eventNameSkipResult = getEventNameValidationSkipResult(
      args.tournament,
      eventName,
    );
    if (eventNameSkipResult) {
      return eventNameSkipResult;
    }

    const processedScores = processData(data.scores, {
      filter: (player: Record<string, unknown>) => {
        if (
          options.filterByPlayer &&
          !String(player.player_name)
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
        ? (a: Record<string, unknown>, b: Record<string, unknown>) => {
            const finA = parseInt(String(a.fin_text)) || 999;
            const finB = parseInt(String(b.fin_text)) || 999;
            return finA - finB;
          }
        : undefined,
      limit: options.limit,
      skip: options.skip,
    });
    if (!processedScores.length) {
      return createTournamentSkipResult(args.tournament, "empty_data", {
        dataGolfEventName: eventName,
      });
    }

    return {
      ...data,
      scores: processedScores.map((g: Record<string, unknown>) =>
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
 *   - `year: number`
 *   - `format?: "json" | "csv"` (default: `"json"`)
 *
 * Output
 * - Returns `Promise<DataGolfHistoricalEventDataResponse | DataGolfTournamentSkipResult>`.
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
    DataGolfHistoricalEventDataResponse | DataGolfTournamentSkipResult
  > => {
    void ctx;
    const apiId = getTournamentApiId(tournament);
    if (typeof apiId !== "string") {
      return apiId;
    }

    const format = options.format || "json";
    const endpoint = `/historical-event-data/events?tour=${options.tour}&event_id=${apiId}&year=${options.year}&file_format=${format}`;
    const data = await fetchFromDataGolf<Record<string, unknown>>(endpoint);

    if (!data.event_stats || !Array.isArray(data.event_stats)) {
      return createTournamentSkipResult(tournament, "empty_data");
    }

    const info = data as { event_name?: string } | undefined;
    const eventName = String(info?.event_name || "").trim();
    const eventNameSkipResult = getEventNameValidationSkipResult(
      tournament,
      eventName,
    );
    if (eventNameSkipResult) {
      return eventNameSkipResult;
    }

    if (!data.event_stats.length) {
      return createTournamentSkipResult(tournament, "empty_data", {
        dataGolfEventName: eventName,
      });
    }

    return {
      ...data,
      event_stats: data.event_stats.map(
        (player: Record<string, unknown>) =>
          validateDataGolfWinningsPlayer(player),
      ),
    } as DataGolfHistoricalEventDataResponse;
  },
});
