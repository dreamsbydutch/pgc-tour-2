import type { Doc } from "../_generated/dataModel";
import type { PaginationOptions, SortOptions } from "./common";

export type MemberSortOptions = SortOptions<
  "firstname" | "lastname" | "email" | "account"
>;

export type MemberQueryOptions = {
  clerkId?: string;
  activeOnly?: boolean;
  sort?: MemberSortOptions;
  pagination?: PaginationOptions;
};

export type EnhancedMemberDoc = Doc<"members">;
