import { useEffect, useState } from "react";

import { api, useQuery } from "@/convex";
import type { Id } from "@/convex";

/** Loads standings history only while its member row is expanded. */
export function useStandingsHistory(
  tourCardId: Id<"tourCards">,
  enabled: boolean,
) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [items, setItems] = useState<
    NonNullable<
      ReturnType<
        typeof useQuery<
          typeof api.functions.seasons.getTourCardTournamentHistory
        >
      >
    >["page"]
  >([]);
  const result = useQuery(
    api.functions.seasons.getTourCardTournamentHistory,
    enabled ? { tourCardId, cursor, limit: 25 } : "skip",
  );

  useEffect(() => {
    setCursor(null);
    setItems([]);
  }, [enabled, tourCardId]);

  useEffect(() => {
    if (!result) return;
    setItems((current) => {
      const byId = new Map(current.map((item) => [String(item._id), item]));
      for (const item of result.page) byId.set(String(item._id), item);
      return [...byId.values()].sort(
        (a, b) => b.tournament.startDate - a.tournament.startDate,
      );
    });
  }, [result]);

  return {
    items,
    isLoading: enabled && result === undefined,
    canLoadMore: result?.isDone === false,
    loadMore: () => {
      if (result && !result.isDone) setCursor(result.continueCursor);
    },
  };
}
