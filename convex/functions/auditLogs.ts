/**
 * Audit Logs - Basic CRUD
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../auth";

const auditActionValidator = v.union(
  v.literal("created"),
  v.literal("updated"),
  v.literal("deleted"),
  v.literal("restored"),
);

export const createAuditLogs = mutation({
  args: {
    data: v.object({
      memberId: v.optional(v.id("members")),
      clerkId: v.optional(v.string()),
      entityType: v.string(),
      entityId: v.string(),
      action: auditActionValidator,
      changes: v.optional(v.object({})),
      ipAddress: v.optional(v.string()),
      userAgent: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    let memberId = args.data.memberId;
    if (!memberId && args.data.clerkId) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.data.clerkId!))
        .first();
      memberId = member?._id ?? undefined;
    }

    if (!memberId) {
      throw new Error("createAuditLogs requires data.memberId or data.clerkId");
    }

    const auditLogId = await ctx.db.insert("auditLogs", {
      memberId,
      entityType: args.data.entityType,
      entityId: args.data.entityId,
      action: args.data.action,
      changes: args.data.changes,
      ipAddress: args.data.ipAddress,
      userAgent: args.data.userAgent,
    });
    return await ctx.db.get(auditLogId);
  },
});

/**
 * Get audit logs (WARNING: Unbounded growth table)
 *
 * @deprecated For large datasets, use getAuditLogsPage for cursor-based pagination
 * This endpoint uses .collect() and may hit scale limits as audit logs grow.
 */
export const getAuditLogs = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("auditLogs")),
        ids: v.optional(v.array(v.id("auditLogs"))),
        filter: v.optional(
          v.object({
            memberId: v.optional(v.id("members")),
            clerkId: v.optional(v.string()),
            entityType: v.optional(v.string()),
            entityId: v.optional(v.string()),
            action: v.optional(auditActionValidator),
          }),
        ),
        limit: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const options = args.options || {};

    if (options.id) {
      return await ctx.db.get(options.id);
    }

    if (options.ids) {
      const docs = await Promise.all(options.ids.map((id) => ctx.db.get(id)));
      return docs.filter(Boolean);
    }

    const filter = options.filter || {};

    let resolvedMemberId = filter.memberId;
    if (!resolvedMemberId && filter.clerkId) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", filter.clerkId!))
        .first();
      resolvedMemberId = member?._id ?? undefined;
    }

    let results;
    if (filter.entityType && filter.entityId) {
      results = await ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) =>
          q
            .eq("entityType", filter.entityType!)
            .eq("entityId", filter.entityId!),
        )
        .collect();
    } else if (resolvedMemberId) {
      results = await ctx.db
        .query("auditLogs")
        .withIndex("by_member", (q) => q.eq("memberId", resolvedMemberId!))
        .collect();
    } else if (filter.action) {
      results = await ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", filter.action!))
        .collect();
    } else {
      results = await ctx.db.query("auditLogs").collect();
    }

    if (filter.entityType) {
      results = results.filter((l) => l.entityType === filter.entityType);
    }
    if (filter.entityId) {
      results = results.filter((l) => l.entityId === filter.entityId);
    }
    if (filter.action) {
      results = results.filter((l) => l.action === filter.action);
    }
    if (resolvedMemberId) {
      results = results.filter((l) => l.memberId === resolvedMemberId);
    }

    if (options.limit !== undefined) {
      results = results.slice(0, options.limit);
    }

    return results;
  },
});

/**
 * Get audit logs with cursor-based pagination (recommended)
 *
 * Returns cursor-paginated results to handle large audit log tables efficiently.
 * Use this instead of getAuditLogs for production queries.
 *
 * @example
 * Get first 50 audit logs for a user
 * const page = await ctx.runQuery(api.functions.auditLogs.getAuditLogsPage, {
 *   paginationOpts: { numItems: 50, cursor: null },
 *   filter: { clerkId: "user_123" }
 * });
 */
export const getAuditLogsPage = query({
  args: {
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
      id: v.optional(v.number()),
    }),
    filter: v.optional(
      v.object({
        memberId: v.optional(v.id("members")),
        clerkId: v.optional(v.string()),
        entityType: v.optional(v.string()),
        entityId: v.optional(v.string()),
        action: v.optional(auditActionValidator),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const filter = args.filter || {};

    let resolvedMemberId = filter.memberId;
    if (!resolvedMemberId && filter.clerkId) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", filter.clerkId!))
        .first();
      resolvedMemberId = member?._id ?? undefined;
    }

    if (filter.entityType && filter.entityId) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) =>
          q
            .eq("entityType", filter.entityType!)
            .eq("entityId", filter.entityId!),
        )
        .paginate(args.paginationOpts);
    }

    if (resolvedMemberId) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_member", (q) => q.eq("memberId", resolvedMemberId!))
        .paginate(args.paginationOpts);
    }

    if (filter.action) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", filter.action!))
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("auditLogs")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const updateAuditLogs = mutation({
  args: {
    auditLogId: v.id("auditLogs"),
    data: v.object({
      memberId: v.optional(v.id("members")),
      entityType: v.optional(v.string()),
      entityId: v.optional(v.string()),
      action: v.optional(auditActionValidator),
      changes: v.optional(v.object({})),
      ipAddress: v.optional(v.string()),
      userAgent: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    await ctx.db.patch(args.auditLogId, args.data);
    return await ctx.db.get(args.auditLogId);
  },
});

export const deleteAuditLogs = mutation({
  args: { auditLogId: v.id("auditLogs") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existing = await ctx.db.get(args.auditLogId);
    if (!existing) return null;
    await ctx.db.delete(args.auditLogId);
    return existing;
  },
});
