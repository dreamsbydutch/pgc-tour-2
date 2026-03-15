import type { Id } from "../_generated/dataModel";

export type TierSortBy =
  | "name"
  | "createdAt"
  | "updatedAt"
  | "totalPayouts"
  | "totalPoints"
  | "payoutCount"
  | "pointCount";

export type TierSortOrder = "asc" | "desc";

export type TierFilterOptions = {
  seasonId?: Id<"seasons">;
  name?: string;
  searchTerm?: string;
  minTotalPayouts?: number;
  maxTotalPayouts?: number;
  minTotalPoints?: number;
  maxTotalPoints?: number;
  minPayoutCount?: number;
  maxPayoutCount?: number;
  minPointCount?: number;
  maxPointCount?: number;
  createdAfter?: number;
  createdBefore?: number;
  updatedAfter?: number;
  updatedBefore?: number;
};

export type TierSortOptions = {
  sortBy?: TierSortBy;
  sortOrder?: TierSortOrder;
};

export type TierPaginationOptions = {
  limit?: number;
  offset?: number;
};

export type TierQueryOptions = {
  id?: Id<"tiers">;
  ids?: Id<"tiers">[];
  filter?: TierFilterOptions;
  sort?: TierSortOptions;
  pagination?: TierPaginationOptions;
};

export type TierCreatePayload = {
  name: string;
  seasonId: Id<"seasons">;
  payouts: number[];
  points: number[];
};

export type TierUpdatePayload = {
  name?: string;
  seasonId?: Id<"seasons">;
  payouts?: number[];
  points?: number[];
};
