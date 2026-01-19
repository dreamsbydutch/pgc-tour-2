"use client";

import { formatMoney, formatTournamentDateRange } from "@/lib/utils";
import { Skeleton } from "@/ui";
import { LeaderboardHeaderDropdown } from "@/components/internal/LeaderboardHeaderDropdown";
import type { LeaderboardHeaderProps } from "@/lib/types";

/**
 * LeaderboardHeader Component
 *
 * Header block for the leaderboard view.
 * Renders the active tournament's logo/name, date range, course details, and tier summary,
 * plus a tournament switcher.
 *
 * Data sources:
 * - Tournament data is provided by the parent (typically from Convex-enhanced tournament docs).
 * - Tournament selection UI is delegated to `LeaderboardHeaderDropdown`.
 *
 * Render states:
 * - When `loading` is true, renders the internal skeleton to preserve layout.
 * - When loaded, renders tournament logo/name, date range, course info, and tier summary.
 *
 * @param props - `LeaderboardHeaderProps`.
 *
 * @example
 * <LeaderboardHeader
 *   focusTourney={focusTourney}
 *   tournaments={tournaments}
 *   onTournamentChange={(id) => setTournamentId(id)}
 * />
 */
export function LeaderboardHeader(props: LeaderboardHeaderProps) {
  const {
    headerId,
    dateRange,
    courseName,
    courseLocation,
    parLabel,
    tierSummary,
  } = useLeaderboardHeader(props);

  if ("loading" in props && props.loading) return <LeaderboardHeaderSkeleton />;
  return (
    <div
      id={headerId}
      className="mx-auto w-full max-w-4xl md:w-11/12 lg:w-8/12"
    >
      <div className="mx-auto grid grid-flow-row grid-cols-10 items-center border-b-2 border-gray-800 py-2">
        <div className="col-span-3 row-span-4 max-h-40 place-self-center px-1 py-2 text-center">
          {props.focusTourney.logoUrl && (
            <img
              src={props.focusTourney.logoUrl}
              className="mx-auto max-h-32"
              alt={`${props.focusTourney.name} logo`}
              width={150}
              height={150}
            />
          )}
        </div>

        <div className="col-span-5 row-span-2 place-self-center text-center text-xl font-bold xs:text-2xl sm:text-3xl lg:text-4xl">
          {props.focusTourney.name}
        </div>

        <div className="col-span-2 row-span-1 place-self-center text-center text-xs xs:text-sm sm:text-base md:text-lg">
          <LeaderboardHeaderDropdown
            activeTourney={props.focusTourney}
            tournaments={props.tournaments}
            onSelect={props.onTournamentChange}
          />
        </div>

        <div className="col-span-2 row-span-1 place-self-center text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {dateRange}
        </div>

        <div className="col-span-3 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {courseName}
        </div>

        <div className="col-span-2 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {courseLocation}
        </div>

        <div className="col-span-2 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {parLabel}
        </div>

        <div className="col-span-7 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {tierSummary}
        </div>
      </div>
    </div>
  );
}

/**
 * Composes formatted labels for `LeaderboardHeader`.
 *
 * @param props - Loaded `LeaderboardHeaderProps`.
 * @returns Pre-formatted strings used by the UI.
 */
function useLeaderboardHeader(props: LeaderboardHeaderProps) {
  if (props.loading)
    return {
      headerId: undefined,
      dateRange: undefined,
      courseName: undefined,
      courseLocation: undefined,
      parLabel: undefined,
      tierSummary: undefined,
    };
  const headerId = `leaderboard-header-${props.focusTourney._id}`;
  const dateRange = formatTournamentDateRange(
    props.focusTourney.startDate,
    props.focusTourney.endDate,
  );

  const courseName = props.focusTourney.course?.name ?? "-";
  const courseLocation = props.focusTourney.course?.location ?? "-";

  const parLabel =
    props.focusTourney.course?.front &&
    props.focusTourney.course?.back &&
    props.focusTourney.course?.par
      ? `${props.focusTourney.course.front} - ${props.focusTourney.course.back} - ${props.focusTourney.course.par}`
      : "-";

  const tierSummary = props.focusTourney.tier
    ? props.focusTourney.tier.name.toLowerCase() === "playoff"
      ? `${props.focusTourney.tier.name} Tournament - 1st Place: ${formatMoney(props.focusTourney.tier.payouts[0] ?? 0)}`
      : `${props.focusTourney.tier.name} Tournament - 1st Place: ${props.focusTourney.tier.points[0] ?? 0} pts, ${formatMoney(props.focusTourney.tier.payouts[0] ?? 0)}`
    : "";

  return {
    headerId,
    dateRange,
    courseName,
    courseLocation,
    parLabel,
    tierSummary,
  };
}

/**
 * Loading UI for `LeaderboardHeader`.
 */
function LeaderboardHeaderSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl md:w-11/12 lg:w-8/12">
      <div className="mx-auto grid grid-flow-row grid-cols-10 items-center border-b-2 border-gray-800 py-2">
        <div className="col-span-3 row-span-4 max-h-40 place-self-center px-1 py-2 text-center">
          <Skeleton className="mx-auto h-24 w-24 rounded-md" />
        </div>

        <div className="col-span-5 row-span-2 place-self-center text-center">
          <Skeleton className="mx-auto h-8 w-64" />
        </div>

        <div className="col-span-2 row-span-1 place-self-center text-center">
          <Skeleton className="h-8 w-40" />
        </div>

        <div className="col-span-2 row-span-1 place-self-center text-center">
          <Skeleton className="h-5 w-32" />
        </div>

        <div className="col-span-3 row-span-1 text-center">
          <Skeleton className="mx-auto h-5 w-44" />
        </div>

        <div className="col-span-2 row-span-1 text-center">
          <Skeleton className="mx-auto h-5 w-24" />
        </div>

        <div className="col-span-2 row-span-1 text-center">
          <Skeleton className="mx-auto h-5 w-28" />
        </div>

        <div className="col-span-7 row-span-1 text-center">
          <Skeleton className="mx-auto h-5 w-full max-w-md" />
        </div>
      </div>
    </div>
  );
}
