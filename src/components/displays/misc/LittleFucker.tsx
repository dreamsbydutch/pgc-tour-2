"use client";

import type { ChampionshipWinTournament, LittleFuckerProps } from "@/lib";
import { cn, hasItems, isNonEmptyString } from "@/lib";

import { Skeleton } from "@/ui";

/**
 * Renders a compact row of championship badges.
 *
 * This is a leaf/pure UI component: it renders based on props and performs no
 * data fetching. Fetch wins outside and pass them in as `wins`.
 *
 * @param props - Component props.
 * @param props.wins - Championship wins to render.
 * @param props.showSeasonText - When true, shows the tournament year under each badge.
 * @param props.className - Optional container className.
 * @param props.loading - When true, forces the loading skeleton.
 * @returns A row of badges, a skeleton, or `null` when there are no wins.
 */
export function LittleFucker(props: LittleFuckerProps) {
  if (props.loading) {
    return (
      <LittleFuckerSkeleton
        showSeasonText={props.showSeasonText}
        className={props.className}
      />
    );
  }

  const wins: ChampionshipWinTournament[] | undefined = props.wins;
  if (!hasItems(wins)) return null;

  return (
    <div className={cn("flex flex-row", props.className)}>
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

          {props.showSeasonText && typeof win.startDate === "number" && (
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
 * Loading UI for `LittleFucker`.
 */
function LittleFuckerSkeleton(props: {
  showSeasonText?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-row", props.className)}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="mx-1 flex flex-col items-center">
          <Skeleton className="h-8 w-8 rounded-full" />
          {props.showSeasonText && <Skeleton className="mt-1 h-3 w-8" />}
        </div>
      ))}
    </div>
  );
}
