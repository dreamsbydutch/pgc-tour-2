import {
  api,
  Id,
  useConvexConnectionState,
  useQuery,
  useViewerBootstrap,
} from "@/convex";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { useTournamentLeaderboard } from "@/hooks/useTournamentLeaderboard";

export function useTournamentPage(args: {
  tournamentId?: string;
  tourId?: string;
  variant: "regular" | "playoff";
}) {
  const bootstrap = useViewerBootstrap();
  const connection = useConvexConnectionState();
  const { member } = useRoleAccess();
  const shell = useQuery(api.functions.tournaments.getTournamentShell, {
    tournamentId: args.tournamentId
      ? (args.tournamentId as Id<"tournaments">)
      : undefined,
  });
  const tournament = shell?.tournament ?? null;
  const userTourCard =
    tournament && bootstrap
      ? (bootstrap.tourCards.find(
          (card) => card.seasonId === tournament.seasonId,
        ) ?? null)
      : null;
  const activeTourId =
    args.tourId ||
    (userTourCard
      ? String(userTourCard.tourId)
      : shell?.tours[0]
        ? String(shell.tours[0]._id)
        : "pga");
  const isUpcoming = tournament?.status === "upcoming";

  const preTournament = useQuery(
    api.functions.tournaments.getTournamentLeaderboardView,
    isUpcoming
      ? {
          tournamentId: tournament._id,
        }
      : "skip",
  );
  const leaderboard = useTournamentLeaderboard({
    tournament,
    activeTourId,
    variant: args.variant,
  });
  const existingTeam = preTournament?.teams.find(
    (team) => team.tourCardId === userTourCard?._id,
  );
  const preTournamentView = preTournament?.tournament
    ? {
        tournament: preTournament.tournament,
        existingTeam,
        allTournaments: preTournament.allTournaments,
        teamGolfers: preTournament.golfers.filter((golfer) =>
          existingTeam?.golferIds.includes(golfer.apiId ?? 0),
        ),
        pickPool: preTournament.pickPool.flatMap((golfer) =>
          golfer.golferApiId !== undefined && golfer.playerName !== undefined
            ? [
                {
                  golferApiId: golfer.golferApiId,
                  playerName: golfer.playerName,
                  group: golfer.group,
                  worldRank: golfer.worldRank,
                  rating: golfer.rating,
                },
              ]
            : [],
        ),
      }
    : null;

  const isLoading =
    shell === undefined ||
    (isUpcoming && preTournament === undefined) ||
    (!!tournament && !isUpcoming && !!activeTourId && leaderboard.isLoading);

  return {
    shell,
    tournament,
    member,
    userTourCard,
    activeTourId,
    preTournament,
    preTournamentView,
    pgcLeaderboard: leaderboard.pgcLeaderboard,
    pgaLeaderboard: leaderboard.pgaLeaderboard,
    freshness: connection.isWebSocketConnected
      ? ("live" as const)
      : ("stale" as const),
    isLoading,
  };
}
