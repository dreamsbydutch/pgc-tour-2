/**
 * Role-based access control hook
 * Provides utilities for checking user roles and permissions in the UI
 */

import { useEffect, useMemo, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useUser } from "@clerk/tanstack-react-start";
import { api } from "@/convex";
import type { MemberDoc } from "../../convex/types/types";
import { useViewerBootstrap } from "@/convex";

export type UserRole = "admin" | "moderator" | "regular" | null;

export interface UseRoleAccessReturn {
  /** Current user's role */
  role: UserRole;
  /** True if user is an admin */
  isAdmin: boolean;
  /** True if user is a moderator or admin */
  isModerator: boolean;
  /** True if user is a regular user (not admin/moderator) */
  isRegular: boolean;
  /** True if user is authenticated */
  isAuthenticated: boolean;
  /** True if role data is loading */
  isLoading: boolean;
  /** Clerk user object (if signed in) */
  clerkUser: ReturnType<typeof useUser>["user"];
  /** Current member data */
  member: MemberDoc | null | undefined;
}

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

  const ensureMember = useMutation(api.functions.members.ensureCurrentMember);
  const ensuredOnceRef = useRef(false);

  const bootstrap = useViewerBootstrap();
  const member =
    user && convexAuth.isAuthenticated ? bootstrap?.member : undefined;

  useEffect(() => {
    if (!isClerkLoaded) return;
    if (!user) return;
    if (!convexAuth.isAuthenticated) return;
    if (ensuredOnceRef.current) return;

    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;

    ensuredOnceRef.current = true;
    void ensureMember({
      profile: {
        email,
        firstname: user.firstName ?? undefined,
        lastname: user.lastName ?? undefined,
      },
    }).catch(() => {
      ensuredOnceRef.current = false;
    });
  }, [ensureMember, convexAuth.isAuthenticated, isClerkLoaded, user]);

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
        ? (member as MemberDoc)
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
