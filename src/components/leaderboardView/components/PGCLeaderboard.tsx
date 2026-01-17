import * as React from "react";

import type {
  LeaderboardPgaRow,
  LeaderboardTeamRow,
  LeaderboardTournamentLite,
  LeaderboardVariant,
  LeaderboardViewerContext,
} from "../utils/types";
import { filterTeamRowsByTour } from "../utils/leaderboardUtils";
import { LeaderboardListing } from "./LeaderboardListing";

export function PGCLeaderboard({
  teams,
  tournament,
  allGolfers,
  viewer,
  activeTourId,
  variant,
  isPreTournament,
}: {
  teams: LeaderboardTeamRow[];
  tournament: LeaderboardTournamentLite;
  allGolfers: LeaderboardPgaRow[];
  viewer?: LeaderboardViewerContext;
  activeTourId: string;
  variant: LeaderboardVariant;
  isPreTournament?: boolean;
}) {
  const filtered = React.useMemo(
    () => filterTeamRowsByTour(teams, activeTourId, variant),
    [teams, activeTourId, variant],
  );

  return (
    <>
      {filtered.map((t) => (
        <LeaderboardListing
          key={t.id}
          type="PGC"
          tournament={tournament}
          allGolfers={allGolfers}
          viewer={viewer}
          team={t}
          isPreTournament={isPreTournament}
        />
      ))}
    </>
  );
}
