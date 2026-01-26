"use client";

import { useMemo } from "react";

import type {
  LeaderboardPgaRow,
  LeaderboardTeamRow,
  LeaderboardTournamentLite,
  LeaderboardVariant,
  LeaderboardViewerContext,
} from "@/lib/types";
import { filterTeamRowsByTour } from "@/lib/utils";
import { LeaderboardListing } from "./LeaderboardListing";

/**
 * Renders the PGC leaderboard listing for the active tour (or playoff bracket).
 *
 * Data:
 * - Receives already-shaped team rows from the parent screen (`LeaderboardViewModel`).
 * - Filters/sorts rows via `filterTeamRowsByTour`.
 *
 * @param props.teams - PGC team rows.
 * @param props.tournament - Tournament metadata used to determine display state.
 * @param props.allGolfers - PGA golfer rows, used to expand a team into golfer details.
 * @param props.viewer - Viewer context (for highlighting the viewer's team and friends).
 * @param props.activeTourId - Active tour identifier.
 * @param props.variant - Leaderboard variant (regular/playoff/historical).
 * @param props.isPreTournament - When true, disables row expansion.
 * @returns A sequence of clickable leaderboard rows.
 */
export function PGCLeaderboard(props: {
  teams: LeaderboardTeamRow[];
  tournament: LeaderboardTournamentLite;
  allGolfers: LeaderboardPgaRow[];
  viewer?: LeaderboardViewerContext;
  activeTourId: string;
  variant: LeaderboardVariant;
  isPreTournament?: boolean;
}) {
  const model = usePGCLeaderboard({
    teams: props.teams,
    activeTourId: props.activeTourId,
    variant: props.variant,
  });

  if (props.teams.length === 0) {
    return <PGCLeaderboardSkeleton />;
  }

  return (
    <>
      {model.rows.map((team) => (
        <LeaderboardListing
          key={team.id}
          type="PGC"
          tournament={props.tournament}
          allGolfers={props.allGolfers}
          viewer={props.viewer}
          team={team}
          isPreTournament={props.isPreTournament}
        />
      ))}
    </>
  );
}

/**
 * Derives a stable PGC leaderboard rendering model.
 *
 * @param args.teams - Incoming team rows.
 * @param args.activeTourId - Active tour identifier.
 * @param args.variant - Leaderboard variant.
 * @returns Filtered/sorted rows suitable for rendering.
 */
function usePGCLeaderboard(args: {
  teams: LeaderboardTeamRow[];
  activeTourId: string;
  variant: LeaderboardVariant;
}) {
  return useMemo(() => {
    return {
      rows: filterTeamRowsByTour(args.teams, args.activeTourId, args.variant),
    };
  }, [args.activeTourId, args.teams, args.variant]);
}

/**
 * Loading UI for `PGCLeaderboard`.
 */
function PGCLeaderboardSkeleton() {
  return <div className="h-24 w-full rounded-md bg-slate-100" />;
}
