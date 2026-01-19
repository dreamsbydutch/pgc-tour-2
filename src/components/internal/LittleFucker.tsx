import { useQuery } from "convex/react";
import { api } from "@/convex";
import { cn, hasItems, isNonEmptyString } from "@/lib/utils";
import { Skeleton } from "@/ui";
import type { LittleFuckerProps } from "@/lib/types";

/**
 * Renders a compact row of championship badges for a member.
 *
 * The badges are driven by the server query `api.functions.teams.getChampionshipWinsForMember`.
 * Wins include major championships, the Canadian Open, and playoff tournaments.
 *
 * @param props.memberId Convex member id for the user.
 * @param props.seasonId Optional season id to scope wins to a single season.
 * @param props.showSeasonText When true, shows the tournament year under each badge.
 * @param props.className Optional container className.
 * @param props.loading When true, forces the loading skeleton.
 *
 * @example
 * <LittleFucker memberId={member._id} />
 *
 * @example
 * <LittleFucker memberId={member._id} seasonId={season._id} showSeasonText />
 */
export function LittleFucker({
  memberId,
  seasonId,
  showSeasonText = false,
  className,
  loading,
}: LittleFuckerProps) {
  const { wins, isLoading } = useLittleFucker({ memberId, seasonId });

  if (loading || isLoading) {
    return (
      <LittleFuckerSkeleton
        showSeasonText={showSeasonText}
        className={className}
      />
    );
  }

  if (!hasItems(wins)) return null;

  return (
    <div className={cn("flex flex-row", className)}>
      {wins.map((win) => (
        <div key={win.tournamentId} className="mx-1 flex flex-col items-center">
          <div className="relative">
            <div className="relative h-8 w-8 overflow-hidden rounded-full bg-amber-500">
              {isNonEmptyString(win.logoUrl) ? (
                <img
                  src={win.logoUrl}
                  alt={`${win.name} Logo`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                  🏆
                </div>
              )}
            </div>

            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-xs">
              🏆
            </div>
          </div>

          {showSeasonText && typeof win.startDate === "number" && (
            <div className="mt-1 text-xs font-semibold text-amber-700">
              {new Date(win.startDate).getFullYear()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Fetches championship wins for `LittleFucker`.
 *
 * @param params.memberId Member id used to fetch wins.
 * @param params.seasonId Optional season id to scope wins.
 * @returns Wins (when available) and a loading flag.
 */
function useLittleFucker({
  memberId,
  seasonId,
}: Pick<LittleFuckerProps, "memberId" | "seasonId">) {
  const winsResult = useQuery(
    api.functions.teams.getChampionshipWinsForMember,
    memberId ? { memberId, seasonId } : "skip",
  );

  return {
    wins: winsResult,
    isLoading: winsResult === undefined,
  };
}

/**
 * Loading UI for `LittleFucker`.
 */
function LittleFuckerSkeleton({
  showSeasonText = false,
  className,
}: Pick<LittleFuckerProps, "showSeasonText" | "className">) {
  return (
    <div className={cn("flex flex-row", className)}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="mx-1 flex flex-col items-center">
          <Skeleton className="h-8 w-8 rounded-full" />
          {showSeasonText && <Skeleton className="mt-1 h-3 w-8" />}
        </div>
      ))}
    </div>
  );
}
