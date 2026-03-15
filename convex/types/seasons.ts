export type SeasonSortBy = "year" | "number";

export type SeasonSortOrder = "asc" | "desc";

export type SeasonSortOptions = {
  sortBy?: SeasonSortBy;
  sortOrder?: SeasonSortOrder;
};

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
