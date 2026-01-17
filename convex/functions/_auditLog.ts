/**
 * Audit Logging Utility
 *
 * Provides automatic audit trail for admin mutations.
 * Captures who did what, when, and what changed.
 */

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Audit log action types
 */
export type AuditAction = "created" | "updated" | "deleted" | "restored";

/**
 * Parameters for audit log entry
 */
export interface AuditLogParams {
  memberId?: Id<"members">;
  clerkId?: string;
  /** Entity type (e.g., "members", "tournaments", "seasons") */
  entityType: string;
  /** Entity ID */
  entityId: string;
  /** Action performed */
  action: AuditAction;
  /** Changes made (for updates) - { field: { old, new } } */
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
  /** IP address (optional) */
  ipAddress?: string;
  /** User agent (optional) */
  userAgent?: string;
}

/**
 * Log an audit entry for an admin mutation
 *
 * Silently catches and logs errors to prevent audit failures from breaking mutations.
 *
 * @example
 * await logAudit(ctx, {
 *   entityType: "tournaments",
 *   entityId: tournamentId,
 *   action: "deleted",
 *   metadata: { cascadeDelete: true, teamsDeleted: 5 }
 * });
 */
export async function logAudit(
  ctx: MutationCtx,
  params: AuditLogParams,
): Promise<void> {
  try {
    let memberId = params.memberId;

    const clerkId =
      params.clerkId ?? (await ctx.auth.getUserIdentity())?.subject;
    if (!memberId && clerkId) {
      memberId =
        (
          await ctx.db
            .query("members")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
            .first()
        )?._id ?? undefined;
    }

    if (!memberId) return;

    await ctx.db.insert("auditLogs", {
      memberId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      changes: params.changes,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  } catch (error) {
    console.error("[auditLog] Failed to write audit entry:", error);
    console.error("[auditLog] Params:", JSON.stringify(params, null, 2));
  }
}

/**
 * Compute changes between before and after states
 *
 * Returns a diff object showing what fields changed and their old/new values.
 *
 * @example
 * const changes = computeChanges(
 *   { name: "Tournament A", status: "upcoming" },
 *   { status: "active" }
 * );
 * Returns: { status: { old: "upcoming", new: "active" } }
 */
export function computeChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const [key, newValue] of Object.entries(after)) {
    const oldValue = before[key];

    if (oldValue === newValue) continue;

    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
    }

    if (
      typeof oldValue === "object" &&
      oldValue !== null &&
      typeof newValue === "object" &&
      newValue !== null
    ) {
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
    }

    changes[key] = { old: oldValue, new: newValue };
  }

  return changes;
}

/**
 * Helper to extract metadata from delete response
 */
export function extractDeleteMetadata(
  response: {
    deleted?: boolean;
    deactivated?: boolean;
    transferredCount?: number;
    cascadeDelete?: boolean;
  },
  options?: Record<string, unknown>,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  if (response.deleted) metadata.hardDeleted = true;
  if (response.deactivated) metadata.softDeleted = true;
  if (response.transferredCount !== undefined) {
    metadata.transferredCount = response.transferredCount;
  }

  if (options) {
    if (options.cascadeDelete) metadata.cascadeDelete = true;
    if (options.cleanupTeams) metadata.cleanupTeams = true;
    if (options.removeFriendships) metadata.removeFriendships = true;
    if (options.transferToMember) metadata.transferToMember = true;
    if (options.replacementGolferId) metadata.replacementGolferId = true;
  }

  return metadata;
}
