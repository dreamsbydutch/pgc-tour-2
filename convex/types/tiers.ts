import type { Doc, Id } from "../_generated/dataModel";
import type {
  PaginationOptions,
  SortOptions,
  TimestampRangeFilter,
} from "./common";

export type TierFilterOptions = TimestampRangeFilter & {
  seasonId?: Id<"seasons">;
  searchTerm?: string;
  payoutsMin?: number;
  payoutsMax?: number;
  pointsMin?: number;
  pointsMax?: number;
};

export type TierSortOptions = SortOptions<
  "name" | "createdAt" | "updatedAt" | "payouts" | "points"
>;

export type TierPaginationOptions = PaginationOptions;

export type TierQueryOptions = {
  id?: Id<"tiers">;
  ids?: Id<"tiers">[];
  filter?: TierFilterOptions;
  sort?: TierSortOptions;
  pagination?: TierPaginationOptions;
};

export type TierWithSeason = Doc<"tiers"> & {
  season: Doc<"seasons">;
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
