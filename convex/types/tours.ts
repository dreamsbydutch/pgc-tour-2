import type { Doc, Id } from "../_generated/dataModel";
import type {
  PaginationOptions,
  SortOptions,
  TimestampRangeFilter,
} from "./common";

export type TourFilterOptions = TimestampRangeFilter & {
  seasonId?: Id<"seasons">;
  shortForm?: string;
  minBuyIn?: number;
  maxBuyIn?: number;
  minParticipants?: number;
  maxParticipants?: number;
  searchTerm?: string;
  playoffSpotsMin?: number;
  playoffSpotsMax?: number;
};

export type TourSortOptions = SortOptions<
  | "name"
  | "shortForm"
  | "buyIn"
  | "maxParticipants"
  | "createdAt"
  | "updatedAt"
  | "playoffSpots"
>;

export type TourPaginationOptions = PaginationOptions;

export type TourEnhanceOptions = {
  includeSeason?: boolean;
  includeTournaments?: boolean;
  includeParticipants?: boolean;
  includeStatistics?: boolean;
  includeTourCards?: boolean;
};

export type TourWithSeason = Doc<"tours"> & {
  season: Doc<"seasons">;
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
