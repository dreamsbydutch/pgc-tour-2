"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

/**
 * Shows the golfer list for the currently selected team during the pre-tournament flow.
 *
 * Behavior:
 * - Sorts by `worldRank`, then `group`.
 * - Shows world rank and rating when present.
 * - Adds light row separators for readability.
 *
 * @param props.golfers - The golfers on the member's current team.
 * @returns A compact list of golfers.
 */
export function TeamGolfersList(props: {
  golfers: Array<{
    apiId?: number | null;
    _id?: string | null;
    playerName: string;
    worldRank?: number | null;
    rating?: number | null;
    group?: number | null;
  }>;
}) {
  const model = useTeamGolfersList(props);

  if (model.kind === "loading") {
    return <TeamGolfersListSkeleton />;
  }

  if (model.kind === "empty") {
    return (
      <div className="mt-2 text-center text-gray-500">No team selected yet</div>
    );
  }

  return (
    <div className="mt-2">
      {model.sortedGolfers.map((golfer, i) => (
        <div
          key={String(golfer.apiId ?? golfer._id ?? i)}
          className={cn(
            i % 2 !== 0 && i < 9 && "border-b border-slate-500",
            i === 0 && "mt-2",
            "py-0.5",
          )}
        >
          <div className="text-lg">
            {golfer.worldRank != null && `#${golfer.worldRank} `}
            {golfer.playerName}
            {golfer.rating != null && ` (${golfer.rating})`}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Builds derived display state for `TeamGolfersList`.
 *
 * @param args.golfers - Incoming golfer rows.
 * @returns Sorted rows and empty state.
 */
function useTeamGolfersList(args: {
  golfers: Array<{
    apiId?: number | null;
    _id?: string | null;
    playerName: string;
    worldRank?: number | null;
    rating?: number | null;
    group?: number | null;
  }>;
}) {
  return useMemo(() => {
    if (args.golfers === undefined) {
      return { kind: "loading" as const };
    }

    if (!args.golfers.length) {
      return { kind: "empty" as const };
    }

    const sortedGolfers = [...args.golfers]
      .sort((a, b) => (a.worldRank ?? Infinity) - (b.worldRank ?? Infinity))
      .sort((a, b) => (a.group ?? Infinity) - (b.group ?? Infinity));

    return { kind: "ready" as const, sortedGolfers };
  }, [args.golfers]);
}

/**
 * Loading UI for `TeamGolfersList`.
 */
function TeamGolfersListSkeleton() {
  return <div className="h-20 w-full rounded-md bg-slate-100" />;
}
