import { useMemo } from "react";
import { useQuery } from "convex/react";

import type { LeagueScheduleProps } from "@/lib/types";
import { api } from "@/convex";
import type { Id } from "@/convex";
import type { EnhancedTournamentDoc } from "../../convex/types/types";
import { getTournamentTimeline } from "@/lib/utils";

export type LeagueScheduleState =
  | { status: "loading" }
  | { status: "noSeasons" }
  | { status: "noTournaments"; seasonId: Id<"seasons"> }
  | {
      status: "ready";
      seasonId: Id<"seasons">;
      tournaments: EnhancedTournamentDoc[];
      sortedTournaments: EnhancedTournamentDoc[];
      currentTournamentIndex: number;
      previousTournamentIndex: number;
    };

/**
 * Fetches and derives the schedule state used by the `LeagueSchedule` UI.
 *
 * Data sources:
 * - `api.functions.seasons.getCurrentSeason`
 * - `api.functions.seasons.getSeasons` (fallback when no season is provided)
 * - `api.functions.tournaments.getTournaments` (for the resolved season)
 *
 * @param args.seasonId - Optional season filter.
 * @returns A discriminated union describing loading/empty/ready schedule state.
 */
export function useLeagueSchedule(
  args: Pick<LeagueScheduleProps, "seasonId">,
): LeagueScheduleState {
  type SeasonSortKey = { _id: Id<"seasons">; year: number; number: number };

  const pickLatestSeasonId = (seasons: SeasonSortKey[]) => {
    let best: SeasonSortKey | undefined;
    for (const season of seasons) {
      if (!best) {
        best = season;
        continue;
      }

      if (season.year > best.year) {
        best = season;
        continue;
      }

      if (season.year === best.year && season.number > best.number) {
        best = season;
      }
    }
    return best?._id;
  };

  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason);

  const fallbackSeasonsResult = useQuery(
    api.functions.seasons.getSeasons,
    !args.seasonId && currentSeason === null
      ? {
          options: {
            pagination: { limit: 50 },
            sort: { sortBy: "year", sortOrder: "desc" },
          },
        }
      : "skip",
  );

  const fallbackSeasons = useMemo<SeasonSortKey[]>(() => {
    const raw = Array.isArray(fallbackSeasonsResult)
      ? (fallbackSeasonsResult as Array<SeasonSortKey | null>)
      : fallbackSeasonsResult &&
          typeof fallbackSeasonsResult === "object" &&
          "seasons" in fallbackSeasonsResult
        ? (fallbackSeasonsResult as { seasons: Array<SeasonSortKey | null> })
            .seasons
        : [];

    return raw
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => ({ _id: s._id, year: s.year, number: s.number }));
  }, [fallbackSeasonsResult]);

  const resolvedSeasonId =
    args.seasonId ?? currentSeason?._id ?? pickLatestSeasonId(fallbackSeasons);

  const tournamentsResult = useQuery(
    api.functions.tournaments.getTournaments,
    resolvedSeasonId
      ? {
          options: {
            filter: { seasonId: resolvedSeasonId },
            pagination: { limit: 200 },
            sort: { sortBy: "startDate", sortOrder: "asc" },
            enhance: { includeTier: true, includeCourse: true },
          },
        }
      : "skip",
  );

  const tournaments = useMemo<EnhancedTournamentDoc[]>(() => {
    if (Array.isArray(tournamentsResult)) {
      return (tournamentsResult as Array<EnhancedTournamentDoc | null>).filter(
        (t): t is EnhancedTournamentDoc => t !== null,
      );
    }

    if (
      tournamentsResult &&
      typeof tournamentsResult === "object" &&
      "tournaments" in tournamentsResult
    ) {
      return (tournamentsResult as { tournaments: EnhancedTournamentDoc[] })
        .tournaments;
    }

    return [];
  }, [tournamentsResult]);

  const derived = useMemo(() => {
    const timeline = getTournamentTimeline(tournaments);
    const sortedTournaments = timeline.all;

    const currentTournamentIndex = timeline.current
      ? sortedTournaments.findIndex((t) => t._id === timeline.current?._id)
      : -1;

    const previousTournamentIndex = timeline.past.slice(-1)[0]
      ? sortedTournaments.findIndex(
          (t) => t._id === timeline.past.slice(-1)[0]?._id,
        )
      : -1;

    return {
      sortedTournaments,
      currentTournamentIndex,
      previousTournamentIndex,
    };
  }, [tournaments]);

  if (!resolvedSeasonId) {
    if (currentSeason === undefined) return { status: "loading" };
    if (currentSeason === null && fallbackSeasonsResult === undefined)
      return { status: "loading" };
    return { status: "noSeasons" };
  }

  if (tournamentsResult === undefined) return { status: "loading" };

  if (derived.sortedTournaments.length === 0) {
    return { status: "noTournaments", seasonId: resolvedSeasonId };
  }

  return {
    status: "ready",
    seasonId: resolvedSeasonId,
    tournaments,
    sortedTournaments: derived.sortedTournaments,
    currentTournamentIndex: derived.currentTournamentIndex,
    previousTournamentIndex: derived.previousTournamentIndex,
  };
}
