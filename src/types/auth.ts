import type { useUser } from "@clerk/tanstack-react-start";
import type { ViewerMemberDto } from "./viewer";

export type UserRole = "admin" | "moderator" | "regular" | null;

export type UseRoleAccessReturn = {
  role: UserRole;
  isAdmin: boolean;
  isModerator: boolean;
  isRegular: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  clerkUser: ReturnType<typeof useUser>["user"];
  member: ViewerMemberDto | null | undefined;
};
