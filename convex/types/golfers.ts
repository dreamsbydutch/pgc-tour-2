import type { Doc, Id } from "../_generated/dataModel";

export type TournamentScopeFilter = {
  tournamentId?: Id<"tournaments">;
  seasonId?: Id<"seasons">;
  activeOnly?: boolean;
};

export type GolferQueryFilter = TournamentScopeFilter & {
  apiId?: number;
};

export type GolferQueryOptions = {
  filter?: GolferQueryFilter;
};

export type TournamentGolferQueryFilter = TournamentScopeFilter & {
  golferId?: Id<"golfers">;
};

export type HydratedTournamentGolfer = Doc<"tournamentGolfers"> & {
  golfer: Doc<"golfers">;
  tournament: Doc<"tournaments">;
  season: Doc<"seasons">;
};

export type HydratedGolfer = Doc<"golfers"> & {
  tournamentGolfers: HydratedTournamentGolfer[];
  tournaments: Doc<"tournaments">[];
  seasons: Doc<"seasons">[];
};

export type GolferCreatePayload = {
  apiId: number;
  playerName: string;
  country?: string;
  worldRank?: number;
};

export type GolferUpdatePayload = {
  apiId?: number;
  playerName?: string;
  country?: string;
  worldRank?: number;
};

type TournamentGolferOptionalPayload = {
  position?: string;
  posChange?: number;
  score?: number;
  makeCut?: number;
  topTen?: number;
  win?: number;
  earnings?: number;
  today?: number;
  thru?: number;
  round?: number;
  endHole?: number;
  group?: number;
  roundOneTeeTime?: number | string;
  roundOne?: number;
  roundTwoTeeTime?: number | string;
  roundTwo?: number;
  roundThreeTeeTime?: number | string;
  roundThree?: number;
  roundFourTeeTime?: number | string;
  roundFour?: number;
  rating?: number;
  worldRank?: number;
  usage?: number;
};

export type TournamentGolferCreatePayload = TournamentGolferOptionalPayload & {
  golferId: Id<"golfers">;
  tournamentId: Id<"tournaments">;
};

export type TournamentGolferUpdatePayload = TournamentGolferOptionalPayload & {
  golferId?: Id<"golfers">;
  tournamentId?: Id<"tournaments">;
};

export type EnhancedTournamentGolferDoc = HydratedTournamentGolfer & {
  apiId?: number;
  playerName?: string;
  country?: string;
};
