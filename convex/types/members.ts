import type { Id } from "../_generated/dataModel";
import type { MemberRole } from "./authByClerkId";

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
  role?: MemberRole;
  account?: number;
  friends?: (string | Id<"members">)[];
};
