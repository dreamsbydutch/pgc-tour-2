import type { TournamentCourseStatsDto, TournamentHoleStatRow } from "@/types";

type AvailableCourseStats = Extract<
  TournamentCourseStatsDto,
  { status: "available" }
>;

function percentage(count: number, total: number): number {
  if (total <= 0) return 0;
  return (count / total) * 100;
}

export function buildTournamentHoleStatRows(
  stats: AvailableCourseStats,
): TournamentHoleStatRow[] {
  return stats.holes.map((hole) => {
    const playerCount = hole.total.players_thru;
    return {
      hole: hole.hole,
      par: hole.par,
      yardage: hole.yardage,
      average: hole.total.avg_score,
      relativeToPar: hole.total.avg_score - hole.par,
      underParPercent: percentage(
        hole.total.eagles_or_better + hole.total.birdies,
        playerCount,
      ),
      parPercent: percentage(hole.total.pars, playerCount),
      overParPercent: percentage(
        hole.total.bogeys + hole.total.doubles_or_worse,
        playerCount,
      ),
    };
  });
}
