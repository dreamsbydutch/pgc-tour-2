"use client";

import { useMemo } from "react";

import type {
  LeaderboardPgaRow,
  LeaderboardTournamentLite,
  LeaderboardViewerContext,
} from "@/lib/types";
import { sortPgaRows } from "@/lib/utils";
import { LeaderboardListing } from "./LeaderboardListing";

/**
 * Renders the PGA leaderboard listing for the current tournament.
 *
 * Data:
 * - Receives already-shaped PGA rows from the parent screen (`LeaderboardViewModel`).
 * - Sorts rows via `sortPgaRows`.
 *
 * @param props.golfers - PGA leaderboard rows.
 * @param props.tournament - Tournament metadata used to determine display state.
 * @param props.viewer - Viewer context (for highlighting the viewer's golfers).
 * @param props.isPreTournament - When true, disables row expansion.
 * @returns A sequence of clickable leaderboard rows.
 */
export function PGALeaderboard(props: {
  golfers: LeaderboardPgaRow[];
  tournament: LeaderboardTournamentLite;
  viewer?: LeaderboardViewerContext;
  isPreTournament?: boolean;
}) {
  const model = usePGALeaderboard({ golfers: props.golfers });

  if (props.golfers.length === 0) {
    return <PGALeaderboardSkeleton />;
  }

  return (
    <>
      {model.rows.map((golfer) => (
        <LeaderboardListing
          key={golfer.id}
          type="PGA"
          tournament={props.tournament}
          allGolfers={props.golfers}
          viewer={props.viewer}
          golfer={golfer}
          isPreTournament={props.isPreTournament}
        />
      ))}
    </>
  );
}

/**
 * Derives a stable PGA leaderboard rendering model.
 *
 * @param args.golfers - Incoming golfer rows.
 * @returns Sorted rows suitable for rendering.
 */
function usePGALeaderboard(args: { golfers: LeaderboardPgaRow[] }) {
  return useMemo(() => {
    return { rows: sortPgaRows(args.golfers) };
  }, [args.golfers]);
}

/**
 * Loading UI for `PGALeaderboard`.
 */
function PGALeaderboardSkeleton() {
  return <div className="h-24 w-full rounded-md bg-slate-100" />;
}
