import type { Id } from "../_generated/dataModel";

export type ClerkEmail = {
  email_address?: string;
};

export type ClerkUser = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email_addresses?: ClerkEmail[];
};

export type ClerkUserRow = {
  clerkId: string;
  email: string | null;
  fullName: string;
};

export type FetchClerkUsersOptions = {
  limit: number;
  offset: number;
};

export type ValidateMemberDataInput = {
  clerkId?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  displayName?: string;
  isActive?: boolean;
  role?: "admin" | "moderator" | "regular";
  account?: number;
  friends?: (string | Id<"members">)[];
};


export type MembersWhereOp =
  | "eq"
  | "neq"
  | "in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "includes"
  | "exists";

export type MembersWhereValue = string | number | boolean | null;

export type MembersWhereCondition = {
  field: string;
  op?: MembersWhereOp;
  value?: MembersWhereValue;
  values?: MembersWhereValue[];
  caseInsensitive?: boolean;
};

export type MembersOrderBy = {
  field: string;
  direction?: "asc" | "desc";
  nulls?: "first" | "last";
  caseInsensitive?: boolean;
};