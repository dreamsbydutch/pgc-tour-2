/**
 * Authentication & Authorization Utilities
 *
 * Centralized auth helpers for Convex functions.
 * Uses Clerk authentication with role-based access control.
 */

import { MutationCtx, QueryCtx } from "./_generated/server";

type AuthContext = QueryCtx | MutationCtx;

/**
 * Get the current authenticated user's Clerk ID
 * Throws if user is not authenticated
 */
export async function requireAuth(ctx: AuthContext): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: You must be signed in");
  }
  return identity.subject; // Clerk user ID
}

/**
 * Get the current member document from the database
 * Throws if user is not authenticated or member not found
 */
export async function getCurrentMember(ctx: AuthContext) {
  const clerkId = await requireAuth(ctx);

  const member = await ctx.db
    .query("members")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();

  if (!member) {
    throw new Error(
      "Member profile not found. Please contact an administrator.",
    );
  }

  return member;
}

/**
 * Check if the current user is an admin
 * Throws if user is not authenticated or not an admin
 */
export async function requireAdmin(ctx: AuthContext): Promise<void> {
  const member = await getCurrentMember(ctx);

  if (member.role !== "admin") {
    throw new Error("Forbidden: Admin access required");
  }
}

/**
 * Check if the current user is an admin or moderator
 * Throws if user is not authenticated or lacks permissions
 */
export async function requireModerator(ctx: AuthContext): Promise<void> {
  const member = await getCurrentMember(ctx);

  if (member.role !== "admin" && member.role !== "moderator") {
    throw new Error("Forbidden: Moderator or admin access required");
  }
}

/**
 * Check if the current user is accessing their own resource
 * Returns true if user is admin (bypass), or if clerkId matches
 */
export async function canAccessResource(
  ctx: AuthContext,
  resourceClerkId: string | undefined,
): Promise<boolean> {
  const member = await getCurrentMember(ctx);

  // Admins can access anything
  if (member.role === "admin") {
    return true;
  }

  // Check if accessing own resource
  return member.clerkId === resourceClerkId;
}

/**
 * Require that user is accessing their own resource (or is admin)
 * Throws if user lacks permission
 */
export async function requireOwnResource(
  ctx: AuthContext,
  resourceClerkId: string | undefined,
): Promise<void> {
  const hasAccess = await canAccessResource(ctx, resourceClerkId);
  if (!hasAccess) {
    throw new Error("Forbidden: You can only access your own resources");
  }
}

/**
 * Check if current user is an admin (without throwing)
 */
export async function isAdmin(ctx: AuthContext): Promise<boolean> {
  try {
    const member = await getCurrentMember(ctx);
    return member.role === "admin";
  } catch {
    return false;
  }
}

/**
 * Check if current user is a moderator or admin (without throwing)
 */
export async function isModerator(ctx: AuthContext): Promise<boolean> {
  try {
    const member = await getCurrentMember(ctx);
    return member.role === "admin" || member.role === "moderator";
  } catch {
    return false;
  }
}

/**
 * Get current user's Clerk ID (returns undefined if not authenticated)
 */
export async function getAuthClerkId(
  ctx: AuthContext,
): Promise<string | undefined> {
  try {
    const identity = await ctx.auth.getUserIdentity();
    return identity?.subject;
  } catch {
    return undefined;
  }
}
