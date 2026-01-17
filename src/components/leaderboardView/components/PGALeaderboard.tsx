import * as React from "react";

import type {
  LeaderboardPgaRow,
  LeaderboardTournamentLite,
  LeaderboardViewerContext,
} from "../utils/types";
import { sortPgaRows } from "../utils/leaderboardUtils";
import { LeaderboardListing } from "./LeaderboardListing";

export function PGALeaderboard({
  golfers,
  tournament,
  viewer,
  isPreTournament,
}: {
  golfers: LeaderboardPgaRow[];
  tournament: LeaderboardTournamentLite;
  viewer?: LeaderboardViewerContext;
  isPreTournament?: boolean;
}) {
  const sorted = React.useMemo(() => sortPgaRows(golfers), [golfers]);

  return (
    <>
      {sorted.map((g) => (
        <LeaderboardListing
          key={g.id}
          type="PGA"
          tournament={tournament}
          allGolfers={golfers}
          viewer={viewer}
          golfer={g}
          isPreTournament={isPreTournament}
        />
      ))}
    </>
  );
}
