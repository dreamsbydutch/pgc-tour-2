/**
 * Pure utility functions for StandingsView component
 * These functions are reusable and have no side effects
 * Adapted for Convex backend integration
 */

import type { ExtendedTourCard, StandingsGroups, PlayoffGroups } from "./types";

/**
 * Parses a position string/number (e.g., "T15", 12, "1") to a number for comparison
 * @param pos - Position as string, number, or null/undefined
 * @returns Numeric position value, Infinity if not parseable
 */
export function parsePosition(pos: string | number | undefined | null): number {
  if (typeof pos === "number") return pos;
  if (typeof pos === "string") {
    const match = /\d+/.exec(pos);
    if (match) return parseInt(match[0], 10);
  }
  return Infinity;
}

/**
 * Formats points for display with proper number formatting
 * @param points - Point value to format
 * @returns Formatted points string
 */
export function formatPoints(points: number): string {
  return points.toLocaleString();
}

/**
 * Calculates position change indicator styling
 * @param posChange - Position change value (positive = improvement)
 * @returns Object with display value and CSS classes
 */
export function formatPositionChange(posChange: number): {
  value: string;
  className: string;
  icon: "up" | "down" | "neutral";
} {
  if (posChange === 0) {
    return {
      value: "—",
      className: "text-gray-500",
      icon: "neutral",
    };
  }

  const isImprovement = posChange > 0;
  return {
    value: isImprovement ? `+${posChange}` : posChange.toString(),
    className: isImprovement ? "text-green-600" : "text-red-600",
    icon: isImprovement ? "up" : "down",
  };
}

/**
 * Groups tour cards by their standings position for regular tour view
 * @param tourCards - Array of tour cards to group
 * @returns Grouped tour cards by position ranges
 */
export function groupTourStandings(
  tourCards: ExtendedTourCard[],
): StandingsGroups {
  const goldCutCards = tourCards.filter(
    (card) => parsePosition(card.currentPosition) <= 15,
  );

  const silverCutCards = tourCards.filter((card) => {
    const pos = parsePosition(card.currentPosition);
    return pos >= 16 && pos <= 35;
  });

  const remainingCards = tourCards.filter(
    (card) => parsePosition(card.currentPosition) > 35,
  );

  return {
    goldCutCards,
    silverCutCards,
    remainingCards,
  };
}

/**
 * Groups tour cards by their playoff standings
 * @param tourCards - Array of tour cards to group
 * @returns Grouped tour cards by playoff categories
 */
export function groupPlayoffStandings(
  tourCards: ExtendedTourCard[],
): PlayoffGroups {
  const goldTeams = tourCards.filter(
    (card) => parsePosition(card.currentPosition) <= 15,
  );

  const silverTeams = tourCards.filter((card) => {
    const pos = parsePosition(card.currentPosition);
    return pos <= 35 && pos > 15;
  });

  const bumpedTeams = tourCards.filter((card) => {
    const pos = parsePosition(card.currentPosition);
    return pos > 35 && pos + (card.posChange ?? 0) <= 35;
  });

  return {
    goldTeams,
    silverTeams,
    bumpedTeams,
  };
}

/**
 * Filters tour cards for a specific tour
 * @param tourCards - Array of tour cards to filter
 * @param tourId - Tour ID to filter by
 * @returns Filtered tour cards for the specified tour
 */
export function filterTourCardsByTour(
  tourCards: ExtendedTourCard[],
  tourId: string,
): ExtendedTourCard[] {
  return tourCards.filter((card) => card.tourId === tourId);
}

/**
 * Sorts tour cards by points in descending order
 * @param tourCards - Array of tour cards to sort
 * @returns Sorted array of tour cards by points (highest first)
 */
export function sortTourCardsByPoints(
  tourCards: ExtendedTourCard[],
): ExtendedTourCard[] {
  return [...tourCards].sort((a, b) => b.points - a.points);
}

/**
 * Sorts tour cards by position in ascending order
 * @param tourCards - Array of tour cards to sort
 * @returns Sorted array of tour cards by position (lowest first)
 */
export function sortTourCardsByPosition(
  tourCards: ExtendedTourCard[],
): ExtendedTourCard[] {
  return [...tourCards].sort(
    (a, b) =>
      parsePosition(a.currentPosition) - parsePosition(b.currentPosition),
  );
}

/**
 * Checks if a tour card qualifies for gold playoff
 * @param tourCard - Tour card to check
 * @returns True if qualifies for gold playoff
 */
export function isGoldPlayoffQualified(tourCard: ExtendedTourCard): boolean {
  return parsePosition(tourCard.currentPosition) <= 15;
}

/**
 * Checks if a tour card qualifies for silver playoff
 * @param tourCard - Tour card to check
 * @returns True if qualifies for silver playoff
 */
export function isSilverPlayoffQualified(tourCard: ExtendedTourCard): boolean {
  const pos = parsePosition(tourCard.currentPosition);
  return pos > 15 && pos <= 35;
}

/**
 * Checks if a tour card was bumped into playoffs
 * @param tourCard - Tour card to check
 * @returns True if was bumped into playoffs
 */
export function isBumpedIntoPlayoffs(tourCard: ExtendedTourCard): boolean {
  const pos = parsePosition(tourCard.currentPosition);
  return pos > 35 && pos + (tourCard.posChange ?? 0) <= 35;
}

/**
 * Determines the appropriate CSS classes for a tour card row
 * @param tourCard - Tour card to style
 * @param currentMemberClerkId - Current user's member Clerk ID
 * @param friends - Array of friend member Clerk IDs
 * @returns CSS class string
 */
export function getTourCardRowClasses(
  tourCard: ExtendedTourCard,
  currentMemberClerkId?: string | null,
  friends?: string[] | null,
): string {
  const classes = ["standings-row"];
  const cardClerkId = tourCard.clerkId || "";

  if (cardClerkId === currentMemberClerkId) {
    classes.push("bg-blue-50 font-semibold border-blue-200");
  } else if (friends?.includes(cardClerkId)) {
    classes.push("bg-gray-50 border-gray-200");
  }

  return classes.join(" ");
}

/**
 * Calculates current standings positions for tour cards
 * @param tourCards - Array of tour cards
 * @returns Array of tour cards with position numbers added
 */
export function calculateStandingsPositions(
  tourCards: ExtendedTourCard[],
): ExtendedTourCard[] {
  const sortedCards = sortTourCardsByPoints(tourCards);

  return sortedCards.map((card, index) => ({
    ...card,
    standingsPosition: index + 1,
  }));
}

/**
 * Filters tour cards by friends only
 * @param tourCards - Array of tour cards to filter
 * @param friendClerkIds - Array of friend Clerk IDs
 * @param currentMemberClerkId - Current user's Clerk ID
 * @returns Filtered tour cards showing only friends and current user
 */
export function filterFriendsOnly(
  tourCards: ExtendedTourCard[],
  friendClerkIds: string[],
  currentMemberClerkId?: string,
): ExtendedTourCard[] {
  return tourCards.filter((card) => {
    const cardClerkId = card.clerkId || "";
    return (
      friendClerkIds.includes(cardClerkId) ||
      cardClerkId === currentMemberClerkId
    );
  });
}
