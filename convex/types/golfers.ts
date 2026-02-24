export type UpsertResult = {
  total: number;
  inserted: number;
  updated: number;
  dryRun: boolean;
};

export type SyncResult = {
  fetched: number;
  upserted: UpsertResult;
};

export type NormalizeNamesResult = {
  scanned: number;
  changed: number;
};

export type DedupeResult = {
  scanned: number;
  duplicateGroups: number;
  kept: number;
  removed: number;
  updatedTournamentGolfers: number;
  updatedTeams: number;
};

import type { Doc } from "../_generated/dataModel";
import {
  DataGolfFieldPlayer,
  DataGolfHistoricalPlayer,
  DataGolfLiveModelPlayer,
  DataGolfRankedPlayer,
} from "./datagolf";

export type ValidateGolferDataInput = Partial<
  Pick<Doc<"golfers">, "apiId" | "playerName" | "country" | "worldRank">
>;

export type EnhancedGolfer = {
  field?: DataGolfFieldPlayer;
  ranking?: DataGolfRankedPlayer;
  live?: DataGolfLiveModelPlayer;
  historical?: DataGolfHistoricalPlayer;
  tournamentGolfer?: Doc<"tournamentGolfers">;
  golfer?: Doc<"golfers">;
};

export type BuildUsageRateByGolferApiIdOptions = {
  teams: {
    golferIds: number[];
  }[];
};

export type GroupLimits = {
  GROUP_1: { percentage: number; maxCount: number };
  GROUP_2: { percentage: number; maxCount: number };
  GROUP_3: { percentage: number; maxCount: number };
  GROUP_4: { percentage: number; maxCount: number };
};
