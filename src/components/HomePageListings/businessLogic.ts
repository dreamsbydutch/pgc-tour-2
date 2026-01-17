/**
 * HomePageListings - Business logic utilities
 */

import { MAJOR_TOURNAMENTS } from "./constants";
import type { Champion } from "../standings/utils/types";

type MajorTournamentName = (typeof MAJOR_TOURNAMENTS)[number];

/**
 * Type guard to check if a tournament name is a major tournament
 */
function isMajorTournament(name: string): name is MajorTournamentName {
  return MAJOR_TOURNAMENTS.includes(name as MajorTournamentName);
}

/**
 * Filter champions for a specific member in a specific season
 */
export function filterChampionsForMember(
  champions: Champion[] | null | undefined,
  memberId: string,
  _seasonId: string,
): Champion[] {
  if (!champions || !Array.isArray(champions)) {
    return [];
  }

  return champions.filter(
    (champion) =>
      champion.tourCardId === memberId &&
      isMajorTournament(champion.tournament?.name ?? ""),
  );
}

/**
 * Check if a member has any major championships in a given season
 */
export function hasMajorChampionships(
  champions: Champion[] | null | undefined,
  memberId: string,
  seasonId: string,
): boolean {
  const memberChampions = filterChampionsForMember(
    champions,
    memberId,
    seasonId,
  );
  return memberChampions.length > 0;
}

/**
 * Calculate team position for display
 */
export function calculateTeamPosition(
  position: string | number | null,
  defaultPosition: string = "–",
): string {
  if (position === null || position === undefined) {
    return defaultPosition;
  }

  if (typeof position === "number") {
    return position.toString();
  }

  return position;
}

/**
 * Format score for display with proper sign handling
 */
export function formatScoreDisplay(
  score: number | null,
  defaultValue: string = "–",
): string {
  if (score === null || score === undefined) {
    return defaultValue;
  }

  if (score === 0) {
    return "E";
  }

  if (score > 0) {
    return `+${score}`;
  }

  return score.toString();
}

/**
 * Sort teams by their current position/score
 */
export function sortTeamsByPosition<
  T extends { position: string | null; score: number | null },
>(teams: T[]): T[] {
  return [...teams].sort((a, b) => {
    const posA = a.position;
    const posB = b.position;

    if (posA && posB && !isNaN(Number(posA)) && !isNaN(Number(posB))) {
      return Number(posA) - Number(posB);
    }

    if (posA && !posB) return -1;
    if (!posA && posB) return 1;

    const scoreA = a.score ?? 999;
    const scoreB = b.score ?? 999;
    return scoreA - scoreB;
  });
}
