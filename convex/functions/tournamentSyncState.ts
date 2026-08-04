import {
  internalMutation,
  internalQuery,
  mutation,
} from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";

import { requireAdmin } from "../utils/auth";

const markerValidator = v.optional(v.union(v.string(), v.number()));

export const get = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) =>
    await ctx.db
      .query("tournamentSyncState")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .unique(),
});

export const recordAttempt = internalMutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("tournamentSyncState")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastAttemptAt: now, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("tournamentSyncState", {
      tournamentId: args.tournamentId,
      lastAttemptAt: now,
      failureCount: 0,
      updatedAt: now,
    });
  },
});

export const recordSuccess = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    dataGolfInPlayLastUpdate: markerValidator,
    leaderboardLastUpdatedAt: v.optional(v.number()),
    finalDataComplete: v.optional(v.boolean()),
    skipReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("tournamentSyncState")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .unique();
    const value = {
      dataGolfInPlayLastUpdate: args.dataGolfInPlayLastUpdate,
      leaderboardLastUpdatedAt:
        args.leaderboardLastUpdatedAt ?? existing?.leaderboardLastUpdatedAt,
      finalDataComplete: args.finalDataComplete ?? existing?.finalDataComplete,
      lastAttemptAt: now,
      lastSuccessAt: now,
      failureCount: 0,
      skipReason: args.skipReason,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("tournamentSyncState", {
      tournamentId: args.tournamentId,
      ...value,
    });
  },
});

export const recordUnchangedSuccess = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    dataGolfInPlayLastUpdate: markerValidator,
    coalesceWithinMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("tournamentSyncState")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .unique();
    const hasRecentHealthyHeartbeat =
      existing?.lastSuccessAt !== undefined &&
      existing.dataGolfInPlayLastUpdate === args.dataGolfInPlayLastUpdate &&
      (existing.failureCount ?? 0) === 0 &&
      now - existing.lastSuccessAt < Math.max(args.coalesceWithinMs, 0);

    if (existing && hasRecentHealthyHeartbeat) {
      return { id: existing._id, persisted: false as const };
    }

    const value = {
      dataGolfInPlayLastUpdate: args.dataGolfInPlayLastUpdate,
      lastAttemptAt: now,
      lastSuccessAt: now,
      failureCount: 0,
      skipReason: "data_golf_unchanged",
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return { id: existing._id, persisted: true as const };
    }
    const id = await ctx.db.insert("tournamentSyncState", {
      tournamentId: args.tournamentId,
      ...value,
    });
    return { id, persisted: true as const };
  },
});

export const recordFailure = internalMutation({
  args: { tournamentId: v.id("tournaments"), error: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("tournamentSyncState")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .unique();
    if (existing) {
      const failureCount = (existing.failureCount ?? 0) + 1;
      await ctx.db.patch(existing._id, {
        failureCount,
        skipReason: args.error.slice(0, 500),
        lastAttemptAt: now,
        updatedAt: now,
      });
      return failureCount;
    }
    await ctx.db.insert("tournamentSyncState", {
      tournamentId: args.tournamentId,
      failureCount: 1,
      skipReason: args.error.slice(0, 500),
      lastAttemptAt: now,
      updatedAt: now,
    });
    return 1;
  },
});

const paginatedMigrationArgs = {
  cursor: v.optional(v.union(v.string(), v.null())),
  limit: v.optional(v.number()),
};

async function migrateLegacyPage(
  ctx: MutationCtx,
  args: { cursor?: string | null; limit?: number },
) {
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 250);
  const page = await ctx.db.query("tournaments").paginate({
    cursor: args.cursor ?? null,
    numItems: limit,
    maximumRowsRead: limit,
    maximumBytesRead: 2_000_000,
  });
  let changed = 0;
  for (const tournament of page.page) {
    const existing = await ctx.db
      .query("tournamentSyncState")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .unique();
    if (existing) continue;
    await ctx.db.insert("tournamentSyncState", {
      tournamentId: tournament._id,
      dataGolfInPlayLastUpdate: tournament.dataGolfInPlayLastUpdate,
      leaderboardLastUpdatedAt: tournament.leaderboardLastUpdatedAt,
      // Force one final historical refresh before suppressing those calls.
      finalDataComplete: false,
      failureCount: 0,
      updatedAt: Date.now(),
    });
    changed += 1;
  }
  return {
    processed: page.page.length,
    changed,
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  };
}

export const adminMigrateLegacy = mutation({
  args: paginatedMigrationArgs,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await migrateLegacyPage(ctx, args);
  },
});

/** Deployment-credential entry point for release-time sync-state migration. */
export const migrateLegacyPageInternal = internalMutation({
  args: paginatedMigrationArgs,
  handler: migrateLegacyPage,
});

async function clearMigratedLegacyPage(
  ctx: MutationCtx,
  args: { cursor?: string | null; limit?: number },
) {
  const limit = Math.min(Math.max(args.limit ?? 100, 1), 250);
  const page = await ctx.db.query("tournaments").paginate({
    cursor: args.cursor ?? null,
    numItems: limit,
    maximumRowsRead: limit,
    maximumBytesRead: 2_000_000,
  });
  let changed = 0;
  for (const tournament of page.page) {
    if (
      tournament.dataGolfInPlayLastUpdate === undefined &&
      tournament.leaderboardLastUpdatedAt === undefined
    ) {
      continue;
    }
    const migrated = await ctx.db
      .query("tournamentSyncState")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .unique();
    if (!migrated) continue;
    await ctx.db.patch(tournament._id, {
      dataGolfInPlayLastUpdate: undefined,
      leaderboardLastUpdatedAt: undefined,
    });
    changed += 1;
  }
  return {
    processed: page.page.length,
    changed,
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  };
}

export const adminClearMigratedLegacy = mutation({
  args: paginatedMigrationArgs,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await clearMigratedLegacyPage(ctx, args);
  },
});

/** Clears legacy fields only after their normalized rows exist. */
export const clearMigratedLegacyPageInternal = internalMutation({
  args: paginatedMigrationArgs,
  handler: clearMigratedLegacyPage,
});
