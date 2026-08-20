import type { Id } from "convex/_generated/dataModel";
import type { EnhancedTournamentGolferDoc } from "convex/types/types";

export type EspnHoleScore = {
  hole: number;
  strokes: number;
  relativeToPar: number;
  synthetic?: boolean;
  completion?: {
    completed: number;
    total: number;
  };
};

export type EspnRoundScore = {
  round: number;
  totalStrokes?: number;
  holes: EspnHoleScore[];
};

export type EspnHoleScorecard = {
  rounds: EspnRoundScore[];
};

export type TeamSourceScorecard = EspnHoleScorecard & {
  golferId: Id<"golfers">;
};

export type TeamAverageGolfer = Pick<
  EnhancedTournamentGolferDoc,
  | "golferId"
  | "apiId"
  | "position"
  | "today"
  | "thru"
  | "roundOne"
  | "roundTwo"
  | "roundThree"
  | "roundFour"
>;

export type BuildTeamAverageScorecardArgs = {
  teamGolfers: TeamAverageGolfer[];
  scorecards: TeamSourceScorecard[] | null | undefined;
  currentRound: number;
  tournamentCompleted: boolean;
  eventIndex?: number;
};
