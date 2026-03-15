import type { SortOptions } from "./common";

export type SeasonSortOptions = SortOptions<"year" | "number">;

export type SeasonQueryOptions = {
  sort?: SeasonSortOptions;
};

export type SeasonCreatePayload = {
  year: number;
  number: number;
  startDate?: number;
  endDate?: number;
  registrationDeadline?: number;
};

export type SeasonUpdatePayload = {
  year?: number;
  number?: number;
  startDate?: number;
  endDate?: number;
  registrationDeadline?: number;
};
