/**
 * Authentication & Authorization Utilities
 *
 * Centralized auth helpers for Convex functions.
 * Uses Clerk authentication with role-based access control.
 */

import { internal } from "../_generated/api";
import {
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { sharedArgs } from "../validators/_shared";

type AuthContext = QueryCtx | MutationCtx;

/**
 * Internal admin lookup used by action-based auth helpers that cannot access
 * the database directly.
 */
export const getIsAdminByClerkId = internalQuery({
  args: sharedArgs.clerkId,
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    return {
      ok: true,
      isAdmin: Boolean(member && member.role === "admin"),
    } as const;
  },
});

async function assertAdminForActionByClerkId(
  ctx: ActionCtx,
  effectiveClerkId: string,
): Promise<void> {
  if (!effectiveClerkId) {
    throw new Error("Unauthorized: You must be signed in");
  }

  const adminCheck = await ctx.runQuery(
    internal.utils.auth.getIsAdminByClerkId,
    { clerkId: effectiveClerkId },
  );

  if (!adminCheck.isAdmin) {
    throw new Error("Forbidden: Admin access required");
  }
}

export async function requireAdminForAction(ctx: ActionCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  await assertAdminForActionByClerkId(ctx, (identity?.subject ?? "").trim());
}

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
 * Check if the current query user is an admin.
 * Throws if user is not authenticated or not an admin.
 */
export async function requireAdminForQuery(ctx: QueryCtx): Promise<void> {
  await requireAdmin(ctx);
}

/**
 * Check if the current user is an admin or moderator
 * Throws if user is not authenticated or lacks permissions
 */
/**
 * Require that user is accessing their own resource (or is admin)
 * Throws if user lacks permission
 */
export async function requireOwnResource(
  ctx: AuthContext,
  resourceClerkId: string | undefined,
): Promise<void> {
  const member = await getCurrentMember(ctx);

  if (member.role !== "admin" && member.clerkId !== resourceClerkId) {
    throw new Error("Forbidden: You can only access your own resources");
  }
}
