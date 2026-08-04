import { useEffect } from "react";

import { useTournamentPage } from "@/hooks";
import type { TournamentPageProps } from "@/types";
import { Button } from "@/ui";
import { LeaderboardView, LeaderboardViewSkeleton } from "./LeaderboardView";
import { PreTournamentContent } from "./PreTournamentContent";

export function TournamentPage({ search, navigate }: TournamentPageProps) {
  const variant = search.variant ?? "regular";
  const page = useTournamentPage({
    tournamentId: search.tournamentId,
    tourId: search.tourId,
    variant,
  });

  useEffect(() => {
    if (!page.tournament || !page.activeTourId) return;
    const tournamentId = String(page.tournament._id);
    const canonicalVariant = variant === "playoff" ? "playoff" : undefined;
    if (
      search.tournamentId === tournamentId &&
      search.tourId === page.activeTourId &&
      search.variant === canonicalVariant
    ) {
      return;
    }
    navigate(
      { tournamentId, tourId: page.activeTourId, variant: canonicalVariant },
      { replace: true },
    );
  }, [navigate, page.activeTourId, page.tournament, search, variant]);

  if (page.isLoading) return <LeaderboardViewSkeleton />;

  if (!page.tournament || !page.shell) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold">Tournament not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The selected tournament is unavailable or no longer exists.
        </p>
        <Button
          className="mt-4"
          onClick={() => navigate({}, { replace: true })}
        >
          Open current tournament
        </Button>
      </div>
    );
  }

  const tournamentId = String(page.tournament._id);
  const canonicalVariant = variant === "playoff" ? "playoff" : undefined;
  const changeTournament = (nextTournamentId: string) =>
    navigate({
      tournamentId: nextTournamentId,
      tourId: undefined,
      variant: canonicalVariant,
    });

  if (page.tournament.status === "upcoming" && page.preTournamentView) {
    return (
      <PreTournamentContent
        tournament={page.preTournamentView.tournament}
        member={page.member === null ? undefined : page.member}
        tourCard={page.userTourCard}
        existingTeam={page.preTournamentView.existingTeam}
        allTournaments={page.preTournamentView.allTournaments}
        teamGolfers={page.preTournamentView.teamGolfers}
        pickPool={page.preTournamentView.pickPool}
        playoffEventIndex={page.preTournamentView.tournament.eventIndex}
        onTournamentChange={changeTournament}
      />
    );
  }

  return (
    <LeaderboardView
      tournament={page.tournament}
      tours={page.shell.tours}
      tourCards={page.pgcLeaderboard?.tourCards ?? []}
      teams={page.pgcLeaderboard?.teams ?? []}
      golfers={page.pgaLeaderboard?.golfers ?? []}
      viewerTeam={page.pgaLeaderboard?.viewerTeam}
      allTournaments={page.shell.allTournaments}
      userTourCard={page.userTourCard}
      viewerMember={page.member ?? null}
      onTournamentChange={changeTournament}
      activeTourId={page.activeTourId}
      onChangeTourId={(tourId) =>
        navigate({ tournamentId, tourId, variant: canonicalVariant })
      }
      variant={variant}
      isPreTournament={false}
      majorChampionBadgesByMemberId={page.shell.majorChampionBadgesByMemberId}
      freshness={page.freshness}
    />
  );
}
