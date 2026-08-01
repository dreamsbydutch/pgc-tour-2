import type { Id } from "convex/_generated/dataModel";

export type EspnHoleScore = {
  hole: number;
  strokes: number;
  relativeToPar: number;
  synthetic?: boolean;
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
