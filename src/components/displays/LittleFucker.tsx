"use client";

import { Id } from "@/convex";
import { cn, hasItems, isNonEmptyString } from "@/lib";

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
export function LittleFucker(props: {
  wins: {
    tournamentId: Id<"tournaments">;
    logoUrl: string | null;
    seasonYear: number;
  }[];
  tourCardId?: Id<"tourCards">;
  showSeasonText: boolean;
  loading: boolean;
  className?: string;
}) {
  if (props.loading) {
    return null;
  }

  if (!hasItems(props.wins)) return null;

  return (
    <div className={cn("flex flex-row", props.className)}>
      {props.wins.map((win) => (
        <div
          key={props.tourCardId + win.tournamentId}
          className="mx-1 flex flex-col items-center"
        >
          <div className="relative h-8 w-8 overflow-hidden rounded-full bg-amber-500">
            {isNonEmptyString(win.logoUrl) ? (
              <img
                src={win.logoUrl}
                alt={`${win.seasonYear} Logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                🏆
              </div>
            )}
          </div>

          {props.showSeasonText && typeof win.seasonYear === "number" && (
            <div className="mt-1 text-xs font-semibold text-amber-700">
              {win.seasonYear}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
