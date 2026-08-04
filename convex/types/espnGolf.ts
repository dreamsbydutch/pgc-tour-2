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

export type EspnPlayerScorecard = {
  espnAthleteId: string;
  playerName: string;
  rounds: EspnRoundScore[];
};

export type EspnGolfEvent = {
  espnEventId: string;
  eventName: string;
  startDate?: string;
  endDate?: string;
  players: EspnPlayerScorecard[];
};
