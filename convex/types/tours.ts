import type { Id } from "../_generated/dataModel";

export type TourSortBy =
  | "name"
  | "shortForm"
  | "buyIn"
  | "maxParticipants"
  | "createdAt"
  | "updatedAt"
  | "playoffSpots";

export type TourSortOrder = "asc" | "desc";

export type TourFilterOptions = {
  seasonId?: Id<"seasons">;
  shortForm?: string;
  minBuyIn?: number;
  maxBuyIn?: number;
  minParticipants?: number;
  maxParticipants?: number;
  searchTerm?: string;
  playoffSpotsMin?: number;
  playoffSpotsMax?: number;
  createdAfter?: number;
  createdBefore?: number;
  updatedAfter?: number;
  updatedBefore?: number;
};

export type TourSortOptions = {
  sortBy?: TourSortBy;
  sortOrder?: TourSortOrder;
};

export type TourPaginationOptions = {
  limit?: number;
  offset?: number;
};

export type TourEnhanceOptions = {
  includeSeason?: boolean;
  includeTournaments?: boolean;
  includeParticipants?: boolean;
  includeStatistics?: boolean;
  includeTourCards?: boolean;
};

export type TourQueryOptions = {
  id?: Id<"tours">;
  ids?: Id<"tours">[];
  filter?: TourFilterOptions;
  sort?: TourSortOptions;
  pagination?: TourPaginationOptions;
  enhance?: TourEnhanceOptions;
  includeAnalytics?: boolean;
};

export type TourCreatePayload = {
  name: string;
  shortForm: string;
  logoUrl: string;
  seasonId: Id<"seasons">;
  buyIn: number;
  playoffSpots: number[];
  maxParticipants?: number;
};

export type TourUpdatePayload = {
  name?: string;
  shortForm?: string;
  logoUrl?: string;
  seasonId?: Id<"seasons">;
  buyIn?: number;
  playoffSpots?: number[];
  maxParticipants?: number;
};
