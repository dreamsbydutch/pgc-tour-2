/**
 * Utility functions for Leaderboard components
 * Adapted for Convex backend integration
 */

import type {
  LeaderboardGolfer,
  TeamWithTourCard,
  LeaderboardTour,
  LeaderboardTourCard,
  TourToggle,
} from "./types";

/**
 * Determines if a tournament is a playoff tournament based on tournament tier
 */
export const isPlayoffTournament = (tournament?: {
  tier?: { name?: string } | null;
}): boolean => {
  if (!tournament?.tier?.name) return false;
  return tournament.tier.name.toLowerCase().includes("playoff");
};

/**
 * Gets the maximum playoff level from tour cards
 */
export const getMaxPlayoffLevel = (
  tourCards: LeaderboardTourCard[],
): number => {
  if (!Array.isArray(tourCards) || tourCards.length === 0) return 0;

  const playoffLevels = tourCards
    .map((card) => card?.playoff ?? 0)
    .filter((level) => level > 0);

  return playoffLevels.length > 0 ? Math.max(...playoffLevels) : 0;
};

/**
 * Filters teams by tour and variant
 */
export const filterTeamsByTour = (
  teams: TeamWithTourCard[],
  activeTour: string,
  variant: "regular" | "playoff" = "regular",
): TeamWithTourCard[] => {
  if (!Array.isArray(teams)) return [];

  return teams.filter((team) => {
    if (activeTour === "pga") {
      return true;
    }

    if (variant === "playoff") {
      return (
        team.tourCard?.tourId === activeTour &&
        (team.tourCard?.playoff ?? 0) > 0
      );
    }

    return team.tourCard?.tourId === activeTour;
  });
};

/**
 * Creates tour toggle options from available tours and teams
 */
export const createTourToggles = (
  tours: LeaderboardTour[],
  teams: TeamWithTourCard[],
  variant: "regular" | "playoff" = "regular",
): TourToggle[] => {
  if (!Array.isArray(tours) || !Array.isArray(teams)) return [];

  const toggles: TourToggle[] = [];

  toggles.push({
    id: "pga",
    name: "PGA Leaderboard",
    shortForm: "PGA",
    logoUrl: null,
    teamCount: 0,
  });

  tours.forEach((tour) => {
    const teamCount = teams.filter((team) => {
      if (variant === "playoff") {
        return (
          team.tourCard?.tourId === tour._id &&
          (team.tourCard?.playoff ?? 0) > 0
        );
      }
      return team.tourCard?.tourId === tour._id;
    }).length;

    if (teamCount > 0) {
      toggles.push({
        id: tour._id,
        name: tour.name,
        shortForm: tour.shortForm,
        logoUrl: tour.logoUrl,
        teamCount,
      });
    }
  });

  return toggles;
};

/**
 * Determines the default toggle based on teams and tours
 */
export const getDefaultToggle = (
  tours: LeaderboardTour[],
  teams: TeamWithTourCard[],
  variant: "regular" | "playoff" = "regular",
  inputTourId?: string,
): string => {
  if (inputTourId) {
    const tourExists = tours.some((tour) => tour._id === inputTourId);
    if (tourExists || inputTourId === "pga") {
      return inputTourId;
    }
  }

  const tourCounts = tours.map((tour) => ({
    id: tour._id,
    count: teams.filter((team) => {
      if (variant === "playoff") {
        return (
          team.tourCard?.tourId === tour._id &&
          (team.tourCard?.playoff ?? 0) > 0
        );
      }
      return team.tourCard?.tourId === tour._id;
    }).length,
  }));

  tourCounts.sort((a, b) => b.count - a.count);

  return tourCounts.length > 0 && tourCounts[0].count > 0
    ? tourCounts[0].id
    : "pga";
};

/**
 * Formats a golf score for display
 */
export const formatScore = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return "-";

  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return score.toString();
};

/**
 * Formats position for display
 */
export const formatPosition = (
  position: string | number | null | undefined,
): string => {
  if (!position) return "-";
  return position.toString();
};

/**
 * Formats thru (holes completed) for display
 */
export const formatThru = (thru: number | null | undefined): string => {
  if (thru === null || thru === undefined) return "-";
  if (thru === 18) return "F";
  return thru.toString();
};

/**
 * Sorts teams by score (ascending, lower is better)
 */
export const sortTeamsByScore = (
  teams: TeamWithTourCard[],
): TeamWithTourCard[] => {
  return [...teams].sort((a, b) => {
    if (a.score === null || a.score === undefined) return 1;
    if (b.score === null || b.score === undefined) return -1;

    return a.score - b.score;
  });
};

/**
 * Sorts golfers by position and score
 */
export const sortGolfersByPosition = (
  golfers: LeaderboardGolfer[],
): LeaderboardGolfer[] => {
  return [...golfers].sort((a, b) => {
    if (a.position && b.position) {
      const posA = parseInt(a.position.replace(/[^0-9]/g, ""));
      const posB = parseInt(b.position.replace(/[^0-9]/g, ""));
      if (!isNaN(posA) && !isNaN(posB)) {
        return posA - posB;
      }
    }

    if (a.score === null || a.score === undefined) return 1;
    if (b.score === null || b.score === undefined) return -1;
    return a.score - b.score;
  });
};
