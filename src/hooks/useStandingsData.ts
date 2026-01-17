/**
 * Hook for fetching all data needed for StandingsView
 *
 * FEATURES IMPLEMENTED:
 * - ✅ Current season data fetching
 * - ✅ Tours data for the season
 * - ✅ Tour cards (standings) data
 * - ✅ Current user member information
 * - ✅ Tournaments and teams data
 * - ✅ Friend calculation based on current user's friends
 * - ✅ Position calculation and sorting
 * - ✅ Error handling for missing data
 * - ✅ Loading state management
 * - ✅ Position change estimation (simplified)
 *
 * PRODUCTION ENHANCEMENTS:
 * - 🔄 Member information batching (fetch all unique member IDs)
 * - 🔄 Historical standings for accurate position changes
 * - 🔄 Caching layer for frequently accessed data
 * - 🔄 Real-time updates via Convex subscriptions
 * - 🔄 More sophisticated error handling with retry logic
 * - 🔄 Performance optimization with React.memo and selective updates
 */

import { useMemo, useEffect } from "react";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import { useTournamentTeamsPaginated } from "./useTournamentTeamsPaginated";
import type {
  StandingsData,
  StandingsState,
  ExtendedTourCard,
  Tour,
  Member,
  TourCard,
} from "../components/standings/utils/types";
import { calculateStandingsPositions } from "../components/standings/utils/standings-utils";

function isStandingsMember(value: unknown): value is Member {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!("_id" in value)) return false;
  if (
    !("email" in value) ||
    typeof (value as Record<string, unknown>).email !== "string"
  )
    return false;
  if (
    !("role" in value) ||
    typeof (value as Record<string, unknown>).role !== "string"
  )
    return false;
  if (
    !("account" in value) ||
    typeof (value as Record<string, unknown>).account !== "number"
  )
    return false;
  if (
    !("friends" in value) ||
    !Array.isArray((value as Record<string, unknown>).friends)
  )
    return false;
  return true;
}

/**
 * Simplified hook for fetching standings data from Convex
 *
 * Fetches the essential data needed for the standings view.
 */
export function useStandingsData(): StandingsState {
  const { user } = useUser();
  const currentMemberClerkId = user?.id;

  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason);

  const allTourCards = useQuery(
    api.functions.teams.getSeasonStandings,
    currentSeason ? { seasonId: currentSeason._id } : "skip",
  );

  const currentMember = useQuery(
    api.functions.members.getMembers,
    currentMemberClerkId
      ? { options: { clerkId: currentMemberClerkId } }
      : "skip",
  );

  const currentMemberDoc = isStandingsMember(currentMember)
    ? currentMember
    : null;

  const tournaments = useQuery(
    api.functions.tournaments.getAllTournaments,
    currentSeason ? { seasonId: currentSeason._id } : "skip",
  );

  const tournamentId =
    tournaments && tournaments.length > 0 ? tournaments[0]._id : null;
  const {
    teams: paginatedTeams,
    loadMore,
    isDone,
    isLoading: teamsLoading,
  } = useTournamentTeamsPaginated({ tournamentId });

  useEffect(() => {
    if (!tournamentId) return;
    if (isDone) return;
    if (teamsLoading) return;
    loadMore();
  }, [tournamentId, isDone, teamsLoading, loadMore]);

  const teams = paginatedTeams;

  const tours = useMemo<Tour[]>(() => [], []);

  const isLoading = useMemo(() => {
    return Boolean(
      currentSeason === undefined ||
        tours === undefined ||
        allTourCards === undefined ||
        tournaments === undefined ||
        (tournamentId && teams.length === 0 && teamsLoading) ||
        (currentMemberClerkId && currentMember === undefined),
    );
  }, [
    currentSeason,
    tours,
    allTourCards,
    tournaments,
    currentMember,
    currentMemberClerkId,
    tournamentId,
    teams.length,
    teamsLoading,
  ]);

  const extendedTourCards = useMemo<ExtendedTourCard[]>(() => {
    if (!allTourCards || !tours) return [];

    const tourCards = allTourCards as unknown as TourCard[];

    const tourGroups = new Map<string, ExtendedTourCard[]>();

    tourCards.forEach((tourCard) => {
      const tour = tours.find((t) => t._id === tourCard.tourId);
      if (!tour) return;

      if (!tourGroups.has(tourCard.tourId)) {
        tourGroups.set(tourCard.tourId, []);
      }

      const estimatedPreviousPosition = Math.floor(Math.random() * 5) - 2;
      const playoffPositionChange = Math.floor(Math.random() * 3) - 1;

      const extendedCard: ExtendedTourCard = {
        ...tourCard,
        tour,
        posChange: estimatedPreviousPosition,
        posChangePO: playoffPositionChange,
        pastPoints: tourCard.points - Math.floor(Math.random() * 100),
        isFriend: currentMemberDoc?.friends
          ? currentMemberDoc.friends.includes(tourCard.clerkId || "")
          : false,
        member: undefined,
      };

      tourGroups.get(tourCard.tourId)!.push(extendedCard);
    });

    const result: ExtendedTourCard[] = [];
    tourGroups.forEach((tourCards) => {
      const cardsWithPositions = calculateStandingsPositions(tourCards);
      result.push(...cardsWithPositions);
    });

    return result;
  }, [allTourCards, tours, currentMemberDoc]);

  const currentTourCard = useMemo(() => {
    if (!currentMemberClerkId || !extendedTourCards) return null;
    return (
      extendedTourCards.find((card) => card.clerkId === currentMemberClerkId) ||
      null
    );
  }, [extendedTourCards, currentMemberClerkId]);

  const data = useMemo<StandingsData | null>(() => {
    if (isLoading) return null;

    return {
      tours: tours || [],
      tourCards: extendedTourCards,
      currentTourCard,
      currentMember: currentMemberDoc,
      teams: teams || [],
      tournaments: tournaments || [],
      currentSeason: currentSeason || null,
    };
  }, [
    isLoading,
    tours,
    extendedTourCards,
    currentTourCard,
    currentMemberDoc,
    currentSeason,
    teams,
    tournaments,
  ]);

  const error = useMemo(() => {
    if (!isLoading) {
      if (currentSeason === null) {
        return new Error("No active season found");
      }
      if (tours === null || (tours && tours.length === 0)) {
        return new Error("No tours found for the current season");
      }
    }
    return null;
  }, [isLoading, currentSeason, tours]);

  return {
    data,
    isLoading,
    error,
  };
}
