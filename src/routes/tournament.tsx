import { createFileRoute } from "@tanstack/react-router";

import { LeaderboardView, PreTournamentContent } from "@/facilitators";
import { api, Id, useQuery } from "@/convex";
import { useRoleAccess } from "@/hooks";

export const Route = createFileRoute("/tournament")({
  component: TournamentRoute,
  validateSearch: (search: Record<string, unknown>) => {
    const variantRaw = search.variant;
    const variant: "regular" | "playoff" | null =
      variantRaw === "regular" || variantRaw === "playoff" ? variantRaw : null;

    return {
      tournamentId: (search.tournamentId as string) || "",
      tourId: (search.tourId as string) || "",
      variant,
    };
  },
});

/**
 * Route wrapper for `/tournament`.
 */
function TournamentRoute() {
  const { tournamentId, tourId, variant } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { member } = useRoleAccess();
  const data = useQuery(
    api.functions.tournaments.getTournamentLeaderboardView,
    {
      tournamentId: tournamentId as Id<"tournaments">,
      memberId: member?._id,
    },
  );

  if (!data?.tournament)
    return (
      <div className="container mx-auto px-1 py-4">
        <div className="text-center text-red-600">Tournament not found.</div>
      </div>
    );

  if (data.tournament.status === "upcoming") {
    const existingTeam = data.teams.find(
      (t) => t.tourCardId === data.userTourCard?._id,
    );
    return (
      <PreTournamentContent
        tournament={data.tournament}
        member={member === null ? undefined : member}
        tourCard={data.userTourCard}
        existingTeam={existingTeam}
        teamGolfers={data.golfers.filter((g) =>
          existingTeam?.golferIds.includes(g.apiId ?? 0),
        )}
        playoffEventIndex={data.tournament.eventIndex}
      />
    );
  }

  return (
    <LeaderboardView
      tournament={data.tournament}
      tours={data.tours}
      teams={data.teams}
      golfers={data.golfers}
      allTournaments={data.allTournaments}
      userTourCard={data.userTourCard}
      onTournamentChange={(nextTournamentId) => {
        navigate({
          search: (prev) => ({
            ...prev,
            tournamentId: nextTournamentId,
            tourId: "",
          }),
        });
      }}
      activeTourId={tourId ?? data.userTourCard?.tourId}
      onChangeTourId={(nextTourId) => {
        navigate({
          search: (prev) => ({
            ...prev,
            tourId: nextTourId,
          }),
        });
      }}
      variant={variant ?? "regular"}
      isPreTournament={false}
    />
  );
}
