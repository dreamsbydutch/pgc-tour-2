import type { AuthCtx } from "../types/functionUtils";
import type { MemberDoc } from "../types/types";

/**
 * Member roles recognized by this helper.
 *
 * These values are compared case-insensitively against `member.role` in the DB.
 */
type MemberRole = "admin" | "moderator" | "regular";

/**
 * Normalizes an unknown role value to a known {@link MemberRole}.
 *
 * @returns The normalized role (lowercased) or `null` if unrecognized.
 */
function normalizeRole(role: unknown): MemberRole | null {
  if (typeof role !== "string") return null;
  const lower = role.trim().toLowerCase();
  if (lower === "admin" || lower === "moderator" || lower === "regular") {
    return lower;
  }
  return null;
}

/**
 * Formats an allowed-role list into a user-friendly message.
 */
function formatRolesForMessage(roles: readonly MemberRole[]): string {
  if (roles.length === 1) return roles[0];
  if (roles.length === 2) return `${roles[0]} or ${roles[1]}`;
  return roles.join(", ");
}

/**
 * Looks up a member document by Clerk user ID.
 */
async function getMemberByClerkId(ctx: AuthCtx, clerkId: string) {
  return await ctx.db
    .query("members")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();
}

/**
 * Authorization helper for endpoints that accept a `clerkId` parameter.
 *
 * This helper is intentionally strict to prevent callers from accidentally acting
 * on behalf of another user.
 *
 * Rules:
 * - If the request has an auth identity and `clerkId` is provided, they must match.
 * - If the request has an auth identity and `clerkId` is omitted, identity is used.
 * - If there is no auth identity, `clerkId` must be provided.
 * - The matching member must exist and have one of `allowedRoles`.
 *
 * Failure modes (thrown as `Error`):
 * - "Unauthorized: Clerk ID mismatch" when identity and passed `clerkId` disagree
 * - "Unauthorized: You must be signed in" when neither identity nor `clerkId` exists
 * - "Member profile not found..." when there is no `members` row for the Clerk ID
 * - "Forbidden: ... access required" when role is missing/invalid/not allowed
 *
 * @param ctx - Convex context with `auth` and `db`.
 * @param clerkId - Optional Clerk user ID provided by the caller.
 * @param allowedRoles - Roles that are permitted for this operation.
 * @returns The member document for the effective Clerk ID.
 */
export async function requireRoleByClerkId(
  ctx: AuthCtx,
  clerkId: string | undefined,
  allowedRoles: readonly MemberRole[],
): Promise<MemberDoc> {
  const identity = await ctx.auth.getUserIdentity();

  if (identity && clerkId && identity.subject !== clerkId.trim()) {
    throw new Error("Unauthorized: Clerk ID mismatch");
  }

  const effectiveClerkId = (clerkId ?? identity?.subject ?? "").trim();
  if (!effectiveClerkId) {
    throw new Error("Unauthorized: You must be signed in");
  }

  const member = await getMemberByClerkId(ctx, effectiveClerkId);
  if (!member) {
    throw new Error(
      "Member profile not found. Please contact an administrator.",
    );
  }

  const role = normalizeRole(member.role);
  if (!role || !allowedRoles.includes(role)) {
    throw new Error(
      `Forbidden: ${formatRolesForMessage(allowedRoles)} access required`,
    );
  }

  return member as MemberDoc;
}

/**
 * Convenience wrapper around {@link requireRoleByClerkId} for admin-only operations.
 *
 * @throws Error if the effective user is not an admin.
 */
export async function requireAdminByClerkId(ctx: AuthCtx, clerkId?: string) {
  await requireRoleByClerkId(ctx, clerkId, ["admin"]);
}

/**
 * Convenience wrapper around {@link requireRoleByClerkId} for moderator/admin operations.
 *
 * @throws Error if the effective user is neither a moderator nor an admin.
 */
export async function requireModeratorOrAdminByClerkId(
  ctx: AuthCtx,
  clerkId?: string,
) {
  await requireRoleByClerkId(ctx, clerkId, ["admin", "moderator"]);
}
