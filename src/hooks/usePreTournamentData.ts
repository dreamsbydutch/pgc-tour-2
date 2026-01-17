/**
 * Hook for fetching all data needed for PreTournament page
 * Adapted for Convex backend integration
 */

import { useMemo, useEffect } from "react";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import { useTournamentTeamsPaginated } from "./useTournamentTeamsPaginated";
import { useTournamentLeaderboardGolfers } from "./useTournamentLeaderboardGolfers";
import type { Id } from "../../convex/_generated/dataModel";
import type {
  PreTournamentData,
  PreTournamentState,
  ExtendedTournament,
  ExtendedTeam,
  Golfer,
} from "../components/pre-tournament/utils/types";
import { calculatePlayoffEventIndex } from "../components/pre-tournament/utils";

/**
 * Hook for fetching pre-tournament data from Convex
 *
 * @param tournamentId - The tournament ID to fetch data for
 */
export function usePreTournamentData(tournamentId: string): PreTournamentState {
  const { user } = useUser();
  const currentMemberClerkId = user?.id;

  const tournamentDetails = useQuery(
    api.functions.tournaments.getTournamentWithDetails,
    tournamentId ? { tournamentId: tournamentId as Id<"tournaments"> } : "skip",
  );

  const tournament = tournamentDetails?.tournament ?? null;

  const currentMemberResult = useQuery(
    api.functions.members.getMembers,
    currentMemberClerkId
      ? { options: { clerkId: currentMemberClerkId } }
      : "skip",
  );

  const currentMember =
    currentMemberResult &&
    typeof currentMemberResult === "object" &&
    !Array.isArray(currentMemberResult) &&
    "_id" in currentMemberResult
      ? currentMemberResult
      : null;

  const tourCards = useQuery(
    api.functions.tourCards.getTourCards,
    currentMemberClerkId
      ? { options: { clerkId: currentMemberClerkId } }
      : "skip",
  );

  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason);

  const allTournaments = useQuery(
    api.functions.tournaments.getAllTournaments,
    currentSeason ? { seasonId: currentSeason._id } : "skip",
  );

  const currentTourCard = useMemo(() => {
    if (!tourCards || tourCards.length === 0) return null;
    return tourCards[0];
  }, [tourCards]);

  const {
    teams: existingTeam,
    loadMore: loadMoreTeams,
    isDone: teamsDone,
    isLoading: teamsLoading,
  } = useTournamentTeamsPaginated({
    tournamentId: tournament && currentTourCard ? tournament._id : null,
  });

  useEffect(() => {
    if (!tournament || !currentTourCard) return;
    if (teamsDone) return;
    if (teamsLoading) return;
    loadMoreTeams();
  }, [tournament, currentTourCard, teamsDone, teamsLoading, loadMoreTeams]);

  const userTeam = useMemo(() => {
    if (!existingTeam || !currentTourCard) return null;
    const team = existingTeam.find((t) => t.tourCardId === currentTourCard._id);
    return team || null;
  }, [existingTeam, currentTourCard]);

  const { golfers: teamGolfersData, isLoading: teamGolfersLoading } =
    useTournamentLeaderboardGolfers({
      tournamentId: tournament ? tournament._id : null,
    });

  const teamGolfers = teamGolfersData;

  const userTeamGolfers = useMemo(() => {
    if (!userTeam || !teamGolfers || !userTeam.golferIds) return [];
    return teamGolfers
      .filter(
        (golfer) =>
          golfer.apiId !== undefined &&
          userTeam.golferIds.includes(golfer.apiId),
      )
      .map((golfer) => ({
        ...golfer,
        apiId: golfer.apiId!,
      }));
  }, [userTeam, teamGolfers]);

  const isLoading = useMemo(() => {
    if (!tournamentId) {
      return false;
    }

    return Boolean(
      tournament === undefined ||
        currentMember === undefined ||
        (currentMemberClerkId && tourCards === undefined) ||
        allTournaments === undefined ||
        (tournament &&
          currentTourCard &&
          existingTeam.length === 0 &&
          teamsLoading) ||
        (tournament && teamGolfers.length === 0 && teamGolfersLoading),
    );
  }, [
    tournamentId,
    tournament,
    currentMember,
    currentMemberClerkId,
    tourCards,
    allTournaments,
    currentTourCard,
    existingTeam.length,
    teamsLoading,
    teamGolfers.length,
    teamGolfersLoading,
  ]);

  const playoffEventIndex = useMemo(() => {
    if (!tournament || !allTournaments) return 0;
    const extendedTournament: ExtendedTournament = {
      ...tournament,
      tier: undefined,
    };
    return calculatePlayoffEventIndex(
      extendedTournament,
      (allTournaments as unknown as ExtendedTournament[]).map((t) => ({
        ...t,
        tier: undefined,
      })),
    );
  }, [tournament, allTournaments]);

  const error = useMemo(() => {
    if (!isLoading) {
      if (tournament === null) {
        return new Error("Tournament not found");
      }
      if (currentMemberClerkId && currentMember === null) {
        return new Error("Member not found");
      }
      if (currentMemberClerkId && (!tourCards || tourCards.length === 0)) {
        return new Error("No tour cards found for member");
      }
    }
    return null;
  }, [isLoading, tournament, currentMember, currentMemberClerkId, tourCards]);

  const data = useMemo<PreTournamentData | null>(() => {
    if (isLoading) return null;

    const extendedTournament: ExtendedTournament | null = tournament
      ? {
          ...tournament,
          tier: undefined,
        }
      : null;

    const extendedTeam: ExtendedTeam | null = userTeam
      ? {
          ...userTeam,
          golfers: userTeamGolfers as Golfer[],
        }
      : null;

    return {
      tournament: extendedTournament,
      member: currentMember || null,
      tourCard: currentTourCard || null,
      existingTeam: extendedTeam,
      teamGolfers: userTeamGolfers as Golfer[],
      playoffEventIndex,
      allTournaments: allTournaments || [],
    };
  }, [
    isLoading,
    tournament,
    currentMember,
    currentTourCard,
    userTeam,
    userTeamGolfers,
    playoffEventIndex,
    allTournaments,
  ]);

  return {
    data,
    isLoading,
    error,
  };
}
