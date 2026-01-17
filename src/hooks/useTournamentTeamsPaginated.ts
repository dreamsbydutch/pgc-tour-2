import { useCallback, useEffect, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type TournamentTeamsPage = {
  page: Array<Doc<"teams">>;
  isDone: boolean;
  continueCursor: string | null;
};

export function useTournamentTeamsPaginated(args: {
  tournamentId?: Id<"tournaments"> | null;
}) {
  const tournamentId = args.tournamentId ?? null;

  const [cursor, setCursor] = useState<string | null>(null);
  const [allTeams, setAllTeams] = useState<Array<Doc<"teams">>>([]);
  const [isDone, setIsDone] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);

  useEffect(() => {
    setCursor(null);
    setAllTeams([]);
    setIsDone(false);
    setShouldFetch(!!tournamentId);
  }, [tournamentId]);

  const page = useQuery(
    api.functions.teams.getTournamentTeamsPage,
    tournamentId
      ? shouldFetch
        ? { tournamentId, cursor, limit: 200 }
        : "skip"
      : "skip",
  ) as TournamentTeamsPage | undefined;

  const isLoading = !!tournamentId && shouldFetch && page === undefined;

  useEffect(() => {
    if (!shouldFetch) return;
    if (!page) return;

    setAllTeams((prev) => {
      if (!page.page.length) return prev;

      const seen = new Set<string>(prev.map((t) => t._id));
      const next = [...prev];

      for (const team of page.page) {
        if (!seen.has(team._id)) {
          seen.add(team._id);
          next.push(team);
        }
      }

      return next;
    });

    setCursor(page.continueCursor);
    setIsDone(page.isDone);
    setShouldFetch(false);
  }, [page, shouldFetch]);

  const loadMore = useCallback(() => {
    if (!tournamentId) return;
    if (isDone) return;
    if (allTeams.length > 0 && cursor === null) return;

    setShouldFetch(true);
  }, [allTeams.length, cursor, isDone, tournamentId]);

  return {
    teams: allTeams,
    loadMore,
    isDone,
    isLoading,
  };
}
