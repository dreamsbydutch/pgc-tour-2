import { useAction } from "@/convex";
import type { TournamentCourseStatsDto, TournamentHoleStatRow } from "@/types";
import { buildTournamentHoleStatRows } from "@/utils/tournamentCourseStats";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

export function useTournamentCourseStats(
  tournamentId: string,
  enabled: boolean,
) {
  const loadCourseStats = useAction(
    api.functions.tournamentCourseStats.getTournamentHoleStats,
  );
  const [data, setData] = useState<TournamentCourseStatsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeTournamentId = useRef(tournamentId);

  const load = useCallback(async () => {
    const requestedTournamentId = tournamentId;
    setLoading(true);
    setError(null);
    try {
      const result = await loadCourseStats({
        tournamentId: tournamentId as Id<"tournaments">,
      });
      if (activeTournamentId.current === requestedTournamentId) {
        setData(result);
      }
    } catch {
      if (activeTournamentId.current === requestedTournamentId) {
        setError("Course scoring is temporarily unavailable.");
      }
    } finally {
      if (activeTournamentId.current === requestedTournamentId) {
        setLoading(false);
      }
    }
  }, [loadCourseStats, tournamentId]);

  useEffect(() => {
    activeTournamentId.current = tournamentId;
    setData(null);
    setError(null);
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    if (enabled && !data && !loading && !error) void load();
  }, [data, enabled, error, load, loading]);

  const rows = useMemo<TournamentHoleStatRow[]>(
    () =>
      data?.status === "available" ? buildTournamentHoleStatRows(data) : [],
    [data],
  );

  return { data, rows, loading, error, reload: load };
}
