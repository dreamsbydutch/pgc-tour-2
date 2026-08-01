import { useMemo } from "react";

import type {
  LeaderboardStandingsSnapshot,
  UseLeaderboardStandingsProjectionArgs,
} from "@/types";
import { buildLeaderboardStandingsProjections } from "@/utils";

export function useLeaderboardStandingsProjection(
  args: UseLeaderboardStandingsProjectionArgs,
): ReadonlyMap<string, LeaderboardStandingsSnapshot> {
  return useMemo(
    () =>
      buildLeaderboardStandingsProjections({
        tournamentStatus: args.tournament.status,
        isPlayoff:
          args.variant === "playoff" || args.tournament.isPlayoff === true,
        lastUpdatedAt: args.tournament.leaderboardLastUpdatedAt,
        tours: args.tours.map((tour) => ({
          id: String(tour._id),
          playoffSpots: tour.playoffSpots,
        })),
        tourCards: (args.tourCards ?? []).map((card) => ({
          id: String(card._id),
          tourId: String(card.tourId),
          points: card.points,
        })),
        teams: args.teams.map((team) => ({
          tourCardId: String(team.tourCardId),
          points: team.points,
        })),
      }),
    [args.teams, args.tourCards, args.tournament, args.tours, args.variant],
  );
}
