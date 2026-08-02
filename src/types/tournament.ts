import type { FunctionReturnType } from "convex/server";

import type { api } from "convex/_generated/api";
import type { DataFreshness } from "./pages";

export type TournamentShellDto = FunctionReturnType<
  typeof api.functions.tournaments.getTournamentShell
>;
export type TournamentShell = NonNullable<TournamentShellDto["tournament"]>;
export type TournamentShellTour = TournamentShellDto["tours"][number];

export type TournamentLeaderboardState =
  | "live"
  | "reconnecting"
  | "final"
  | "upcoming"
  | "cancelled";

export interface ResolveTournamentLeaderboardStateArgs {
  status: TournamentShell["status"];
  startDate: number;
  endDate: number;
  freshness: DataFreshness;
  now?: number;
}
export type PgcLeaderboardDto = FunctionReturnType<
  typeof api.functions.tournaments.getPgcLeaderboard
>;
export type PgcLeaderboardTeam = PgcLeaderboardDto["teams"][number];
export type PgcLeaderboardTourCard = PgcLeaderboardDto["tourCards"][number];
export type PgaLeaderboardDto = FunctionReturnType<
  typeof api.functions.tournaments.getPgaLeaderboard
>;
export type PgaLeaderboardGolfer = PgaLeaderboardDto["golfers"][number];
export type TournamentTeamDetail = NonNullable<
  FunctionReturnType<typeof api.functions.tournaments.getTeamDetail>
>;
export type TournamentTeamDetailGolfer =
  TournamentTeamDetail["golfers"][number];
export type TournamentLeaderboardDto = FunctionReturnType<
  typeof api.functions.tournaments.getTournamentLeaderboardView
>;
export type PreTournamentDto = NonNullable<
  TournamentLeaderboardDto["tournament"]
>;
export type PreTournamentTeamDto = TournamentLeaderboardDto["teams"][number];

export type TournamentPickPoolRow = {
  golferApiId: number;
  playerName: string;
  group: number | null;
  worldRank: number | null;
  rating: number | null;
};

export interface TournamentHeaderModel {
  _id: string;
  name: string;
  startDate: number;
  endDate: number;
  logoUrl?: string;
  season?: { year: number };
  tier?: { name: string; payouts: number[]; points: number[] };
  course?: {
    name: string;
    location: string;
    par: number;
    front: number;
    back: number;
  };
}
