import { getTournamentTimeline } from "@/utils/app";
import type { LeagueScheduleState } from "@/types";
import type { EnhancedTournamentDoc } from "convex/types/types";

export function buildLeagueScheduleState(
  tournaments: EnhancedTournamentDoc[] | undefined,
): LeagueScheduleState {
  if (!tournaments) return { status: "loading" };

  const timeline = getTournamentTimeline(tournaments);
  const sortedTournaments = timeline.all;
  const currentTournamentIndex = timeline.current
    ? sortedTournaments.findIndex(
        (tournament) => tournament._id === timeline.current?._id,
      )
    : -1;
  const previous = timeline.past.at(-1);
  const previousTournamentIndex = previous
    ? sortedTournaments.findIndex(
        (tournament) => tournament._id === previous._id,
      )
    : -1;

  return {
    status: "ready",
    sortedTournaments,
    currentTournamentIndex,
    previousTournamentIndex,
  };
}
