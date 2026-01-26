import { cn, formatMonthDay, getTournamentTimeline } from "@/lib/utils";
import type { LeagueScheduleProps } from "@/lib/types";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui";
import { Skeleton, SVGSkeleton } from "@/ui";
import { EnhancedTournamentDoc } from "convex/types/types";
import { api, Id, useQuery } from "@/convex";
import { useMemo } from "react";

/**
 * Renders the league schedule table (tournaments for a season).
 *
 * Data source:
 * - Uses Convex queries (`api.functions.seasons.*`, `api.functions.tournaments.getTournaments`) via the internal hook.
 * - If `seasonId` is omitted, falls back to the current season (or latest available season).
 *
 * Render states:
 * - When `loading` is true (or the underlying data hook is still loading), renders a skeleton.
 * - When no seasons or tournaments are available, renders a small empty-state message.
 * - When data is available, renders a styled table with the current tournament highlighted.
 *
 * @param props - `LeagueScheduleProps`.
 * @returns A schedule table, a skeleton, or an empty state.
 */
export function LeagueSchedule({ seasonId, loading }: LeagueScheduleProps) {
  const state = useLeagueSchedule({ seasonId });

  if (loading || state.status === "loading") return <LeagueScheduleSkeleton />;

  if (state.status === "noSeasons") {
    return (
      <div className="rounded-lg border border-gray-300 bg-gray-50 p-4 text-center font-varela text-sm text-gray-600 shadow-lg">
        No seasons found.
      </div>
    );
  }

  if (state.status === "noTournaments") {
    return (
      <div className="rounded-lg border border-gray-300 bg-gray-50 p-4 text-center font-varela text-sm text-gray-600 shadow-lg">
        {seasonId
          ? "No tournaments found for this season."
          : "No tournaments found."}
      </div>
    );
  }

  const { sortedTournaments, currentTournamentIndex, previousTournamentIndex } =
    state;

  return (
    <div className="rounded-lg border border-gray-300 bg-gray-50 shadow-lg">
      <div className="my-2 flex items-center justify-center gap-3">
        <img
          src="https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPJiXqZRs47Fgtd9BSMeHQ2WnVuLfP8IaTAp6E"
          alt="PGC Logo"
          className="h-16 w-16 object-contain"
        />
        <h2 className="pb-1 font-yellowtail text-5xl sm:text-6xl md:text-7xl">
          Schedule
        </h2>
      </div>
      <Table className="mx-auto font-varela">
        <TableHeader>
          <TableRow>
            <TableHead className="p-1 text-center text-xs font-bold">
              Tournament
            </TableHead>
            <TableHead className="border-l p-1 text-center text-xs font-bold">
              Dates
            </TableHead>
            <TableHead className="border-l p-1 text-center text-xs font-bold">
              Tier
            </TableHead>
            <TableHead className="border-l p-1 text-center text-xs font-bold">
              Course
            </TableHead>
            <TableHead className="border-l p-1 text-center text-xs font-bold">
              Location
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTournaments.map((tourney, i) => {
            const isCurrent = i === currentTournamentIndex;
            const showBorderAfter =
              i === previousTournamentIndex && currentTournamentIndex === -1;
            const startDate = new Date(tourney.startDate);
            const endDate = new Date(tourney.endDate);

            return (
              <TableRow
                key={tourney._id}
                className={cn(
                  sortedTournaments[i - 1]?.tier?.name !== "Playoff" &&
                    sortedTournaments[i]?.tier?.name === "Playoff" &&
                    "border-t-2 border-t-gray-500",
                  sortedTournaments[i]?.tier?.name === "Playoff" &&
                    "bg-yellow-50",
                  sortedTournaments[i]?.seasonId !==
                    sortedTournaments[i - 1]?.seasonId &&
                    i !== 0 &&
                    "border-t-4 border-t-gray-800",
                  tourney.tier?.name === "Major" && "bg-blue-50",
                  showBorderAfter &&
                    "border-b-[3px] border-dashed border-b-blue-800",
                )}
              >
                <TableCell className="min-w-48 text-xs">
                  <div className="flex items-center justify-evenly gap-1 text-center">
                    <img
                      src={tourney.logoUrl ?? ""}
                      className={cn(
                        isCurrent ? "h-12 w-12" : "h-8 w-8",
                        "object-contain",
                      )}
                      alt={tourney.name}
                    />
                    <span className={cn(isCurrent && "font-bold")}>
                      {tourney.name}
                    </span>
                  </div>
                </TableCell>
                <TableCell
                  className={cn(
                    isCurrent && "font-bold",
                    "text-nowrap border-l text-center text-xs",
                  )}
                >
                  {`${formatMonthDay(startDate)} - ${
                    startDate.getMonth() === endDate.getMonth()
                      ? endDate.toLocaleDateString("en-US", {
                          day: "numeric",
                        })
                      : formatMonthDay(endDate)
                  }`}
                </TableCell>
                <TableCell
                  className={cn(
                    isCurrent && "font-bold",
                    "text-nowrap border-l text-center text-xs",
                  )}
                >
                  {tourney.tier?.name ?? ""}
                </TableCell>
                <TableCell
                  className={cn(
                    isCurrent && "font-bold",
                    "min-w-48 border-l text-center text-xs",
                  )}
                >
                  {tourney.course?.name ?? ""}
                </TableCell>
                <TableCell
                  className={cn(
                    isCurrent && "font-bold",
                    "min-w-32 border-l text-center text-xs",
                  )}
                >
                  {tourney.course?.location ?? ""}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Loading UI for `LeagueSchedule`.
 */
function LeagueScheduleSkeleton({ rows = 16 }: { rows?: number }) {
  return (
    <div className="animate-pulse rounded-lg border border-gray-300 bg-gray-50 shadow-lg">
      <div className="my-3 flex items-center justify-center gap-3">
        <SVGSkeleton className="h-14 w-14" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="mx-auto w-full max-w-5xl">
        <div className="overflow-x-auto">
          <table className="w-full font-varela">
            <thead>
              <tr>
                <th className="p-1 text-center text-xs font-bold">
                  <Skeleton className="mx-auto h-4 w-20" />
                </th>
                <th className="border-l p-1 text-center text-xs font-bold">
                  <Skeleton className="mx-auto h-4 w-16" />
                </th>
                <th className="border-l p-1 text-center text-xs font-bold">
                  <Skeleton className="mx-auto h-4 w-12" />
                </th>
                <th className="border-l p-1 text-center text-xs font-bold">
                  <Skeleton className="mx-auto h-4 w-16" />
                </th>
                <th className="border-l p-1 text-center text-xs font-bold">
                  <Skeleton className="mx-auto h-4 w-20" />
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="min-w-48 text-xs">
                    <div className="flex items-center justify-evenly gap-1 text-center">
                      <SVGSkeleton className="h-8 w-8 object-contain" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </td>
                  <td className="border-l p-1">
                    <Skeleton className="mx-auto h-4 w-20" />
                  </td>
                  <td className="border-l p-1">
                    <Skeleton className="mx-auto h-4 w-12" />
                  </td>
                  <td className="border-l p-1">
                    <Skeleton className="mx-auto h-4 w-16" />
                  </td>
                  <td className="border-l p-1">
                    <Skeleton className="mx-auto h-4 w-20" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type LeagueScheduleState =
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
function useLeagueSchedule(
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
