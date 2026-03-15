export type SortOrder = "asc" | "desc";

export type PaginationOptions = {
  limit?: number;
  offset?: number;
};

export type TimestampRangeFilter = {
  createdAfter?: number;
  createdBefore?: number;
  updatedAfter?: number;
  updatedBefore?: number;
};

export type SortOptions<TSortBy extends string> = {
  sortBy?: TSortBy;
  sortOrder?: SortOrder;
};
