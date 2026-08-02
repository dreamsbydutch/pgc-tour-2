import { cn, formatMonthDay, isNonEmptyString } from "@/utils/app";
import { PGC_LOGO_URL } from "@/utils/constants";

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
import { buildLeagueScheduleState } from "@/utils";

/**
 * Renders the league schedule table (tournaments for a season).
 *
 * Data source:
 * - Uses Convex queries (`api.functions.seasons.*`, `api.functions.tournaments.getTournaments`) via the internal hook.
 * - Season must be provided as a prop to scope the schedule; the hook does not attempt to resolve the season itself.
 *
 * Render states:
 * - When `loading` is true (or the underlying data hook is still loading), renders a skeleton.
 * - When no seasons or tournaments are available, renders a small empty-state message.
 * - When data is available, renders a styled table with the current tournament highlighted.
 *
 * @param props - `LeagueScheduleProps`.
 * @returns A schedule table, a skeleton, or an empty state.
 */
export function LeagueSchedule({
  tournaments,
}: {
  tournaments: EnhancedTournamentDoc[] | undefined;
}) {
  const state = buildLeagueScheduleState(tournaments);

  if (state.status === "loading") return <LeagueScheduleSkeleton />;

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
      <div className="space-y-3 px-3 pb-3 sm:hidden">
        {sortedTournaments.map((tourney, i) => {
          const isCurrent = i === currentTournamentIndex;
          const startDate = new Date(tourney.startDate);
          const endDate = new Date(tourney.endDate);
          return (
            <article
              key={tourney._id}
              className={cn(
                "rounded-lg border bg-white p-3",
                tourney.tier?.name === "Major" && "border-blue-200 bg-blue-50",
                tourney.tier?.name === "Playoff" &&
                  "border-yellow-200 bg-yellow-50",
                isCurrent && "border-2 border-blue-700 shadow-sm",
              )}
              aria-current={isCurrent ? "true" : undefined}
            >
              <div className="flex items-center gap-3">
                <img
                  src={
                    isNonEmptyString(tourney.logoUrl)
                      ? tourney.logoUrl
                      : PGC_LOGO_URL
                  }
                  className="h-12 w-12 shrink-0 object-contain"
                  alt=""
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-varela text-sm font-bold">
                    {tourney.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {`${formatMonthDay(startDate)} - ${
                      startDate.getMonth() === endDate.getMonth()
                        ? endDate.toLocaleDateString("en-US", {
                            day: "numeric",
                          })
                        : formatMonthDay(endDate)
                    }`}
                    {tourney.tier?.name ? ` · ${tourney.tier.name}` : ""}
                  </p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
                <div>
                  <dt className="font-medium text-muted-foreground">Course</dt>
                  <dd className="mt-0.5">{tourney.course?.name || "TBA"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">
                    Location
                  </dt>
                  <dd className="mt-0.5">
                    {tourney.course?.location || "TBA"}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto sm:block">
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
                        src={
                          isNonEmptyString(tourney.logoUrl)
                            ? tourney.logoUrl
                            : PGC_LOGO_URL
                        }
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
