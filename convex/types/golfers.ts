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

export type ValidateGolferDataInput = Partial<
  Pick<Doc<"golfers">, "apiId" | "playerName" | "country" | "worldRank">
>;
