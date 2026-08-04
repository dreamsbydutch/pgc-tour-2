import { api, useQuery } from "@/convex";
import type { TournamentShell } from "@/types";

export function useTournamentLeaderboard(args: {
  tournament: TournamentShell | null;
  activeTourId: string;
  variant: "regular" | "playoff";
}) {
  const isUpcoming = args.tournament?.status === "upcoming";
  const pgcLeaderboard = useQuery(
    api.functions.tournaments.getPgcLeaderboard,
    args.tournament && !isUpcoming && args.activeTourId !== "pga"
      ? {
          tournamentId: args.tournament._id,
          tourId: args.activeTourId,
          variant: args.variant,
        }
      : "skip",
  );
  const pgaLeaderboard = useQuery(
    api.functions.tournaments.getPgaLeaderboard,
    args.tournament && !isUpcoming && args.activeTourId === "pga"
      ? { tournamentId: args.tournament._id }
      : "skip",
  );

  return {
    pgcLeaderboard,
    pgaLeaderboard,
    isLoading:
      !!args.tournament &&
      !isUpcoming &&
      (args.activeTourId === "pga"
        ? pgaLeaderboard === undefined
        : pgcLeaderboard === undefined),
  };
}
