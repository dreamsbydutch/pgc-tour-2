"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex";
import { getErrorMessage } from "@/lib";

const dataGolfActions = {
  fetchFieldUpdates: api.functions.datagolf.fetchFieldUpdates,
  fetchDataGolfRankings: api.functions.datagolf.fetchDataGolfRankings,
  fetchLiveModelPredictions: api.functions.datagolf.fetchLiveModelPredictions,
  fetchHistoricalRoundData: api.functions.datagolf.fetchHistoricalRoundData,
  fetchHistoricalEventDataEvents:
    api.functions.datagolf.fetchHistoricalEventDataEvents,
} as const;

type DataGolfActionMap = typeof dataGolfActions;
type DataGolfEndpoint = keyof DataGolfActionMap;
type DataGolfActionReference<K extends DataGolfEndpoint> = DataGolfActionMap[K];
type DataGolfActionArgs<K extends DataGolfEndpoint> =
  DataGolfActionReference<K>["_args"];
type DataGolfActionResult<K extends DataGolfEndpoint> =
  DataGolfActionReference<K>["_returnType"];

type DataGolfRequestByEndpoint = {
  [K in DataGolfEndpoint]: {
    endpoint: K;
    args: DataGolfActionArgs<K>;
    enabled?: boolean;
  };
}[DataGolfEndpoint];

export type DataGolfRequestMap = Record<string, DataGolfRequestByEndpoint>;

type DataGolfResultForRequest<Request extends DataGolfRequestByEndpoint> =
  Request extends { endpoint: infer K extends DataGolfEndpoint }
    ? DataGolfActionResult<K>
    : never;

type DataGolfResultMap<Requests extends DataGolfRequestMap> = {
  [K in keyof Requests]: DataGolfResultForRequest<Requests[K]> | undefined;
};

type DataGolfErrorMap<Requests extends DataGolfRequestMap> = Partial<
  Record<keyof Requests, string>
>;

type DataGolfActionRunnerMap = {
  [K in DataGolfEndpoint]: (
    args: DataGolfActionArgs<K>,
  ) => Promise<DataGolfActionResult<K>>;
};

export type UseDataGolfOptions<Requests extends DataGolfRequestMap> = {
  requests: Requests;
  enabled?: boolean;
};

export type UseDataGolfResult<Requests extends DataGolfRequestMap> = {
  data: DataGolfResultMap<Requests>;
  errors: DataGolfErrorMap<Requests>;
  status: "idle" | "loading" | "ready" | "error";
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
};

/**
 * Loads one or more configured DataGolf action endpoints from a single options object.
 *
 * Behavior:
 * - Accepts a keyed `requests` object so consumers can fetch any supported DataGolf endpoint.
 * - Executes all enabled requests in parallel.
 * - Returns typed results by request key along with aggregate loading and error state.
 *
 * @param options.requests - Keyed DataGolf endpoint requests to execute.
 * @param options.enabled - Global switch for skipping all requests.
 * @returns Typed request results, per-request errors, aggregate status, and a `refetch` helper.
 */
export function useDataGolf<Requests extends DataGolfRequestMap>(
  options: UseDataGolfOptions<Requests>,
): UseDataGolfResult<Requests> {
  const fetchFieldUpdates = useAction(dataGolfActions.fetchFieldUpdates);
  const fetchDataGolfRankings = useAction(
    dataGolfActions.fetchDataGolfRankings,
  );
  const fetchLiveModelPredictions = useAction(
    dataGolfActions.fetchLiveModelPredictions,
  );
  const fetchHistoricalRoundData = useAction(
    dataGolfActions.fetchHistoricalRoundData,
  );
  const fetchHistoricalEventDataEvents = useAction(
    dataGolfActions.fetchHistoricalEventDataEvents,
  );
  const [reloadCount, setReloadCount] = useState(0);
  const [state, setState] = useState<UseDataGolfResult<Requests>>({
    data: {} as DataGolfResultMap<Requests>,
    errors: {},
    status: "idle",
    isLoading: false,
    hasError: false,
    refetch: () => setReloadCount((count) => count + 1),
  });

  const runners: DataGolfActionRunnerMap = {
    fetchFieldUpdates,
    fetchDataGolfRankings,
    fetchLiveModelPredictions,
    fetchHistoricalRoundData,
    fetchHistoricalEventDataEvents,
  };

  const requestSignature = JSON.stringify(
    Object.entries(options.requests).map(([key, request]) => [
      key,
      request.endpoint,
      request.enabled ?? true,
      request.args,
    ]),
  );

  useEffect(() => {
    if (options.enabled === false) {
      setState({
        data: {} as DataGolfResultMap<Requests>,
        errors: {},
        status: "idle",
        isLoading: false,
        hasError: false,
        refetch: () => setReloadCount((count) => count + 1),
      });
      return;
    }

    let isCancelled = false;
    const requestEntries = Object.entries(options.requests) as Array<
      [keyof Requests, Requests[keyof Requests]]
    >;
    const enabledRequests = requestEntries.filter(
      ([, request]) => request.enabled !== false,
    );

    if (enabledRequests.length === 0) {
      setState({
        data: {} as DataGolfResultMap<Requests>,
        errors: {},
        status: "idle",
        isLoading: false,
        hasError: false,
        refetch: () => setReloadCount((count) => count + 1),
      });
      return;
    }

    setState((current) => ({
      ...current,
      status: "loading",
      isLoading: true,
      hasError: false,
      errors: {},
    }));

    const load = async () => {
      const nextData = {} as DataGolfResultMap<Requests>;
      const nextErrors = {} as DataGolfErrorMap<Requests>;

      await Promise.all(
        enabledRequests.map(async ([key, request]) => {
          try {
            const result = await executeDataGolfRequest(runners, request);
            nextData[key] = result as DataGolfResultMap<Requests>[typeof key];
          } catch (error) {
            nextErrors[key] = getErrorMessage(error);
          }
        }),
      );

      if (isCancelled) {
        return;
      }

      const hasError = Object.keys(nextErrors).length > 0;
      setState({
        data: nextData,
        errors: nextErrors,
        status: hasError ? "error" : "ready",
        isLoading: false,
        hasError,
        refetch: () => setReloadCount((count) => count + 1),
      });
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [
    fetchDataGolfRankings,
    fetchFieldUpdates,
    fetchHistoricalEventDataEvents,
    fetchHistoricalRoundData,
    fetchLiveModelPredictions,
    options.enabled,
    requestSignature,
    reloadCount,
  ]);

  return state;
}

async function executeDataGolfRequest(
  runners: DataGolfActionRunnerMap,
  request: DataGolfRequestByEndpoint,
): Promise<unknown> {
  switch (request.endpoint) {
    case "fetchFieldUpdates":
      return runners.fetchFieldUpdates(request.args);
    case "fetchDataGolfRankings":
      return runners.fetchDataGolfRankings(request.args);
    case "fetchLiveModelPredictions":
      return runners.fetchLiveModelPredictions(request.args);
    case "fetchHistoricalRoundData":
      return runners.fetchHistoricalRoundData(request.args);
    case "fetchHistoricalEventDataEvents":
      return runners.fetchHistoricalEventDataEvents(request.args);
  }
}
