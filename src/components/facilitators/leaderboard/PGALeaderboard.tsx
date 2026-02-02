"use client";

import { Fragment, useMemo } from "react";

import type {
  LeaderboardPgaRow,
  LeaderboardTournamentLite,
  LeaderboardViewerContext,
} from "@/lib";
import { isPlayerCut, sortPgaRows } from "@/lib";
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
      {model.rows.map((golfer, index) => {
        const prev = index === 0 ? null : model.rows[index - 1];
        const showDivider =
          prev == null ? false : shouldRenderPgaDivider(prev, golfer);

        return (
          <Fragment key={golfer.id}>
            {showDivider ? <LeaderboardSectionDivider /> : null}
            <LeaderboardListing
              type="PGA"
              tournament={props.tournament}
              allGolfers={props.golfers}
              viewer={props.viewer}
              golfer={golfer}
              isPreTournament={props.isPreTournament}
            />
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Determines whether to render a visual divider before the current PGA row.
 *
 * Rules:
 * - Add a divider between the last non-cut row and the first cut/WD/DQ row.
 * - Within the cut section, add a divider when `group` changes.
 */
function shouldRenderPgaDivider(
  prev: LeaderboardPgaRow,
  curr: LeaderboardPgaRow,
) {
  const prevIsCut = isPlayerCut(prev.position);
  const currIsCut = isPlayerCut(curr.position);

  if (!prevIsCut && currIsCut) return true;
  if (prevIsCut && currIsCut)
    return (prev.group ?? 999) !== (curr.group ?? 999);
  return false;
}

/**
 * Simple horizontal divider used to visually separate leaderboard row sections.
 */
function LeaderboardSectionDivider() {
  return <div className="mx-auto my-2 max-w-4xl border border-t-2" />;
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
