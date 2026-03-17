import { createFileRoute } from "@tanstack/react-router";

import { api, Id, useQuery } from "@/convex";
import { usePGCAuth } from "@/hooks";
import { LeaderboardView } from "@/components/leaderboard/LeaderboardView";
import { PreTournamentContent } from "@/components/leaderboard/PreTournamentContent";

export const Route = createFileRoute("/tournament")({
  component: TournamentRoute,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tournamentId: typeof search.tournamentId === "string" ? search.tournamentId as Id<"tournaments"> : undefined,
      tourId: typeof search.tourId === "string" ? search.tourId as Id<"tours"> : undefined,
    };
  },
});

/**
 * Route wrapper for `/tournament`.
 */
function TournamentRoute() {
  const { tournamentId, tourId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { member } = usePGCAuth();
  const resolvedTournament = tournamentId
    ? useQuery(api.functions.tournaments.getTournament, {
        tournamentId: tournamentId as Id<"tournaments">,
      })
    : undefined;
  const userTourCard = useQuery(api.functions.tourCards.getTourCards, {
    options: {
      clerkId: member?.clerkId,
      seasonId: resolvedTournament?.seasonId,
    },
  });

  if (resolvedTournament) {
    // Find out if it is a active, past, or upcoming tournament and redirect to the appropriate route.
    if (
      resolvedTournament.status === "active" ||
      resolvedTournament.status === "completed" ||
      resolvedTournament.status === "cancelled"
    ) {
      return (
        <LeaderboardView
          tournament={resolvedTournament}
          activeTourId={
            (tourId ?? userTourCard?.[0]?.tourId ?? "pga") as
              | Id<"tours">
              | "pga"
              | "gold"
              | "silver"
          }
          onTournamentChange={(nextTournamentId) => {
            navigate({
              search: (prev) => ({
                ...prev,
                tournamentId: nextTournamentId as Id<"tournaments">,
                tourId: undefined as Id<"tours"> | undefined,
              }),
            });
          }}
          onChangeTourId={(nextTourId) => {
            navigate({
              search: (prev) => ({
                ...prev,
                tourId: nextTourId as Id<"tours">,
              }),
            });
          }}
          userTourCard={userTourCard?.[0]}
        />
      );
    } else if (resolvedTournament.status === "upcoming") {
      return (
        <PreTournamentContent
          key={resolvedTournament._id}
          tournament={resolvedTournament}
          onTournamentChange={(nextTournamentId) => {
            navigate({
              search: (prev) => ({
                ...prev,
                tournamentId: nextTournamentId as Id<"tournaments">,
                tourId: undefined as Id<"tours"> | undefined,
              }),
            });
          }}
        />
      );
    } else {
      navigate({
        to: "/tournament",
        search: () => ({
          tournamentId: undefined as Id<"tournaments"> | undefined,
          tourId: undefined as Id<"tours"> | undefined,
        }),
      });
    }
  }
  const currentTournament = useQuery(
    api.functions.tournaments.getCurrentTournament,
    {},
  );

  if (!currentTournament)
    return (
      <div className="container mx-auto px-1 py-4">
        <div className="text-center text-red-600">Tournament not found.</div>
      </div>
    );

  if (
    currentTournament.status === "active" ||
    currentTournament.status === "completed" ||
    currentTournament.status === "cancelled"
  ) {
    return (
      <LeaderboardView
        tournament={currentTournament}
        activeTourId={
          (tourId ?? userTourCard?.[0]?.tourId ?? "pga") as
            | Id<"tours">
            | "pga"
            | "gold"
            | "silver"
        }
        onTournamentChange={(nextTournamentId) => {
          navigate({
            search: (prev) => ({
              ...prev,
              tournamentId: nextTournamentId as Id<"tournaments">,
              tourId: undefined as Id<"tours"> | undefined,
            }),
          });
        }}
        onChangeTourId={(nextTourId) => {
          navigate({
            search: (prev) => ({
              ...prev,
              tourId: nextTourId as Id<"tours">,
            }),
          });
        }}
        userTourCard={userTourCard?.[0]}
      />
    );
  } else if (currentTournament.status === "upcoming") {
    return (
      <PreTournamentContent
        key={currentTournament._id}
        tournament={currentTournament}
        onTournamentChange={(nextTournamentId) => {
          navigate({
            search: (prev) => ({
              ...prev,
              tournamentId: nextTournamentId as Id<"tournaments">,
              tourId: undefined as Id<"tours"> | undefined,
            }),
          });
        }}
      />
    );
  } else {
    navigate({
      to: "/tournament",
      search: () => ({
        tournamentId: undefined as Id<"tournaments"> | undefined,
        tourId: undefined as Id<"tours"> | undefined,
      }),
    });
  }
}
