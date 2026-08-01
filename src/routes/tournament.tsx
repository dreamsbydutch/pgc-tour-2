import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import {
  LeaderboardView,
  LeaderboardViewSkeleton,
  PreTournamentContent,
} from "@/facilitators";
import { api, Id, useQuery, useViewerBootstrap } from "@/convex";
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
  const bootstrap = useViewerBootstrap();
  const resolvedTournamentId = tournamentId || undefined;
  const data = useQuery(
    api.functions.tournaments.getTournamentLeaderboardView,
    {
      tournamentId: resolvedTournamentId as Id<"tournaments"> | undefined,
    },
  );
  const userTourCard =
    data?.tournament && bootstrap
      ? (bootstrap.tourCards.find(
          (card) => card.seasonId === data.tournament!.seasonId,
        ) ?? null)
      : null;
  const defaultTourId =
    tourId || (userTourCard ? String(userTourCard.tourId) : "");

  useEffect(() => {
    if (!tourId && defaultTourId) {
      navigate({
        replace: true,
        search: (prev) => ({
          ...prev,
          tourId: defaultTourId,
        }),
      });
    }
  }, [defaultTourId, navigate, tourId]);

  if (data === undefined) {
    return <LeaderboardViewSkeleton />;
  }

  if (!data?.tournament)
    return (
      <div className="container mx-auto px-1 py-4">
        <div className="text-center text-red-600">Tournament not found.</div>
      </div>
    );

  if (data.tournament.status === "upcoming") {
    const existingTeam = data.teams.find(
      (t) => t.tourCardId === userTourCard?._id,
    );
    return (
      <PreTournamentContent
        tournament={data.tournament}
        member={member === null ? undefined : member}
        tourCard={userTourCard}
        existingTeam={existingTeam}
        allTournaments={data.allTournaments}
        teamGolfers={data.golfers.filter((g) =>
          existingTeam?.golferIds.includes(g.apiId ?? 0),
        )}
        pickPool={data.pickPool.filter(
          (
            golfer,
          ): golfer is {
            golferApiId: number;
            playerName: string;
            group: number | null;
            worldRank: number | null;
            rating: number | null;
          } =>
            golfer.golferApiId !== undefined && golfer.playerName !== undefined,
        )}
        playoffEventIndex={data.tournament.eventIndex}
        onTournamentChange={(nextTournamentId) => {
          navigate({
            search: (prev) => ({
              ...prev,
              tournamentId: nextTournamentId,
              tourId: "",
            }),
          });
        }}
      />
    );
  }

  return (
    <LeaderboardView
      tournament={data.tournament}
      tours={data.tours}
      tourCards={data.tourCards ?? []}
      teams={data.teams}
      golfers={data.golfers}
      allTournaments={data.allTournaments}
      userTourCard={userTourCard}
      viewerMember={member ?? null}
      onTournamentChange={(nextTournamentId) => {
        navigate({
          search: (prev) => ({
            ...prev,
            tournamentId: nextTournamentId,
            tourId: "",
          }),
        });
      }}
      activeTourId={defaultTourId}
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
