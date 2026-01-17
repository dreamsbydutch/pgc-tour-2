/**
 * Utility functions for PreTournament components
 * Adapted from the old app for Convex backend integration
 */

import type { ExtendedTournament } from "./types";

/**
 * Helper function to determine if a tournament is a playoff tournament
 * Made more defensive to handle missing tier data
 * Falls back to tournament name if tier is not available
 */
export function isPlayoffTournament(tournament: {
  tier?: { name?: string };
  name?: string;
}): boolean {
  try {
    if (tournament.tier?.name) {
      return tournament.tier.name.toLowerCase().includes("playoff");
    }

    if (tournament.name) {
      return tournament.name.toLowerCase().includes("playoff");
    }

    return false;
  } catch (error) {
    console.warn("Error checking playoff tournament status:", error);
    return false;
  }
}

/**
 * Helper function to determine if a user is eligible for playoff tournaments
 * Made more defensive to handle missing data
 */
export function isPlayoffEligible(
  tourCard: { playoff?: number } | null | undefined,
): boolean {
  try {
    return (tourCard?.playoff ?? 0) >= 1;
  } catch (error) {
    console.warn("Error checking playoff eligibility:", error);
    return false;
  }
}

/**
 * Calculate the playoff event index for a tournament within a season
 */
export function calculatePlayoffEventIndex(
  tournament: ExtendedTournament,
  allTournaments: ExtendedTournament[],
): number {
  try {
    const playoffTournaments = allTournaments
      .filter((t) => isPlayoffTournament(t))
      .sort((a, b) => a.startDate - b.startDate);

    const index = playoffTournaments.findIndex((t) => t._id === tournament._id);
    return index === -1 ? 0 : index + 1;
  } catch (error) {
    console.warn("Error calculating playoff event index:", error);
    return 0;
  }
}

/**
 * Check if team picks are currently open
 * Picks open 4 days before tournament start
 */
export function arePicksOpen(tournamentStartDate: number): boolean {
  try {
    const msUntilStart = tournamentStartDate - Date.now();
    return msUntilStart <= 4 * 24 * 60 * 60 * 1000;
  } catch (error) {
    console.warn("Error calculating team pick availability:", error);
    return false;
  }
}

/**
 * Get time remaining until tournament starts
 */
export function getTimeUntilStart(tournamentStartDate: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
} {
  try {
    const totalMs = Math.max(0, tournamentStartDate - Date.now());
    const days = Math.floor(totalMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor(
      (totalMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000),
    );
    const minutes = Math.floor((totalMs % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((totalMs % (60 * 1000)) / 1000);

    return { days, hours, minutes, seconds, totalMs };
  } catch (error) {
    console.warn("Error calculating time until start:", error);
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }
}

/**
 * Format money amounts (account balance, earnings, etc.)
 */
export function formatMoney(cents: number): string {
  try {
    const dollars = cents / 100;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(dollars);
  } catch (error) {
    console.warn("Error formatting money:", error);
    return "$0.00";
  }
}

/**
 * Format ranking position
 */
export function formatRank(position: number): string {
  try {
    if (position <= 0 || !Number.isFinite(position)) {
      return "Unranked";
    }

    const suffix = getOrdinalSuffix(position);
    return `${position}${suffix}`;
  } catch (error) {
    console.warn("Error formatting rank:", error);
    return "Unranked";
  }
}

/**
 * Get ordinal suffix for numbers (1st, 2nd, 3rd, 4th, etc.)
 */
function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;

  if (j === 1 && k !== 11) {
    return "st";
  }
  if (j === 2 && k !== 12) {
    return "nd";
  }
  if (j === 3 && k !== 13) {
    return "rd";
  }
  return "th";
}

/**
 * Format points with proper number formatting
 */
export function formatPoints(points: number): string {
  try {
    return points.toLocaleString();
  } catch (error) {
    console.warn("Error formatting points:", error);
    return "0";
  }
}

/**
 * Check if user has outstanding balance that prevents team creation
 */
export function hasOutstandingBalance(
  member: { account?: number } | null,
): boolean {
  try {
    return (member?.account ?? 0) > 0;
  } catch (error) {
    console.warn("Error checking outstanding balance:", error);
    return false;
  }
}

/**
 * Check if team is empty (no golfers selected)
 */
export function isTeamEmpty(team: { golferIds?: number[] } | null): boolean {
  try {
    return !team || !team.golferIds || team.golferIds.length === 0;
  } catch (error) {
    console.warn("Error checking if team is empty:", error);
    return true;
  }
}

/**
 * Sort golfers by world rank and group
 */
export function sortGolfers(
  golfers: Array<{
    worldRank?: number;
    group?: number;
    playerName: string;
  }>,
): Array<{
  worldRank?: number;
  group?: number;
  playerName: string;
}> {
  try {
    return [...golfers]
      .sort((a, b) => (a.worldRank ?? Infinity) - (b.worldRank ?? Infinity))
      .sort((a, b) => (a.group ?? Infinity) - (b.group ?? Infinity));
  } catch (error) {
    console.warn("Error sorting golfers:", error);
    return golfers;
  }
}
