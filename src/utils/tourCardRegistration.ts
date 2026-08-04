import type { EnhancedTournamentDoc } from "convex/types/types";

export function getTourCardDisplayDeadline(
  hasTourCard: boolean,
  registrationClosesAt: number | null,
  tournaments: EnhancedTournamentDoc[],
): number | null {
  if (!hasTourCard) return registrationClosesAt;

  return tournaments.reduce<number | null>((firstStart, tournament) => {
    if (tournament.status === "cancelled") return firstStart;
    return firstStart === null
      ? tournament.startDate
      : Math.min(firstStart, tournament.startDate);
  }, null);
}

export function isTourCardDisplayOpen(
  deadline: number | null,
  now: number,
): boolean {
  return deadline === null || now < deadline;
}
