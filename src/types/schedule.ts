import type { EnhancedTournamentDoc } from "convex/types/types";

export type LeagueScheduleState =
  | { status: "loading" }
  | {
      status: "ready";
      sortedTournaments: EnhancedTournamentDoc[];
      currentTournamentIndex: number;
      previousTournamentIndex: number;
    };
