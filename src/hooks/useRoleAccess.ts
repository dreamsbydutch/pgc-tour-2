/**
 * Role-based access control hook
 * Provides utilities for checking user roles and permissions in the UI
 */

import { useMemo } from "react";
import { useConvexAuth } from "convex/react";
import { useUser } from "@clerk/tanstack-react-start";
import { useViewerBootstrap } from "@/convex";
import type { UseRoleAccessReturn, UserRole, ViewerMemberDto } from "@/types";
export type { UserRole } from "@/types";

/**
 * Hook to check current user's role and permissions
 *
 * @example
 * ```tsx
 * const { isAdmin, isModerator, role } = useRoleAccess();
 *
 * return (
 *   <>
 *     {isAdmin && <AdminPanel />}
 *     {isModerator && <ModeratorTools />}
 *     <div>Your role: {role}</div>
 *   </>
 * );
 * ```
 */
export function useRoleAccess(): UseRoleAccessReturn {
  const { user, isLoaded: isClerkLoaded } = useUser();
  const convexAuth = useConvexAuth();

  const bootstrap = useViewerBootstrap();
  const member =
    user && convexAuth.isAuthenticated ? bootstrap?.member : undefined;

  const role = useMemo<UserRole>(() => {
    if (!member || typeof member !== "object" || Array.isArray(member))
      return null;
    if (!("role" in member) || typeof member.role !== "string") return null;

    const normalized = member.role.trim().toLowerCase();
    if (normalized === "admin") return "admin";
    if (normalized === "moderator") return "moderator";
    if (normalized === "regular") return "regular";
    return "regular";
  }, [member]);

  const isAdmin = useMemo(() => role === "admin", [role]);
  const isModerator = useMemo(
    () => role === "admin" || role === "moderator",
    [role],
  );
  const isRegular = useMemo(() => role === "regular", [role]);
  const isAuthenticated = useMemo(() => {
    if (!isClerkLoaded) return false;
    if (!user) return false;
    return convexAuth.isAuthenticated;
  }, [convexAuth.isAuthenticated, isClerkLoaded, user]);

  const isLoading = useMemo(() => {
    if (!isClerkLoaded) return true;
    if (convexAuth.isLoading) return true;
    if (user && bootstrap === undefined) return true;
    return false;
  }, [bootstrap, convexAuth.isLoading, isClerkLoaded, user]);

  return {
    role,
    isAdmin,
    isModerator,
    isRegular,
    isAuthenticated,
    isLoading: isLoading,
    clerkUser: user,
    member:
      member &&
      typeof member === "object" &&
      !Array.isArray(member) &&
      "_id" in member
        ? (member as ViewerMemberDto)
        : null,
  };
}

/**
 * Hook to check if current user can access a specific resource
 *
 * @param resourceOwnerId - The clerkId of the resource owner
 * @returns True if user is admin or owns the resource
 *
 * @example
 * ```tsx
 * const canEdit = useCanAccessResource(team.ownerClerkId);
 *
 * return (
 *   <button disabled={!canEdit}>
 *     Edit Team
 *   </button>
 * );
 * ```
 */
export function useCanAccessResource(
  resourceOwnerId: string | undefined,
): boolean {
  const { user } = useUser();
  const { isAdmin } = useRoleAccess();

  return useMemo(() => {
    if (isAdmin) return true;
    if (!user || !resourceOwnerId) return false;
    return user.id === resourceOwnerId;
  }, [isAdmin, user, resourceOwnerId]);
}
