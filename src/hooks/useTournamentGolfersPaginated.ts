import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type TournamentGolferRecordsPage = {
  page: Array<Doc<"tournamentGolfers">>;
  isDone: boolean;
  continueCursor: string | null;
};

export function useTournamentGolfersPaginated(args: {
  tournamentId?: Id<"tournaments"> | null;
  golferId?: Id<"golfers"> | null;
  limit?: number;
}) {
  const tournamentId = args.tournamentId ?? null;
  const golferId = args.golferId ?? null;
  const limit = args.limit ?? 200;

  const [cursor, setCursor] = useState<string | null>(null);
  const [allRecords, setAllRecords] = useState<Array<Doc<"tournamentGolfers">>>(
    [],
  );
  const [isDone, setIsDone] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);

  useEffect(() => {
    setCursor(null);
    setAllRecords([]);
    setIsDone(false);
    setShouldFetch(!!(tournamentId || golferId));
  }, [tournamentId, golferId]);

  const filter = useMemo(() => {
    const result: {
      tournamentId?: Id<"tournaments">;
      golferId?: Id<"golfers">;
    } = {};
    if (tournamentId) result.tournamentId = tournamentId;
    if (golferId) result.golferId = golferId;
    return result;
  }, [tournamentId, golferId]);

  const page = useQuery(
    api.functions.tournamentGolfers.getTournamentGolferRecordsPage,
    tournamentId || golferId
      ? shouldFetch
        ? { filter, cursor, limit }
        : "skip"
      : "skip",
  ) as TournamentGolferRecordsPage | undefined;

  const isLoading =
    !!(tournamentId || golferId) && shouldFetch && page === undefined;

  useEffect(() => {
    if (!shouldFetch) return;
    if (!page) return;

    setAllRecords((prev) => {
      if (!page.page.length) return prev;

      const seen = new Set<string>(prev.map((r) => r._id));
      const next = [...prev];

      for (const record of page.page) {
        if (!seen.has(record._id)) {
          seen.add(record._id);
          next.push(record);
        }
      }

      return next;
    });

    setCursor(page.continueCursor);
    setIsDone(page.isDone);
    setShouldFetch(false);
  }, [page, shouldFetch]);

  const loadMore = useCallback(() => {
    if (!tournamentId && !golferId) return;
    if (isDone) return;
    if (allRecords.length > 0 && cursor === null) return;

    setShouldFetch(true);
  }, [allRecords.length, cursor, isDone, tournamentId, golferId]);

  return {
    records: allRecords,
    loadMore,
    isDone,
    isLoading,
  };
}
