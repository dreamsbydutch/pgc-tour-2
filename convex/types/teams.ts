import type { GolferDoc } from "./types";

export type ValidateTeamDataInput = {
  golferIds?: number[];
  earnings?: number;
  points?: number;
  score?: number;
  round?: number;
  position?: string;
};

export type TeamGolferWithTournamentFields = Omit<GolferDoc, "worldRank"> & {
  worldRank: number | null;
  group: number | null;
  rating: number | null;
};
