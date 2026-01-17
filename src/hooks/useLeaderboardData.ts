/**
 * Hook for fetching leaderboard data from Convex
 * Adapted from the original useLeaderboardData hook
 */

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import { useTournamentTeamsPaginated } from "./useTournamentTeamsPaginated";
import { useTournamentLeaderboardGolfers } from "./useTournamentLeaderboardGolfers";
import type { Id } from "../../convex/_generated/dataModel";
import type {
  LeaderboardDataProps,
  LeaderboardDataState,
  LeaderboardTour,
} from "../components/leaderboard/utils/types";

interface UseLeaderboardDataParams {
  tournamentId: Id<"tournaments">;
  inputTour?: string;
}

/**
 * Hook for fetching all data needed for leaderboard display
 */
export function useLeaderboardData({
  tournamentId,
  inputTour,
}: UseLeaderboardDataParams): LeaderboardDataState {
  const { user } = useUser();
  const currentMemberClerkId = user?.id;

  const tournamentDetails = useQuery(
    api.functions.tournaments.getTournamentWithDetails,
    tournamentId ? { tournamentId } : "skip",
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

  const {
    teams: paginatedTeams,
    loadMore,
    isDone,
    isLoading: teamsLoading,
  } = useTournamentTeamsPaginated({ tournamentId: tournamentId ?? null });

  useEffect(() => {
    if (!tournamentId) return;
    if (isDone) return;
    if (teamsLoading) return;
    loadMore();
  }, [tournamentId, isDone, teamsLoading, loadMore]);

  const teams = paginatedTeams;

  const { golfers: golfersData, isLoading: golfersLoading } =
    useTournamentLeaderboardGolfers({ tournamentId });

  const golfers = golfersData;

  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason);

  const tours: LeaderboardTour[] = [];

  const loading =
    tournamentDetails === undefined ||
    (tournamentId && teams.length === 0 && teamsLoading) ||
    (tournamentId && golfers.length === 0 && golfersLoading) ||
    tours === undefined ||
    currentSeason === undefined ||
    (currentMemberClerkId &&
      (currentMember === undefined || tourCards === undefined));

  let error: Error | null = null;
  if (!loading && !tournament) {
    error = new Error("Tournament not found");
  }

  const currentTourCard = tourCards?.[0] ?? null;

  const props: LeaderboardDataProps | null =
    loading || error
      ? null
      : {
          tournament: tournament!,
          teams: teams || [],
          golfers: (golfers || [])
            .filter((golfer) => golfer.apiId !== undefined)
            .map((golfer) => ({
              _id: golfer._id || ("" as Id<"golfers">),
              _creationTime: Date.now(),
              apiId: golfer.apiId!,
              playerName: golfer.playerName,
              country: golfer.country,
              worldRank: golfer.worldRank,
              updatedAt: golfer.updatedAt,
              position: golfer.position || null,
              posChange: golfer.posChange || null,
              score: golfer.score || null,
              today: golfer.today || null,
              thru: golfer.thru || null,
              group: golfer.group || null,
              roundOne: golfer.roundOne || null,
              roundTwo: golfer.roundTwo || null,
              roundThree: golfer.roundThree || null,
              roundFour: golfer.roundFour || null,
            })),
          tours: tours || [],
          tourCards: tourCards || [],
          member: currentMember || null,
          tourCard: currentTourCard,
          inputTour,
        };

  const refetch = () => {
    console.log("Leaderboard data refetch requested");
  };

  return {
    props,
    loading: Boolean(loading),
    error,
    refetch,
  };
}
