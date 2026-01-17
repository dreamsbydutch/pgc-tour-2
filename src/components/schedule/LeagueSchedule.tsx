import { cn } from "@/lib/utils";
import type { EnhancedTournamentDoc } from "../../../convex/types/types";
import type { Id } from "../../../convex/_generated/dataModel";
import { useLeagueScheduleData } from "@/components/schedule/useLeagueScheduleData";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton, SVGSkeleton } from "@/components/ui/skeleton";

/**
 * LeagueSchedule Component
 *
 * Standalone: fetches tournaments for a given season.
 * If `seasonId` is omitted, defaults to the current season (the season whose
 * `year` matches the actual current year).
 */
export function LeagueSchedule({ seasonId }: { seasonId?: Id<"seasons"> }) {
  const state = useLeagueScheduleData({ seasonId });

  if (state.status === "loading") return <LeagueScheduleSkeleton />;

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

  return (
    <LeagueScheduleView
      sortedTournaments={state.sortedTournaments}
      currentTournamentIndex={state.currentTournamentIndex}
      previousTournamentIndex={state.previousTournamentIndex}
    />
  );
}

function LeagueScheduleView({
  sortedTournaments,
  currentTournamentIndex,
  previousTournamentIndex,
}: {
  sortedTournaments: EnhancedTournamentDoc[];
  currentTournamentIndex: number;
  previousTournamentIndex: number;
}) {
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
                  {`${startDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })} - ${
                    startDate.getMonth() === endDate.getMonth()
                      ? endDate.toLocaleDateString("en-US", {
                          day: "numeric",
                        })
                      : endDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
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
 * LeagueScheduleSkeleton Component
 *
 * Displays a loading skeleton that mimics the LeagueSchedule table layout.
 * Uses shimmer/animated placeholders for a better loading experience.
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
