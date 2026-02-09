/**
 * Tier Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation } from "../_generated/server";
import { requireAdmin } from "../utils/auth";
import { processData } from "../utils/batchProcess";
import { applyFilters, getSortFunction } from "../utils/tiers";
import {
  logAudit,
  computeChanges,
  extractDeleteMetadata,
} from "../utils/auditLog";
import type { DeleteResponse, TierDoc } from "../types/types";
import { v } from "convex/values";

/**
 * Create tiers with comprehensive options
 *
 * @example
 * Basic tier creation
 * const tier = await ctx.runMutation(api.functions.tiers.createTiers, {
 *   data: {
 *     name: "Major Championship",
 *     seasonId: "season123",
 *     payouts: [500000, 300000, 200000, 100000, 50000],
 *     points: [500, 300, 250, 200, 150]
 *   }
 * });
 *
 * With advanced options
 * const tier = await ctx.runMutation(api.functions.tiers.createTiers, {
 *   data: { ... },
 *   options: {
 *     skipValidation: false,
 *     setActive: true,
 *     returnEnhanced: true
 *   }
 * });
 */
export const createTiers = mutation({
  args: {
    data: v.object({
      name: v.string(),
      seasonId: v.id("seasons"),
      payouts: v.array(v.number()),
      points: v.array(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const data = args.data;

    const tierId = await ctx.db.insert("tiers", {
      name: data.name,
      seasonId: data.seasonId,
      payouts: data.payouts,
      points: data.points,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, {
      entityType: "tiers",
      entityId: tierId,
      action: "created",
      metadata: {
        seasonId: data.seasonId,
        name: data.name,
      },
    });

    const tier = await ctx.db.get(tierId);
    if (!tier) throw new Error("Failed to retrieve created tier");

    return tier;
  },
});

/**
 * Get tiers with comprehensive query options
 *
 * @example
 * Get single tier by ID
 * const tier = await ctx.runQuery(api.functions.tiers.getTiers, {
 *   options: { id: "tier123" }
 * });
 *
 * Get multiple tiers by IDs
 * const tiers = await ctx.runQuery(api.functions.tiers.getTiers, {
 *   options: { ids: ["tier1", "tier2", "tier3"] }
 * });
 *
 * Get tiers with filtering, sorting, and pagination
 * const result = await ctx.runQuery(api.functions.tiers.getTiers, {
 *   options: {
 *     filter: {
 *       seasonId: "season123",
 *       minPayouts: 100000,
 *       searchTerm: "Major"
 *     },
 *     sort: {
 *       sortBy: "totalPayouts",
 *       sortOrder: "desc"
 *     },
 *     pagination: {
 *       limit: 20,
 *       offset: 0
 *     },
 *     enhance: {
 *       includeSeason: true,
 *       includeTournaments: true,
 *       includeStatistics: true
 *     }
 *   }
 * });
 */
export const getTiers = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("tiers")),
        ids: v.optional(v.array(v.id("tiers"))),
        filter: v.optional(
          v.object({
            seasonId: v.optional(v.id("seasons")),
            name: v.optional(v.string()),
            minPayouts: v.optional(v.number()),
            maxPayouts: v.optional(v.number()),
            minPoints: v.optional(v.number()),
            maxPoints: v.optional(v.number()),
            searchTerm: v.optional(v.string()),
            payoutLevelsMin: v.optional(v.number()),
            payoutLevelsMax: v.optional(v.number()),
            pointLevelsMin: v.optional(v.number()),
            pointLevelsMax: v.optional(v.number()),
            createdAfter: v.optional(v.number()),
            createdBefore: v.optional(v.number()),
            updatedAfter: v.optional(v.number()),
            updatedBefore: v.optional(v.number()),
          }),
        ),
        sort: v.optional(
          v.object({
            sortBy: v.optional(
              v.union(
                v.literal("name"),
                v.literal("totalPayouts"),
                v.literal("totalPoints"),
                v.literal("createdAt"),
                v.literal("updatedAt"),
              ),
            ),
            sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.id) {
      const tier = await ctx.db.get(options.id);
      if (!tier) return null;

      return tier;
    }

    if (options.ids) {
      const tiers = await Promise.all(
        options.ids.map(async (id) => {
          const tier = await ctx.db.get(id);
          return tier;
        }),
      );
      return tiers.filter(Boolean);
    }

    let tiers = await ctx.db.query("tiers").collect();
    tiers = applyFilters(tiers, options.filter || {});
    const processedTiers = processData(tiers, {
      sort: getSortFunction(options.sort || {}),
    });

    return processedTiers;
  },
});

/**
 * Update tiers with comprehensive options
 *
 * @example
 * Basic update
 * const updatedTier = await ctx.runMutation(api.functions.tiers.updateTiers, {
 *   tierId: "tier123",
 *   data: { name: "Updated Tier Name", payouts: [600000, 400000, 250000] }
 * });
 *
 * Advanced update with options
 * const result = await ctx.runMutation(api.functions.tiers.updateTiers, {
 *   tierId: "tier123",
 *   data: { description: "Updated description" },
 *   options: {
 *     skipValidation: false,
 *     updateTimestamp: true,
 *     returnEnhanced: true,
 *     includeStatistics: true
 *   }
 * });
 */
export const updateTiers = mutation({
  args: {
    tierId: v.id("tiers"),
    data: v.object({
      name: v.optional(v.string()),
      payouts: v.optional(v.array(v.number())),
      points: v.optional(v.array(v.number())),
    }),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const tier = await ctx.db.get(args.tierId);
    if (!tier) {
      throw new Error("Tier not found");
    }

    const updateData: Partial<TierDoc> = { ...args.data };
    updateData.updatedAt = Date.now();

    await ctx.db.patch(args.tierId, updateData);

    const changes = computeChanges(tier, updateData);
    if (Object.keys(changes).length > 0) {
      await logAudit(ctx, {
        entityType: "tiers",
        entityId: args.tierId,
        action: "updated",
        changes,
      });
    }

    const updatedTier = await ctx.db.get(args.tierId);
    if (!updatedTier) throw new Error("Failed to retrieve updated tier");

    return updatedTier;
  },
});

/**
 * Delete tiers (hard delete only)
 *
 * This function always performs a hard delete (permanent removal from database).
 * The softDelete option is kept for backward compatibility but is ignored.
 *
 * @example
 * Delete tier
 * const result = await ctx.runMutation(api.functions.tiers.deleteTiers, {
 *   tierId: "tier123"
 * });
 *
 * Delete with tournament reassignment
 * const result = await ctx.runMutation(api.functions.tiers.deleteTiers, {
 *   tierId: "tier123",
 *   options: {
 *     reassignTournaments: "targetTier456"
 *   }
 * });
 */
export const deleteTiers = mutation({
  args: {
    tierId: v.id("tiers"),
    options: v.optional(
      v.object({
        softDelete: v.optional(v.boolean()),
        reassignTournaments: v.optional(v.id("tiers")),
        returnDeletedData: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<DeleteResponse<TierDoc>> => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const tier = await ctx.db.get(args.tierId);
    if (!tier) {
      throw new Error("Tier not found");
    }

    let reassignedCount = 0;
    let deletedTierData: TierDoc | undefined = undefined;

    if (options.returnDeletedData) {
      deletedTierData = tier;
    }

    if (options.reassignTournaments) {
      const targetTier = await ctx.db.get(options.reassignTournaments);
      if (!targetTier) {
        throw new Error("Target tier for tournament reassignment not found");
      }

      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_tier", (q) => q.eq("tierId", args.tierId))
        .collect();

      for (const tournament of tournaments) {
        await ctx.db.patch(tournament._id, {
          tierId: options.reassignTournaments,
          updatedAt: Date.now(),
        });
        reassignedCount++;
      }
    }

    await ctx.db.delete(args.tierId);

    await logAudit(ctx, {
      entityType: "tiers",
      entityId: args.tierId,
      action: "deleted",
      metadata: extractDeleteMetadata(
        { deleted: true, transferredCount: reassignedCount },
        options,
      ),
    });

    return {
      success: true,
      deleted: true,
      deactivated: false,
      transferredCount: reassignedCount > 0 ? reassignedCount : undefined,
      deletedData: deletedTierData,
    };
  },
});
