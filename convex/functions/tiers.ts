/**
 * Tier Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation } from "../_generated/server";
import { requireAdmin } from "../auth";
import { processData } from "../utils/processData";
import { sumArray } from "../utils/sumArray";
import {
  applyFilters,
  enhanceTier,
  generateAnalytics,
  getOptimizedTiers,
  getSortFunction,
} from "../utils/tiers";
import {
  logAudit,
  computeChanges,
  extractDeleteMetadata,
} from "../utils/auditLog";
import { tiersValidators } from "../validators/tiers";
import type { DeleteResponse, TierDoc } from "../types/types";

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
  args: tiersValidators.args.createTiers,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const data = args.data;

    if (!options.skipValidation) {
      const validation = tiersValidators.validateTierData(data);

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      const existing = await ctx.db
        .query("tiers")
        .withIndex("by_name_season", (q) =>
          q.eq("name", data.name).eq("seasonId", data.seasonId),
        )
        .first();

      if (existing) {
        throw new Error("Tier with this name already exists in the season");
      }

      const season = await ctx.db.get(data.seasonId);
      if (!season) {
        throw new Error("Season not found");
      }
    }

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

    if (options.returnEnhanced) {
      return await enhanceTier(ctx, tier, {
        includeSeason: options.includeSeason,
        includeStatistics: options.includeStatistics,
      });
    }

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
  args: tiersValidators.args.getTiers,
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.id) {
      const tier = await ctx.db.get(options.id);
      if (!tier) return null;

      return await enhanceTier(ctx, tier, options.enhance || {});
    }

    if (options.ids) {
      const tiers = await Promise.all(
        options.ids.map(async (id) => {
          const tier = await ctx.db.get(id);
          return tier
            ? await enhanceTier(ctx, tier, options.enhance || {})
            : null;
        }),
      );
      return tiers.filter(Boolean);
    }

    let tiers = await getOptimizedTiers(ctx, options);

    tiers = applyFilters(tiers, options.filter || {});

    const processedTiers = processData(tiers, {
      sort: getSortFunction(options.sort || {}),
      limit: options.pagination?.limit,
      skip: options.pagination?.offset,
    });

    if (options.enhance && Object.values(options.enhance).some(Boolean)) {
      const enhancedTiers = await Promise.all(
        processedTiers.map((tier) =>
          enhanceTier(ctx, tier, options.enhance || {}),
        ),
      );

      if (options.includeAnalytics) {
        return {
          tiers: enhancedTiers,
          analytics: await generateAnalytics(ctx, tiers),
          meta: {
            total: tiers.length,
            filtered: processedTiers.length,
            offset: options.pagination?.offset || 0,
            limit: options.pagination?.limit,
          },
        };
      }

      return enhancedTiers;
    }

    const basicTiers = processedTiers.map((tier) => ({
      ...tier,
      totalPayouts: sumArray(tier.payouts),
      totalPoints: sumArray(tier.points),
      averagePayout:
        tier.payouts.length > 0
          ? sumArray(tier.payouts) / tier.payouts.length
          : 0,
      averagePoints:
        tier.points.length > 0 ? sumArray(tier.points) / tier.points.length : 0,
      payoutLevels: tier.payouts.length,
      pointLevels: tier.points.length,
    }));

    if (options.includeAnalytics) {
      return {
        tiers: basicTiers,
        analytics: await generateAnalytics(ctx, tiers),
        meta: {
          total: tiers.length,
          filtered: basicTiers.length,
          offset: options.pagination?.offset || 0,
          limit: options.pagination?.limit,
        },
      };
    }

    return basicTiers;
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
  args: tiersValidators.args.updateTiers,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const tier = await ctx.db.get(args.tierId);
    if (!tier) {
      throw new Error("Tier not found");
    }

    if (!options.skipValidation) {
      const validation = tiersValidators.validateTierData(args.data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      if (args.data.name && args.data.name !== tier.name) {
        const existingTier = await ctx.db
          .query("tiers")
          .withIndex("by_name_season", (q) =>
            q.eq("name", args.data.name!).eq("seasonId", tier.seasonId),
          )
          .first();

        if (existingTier && existingTier._id !== args.tierId) {
          throw new Error("Tier with this name already exists in the season");
        }
      }
    }

    const updateData: Partial<TierDoc> = { ...args.data };
    if (options.updateTimestamp !== false) {
      updateData.updatedAt = Date.now();
    }

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

    if (options.returnEnhanced) {
      return await enhanceTier(ctx, updatedTier, {
        includeSeason: options.includeSeason,
        includeStatistics: options.includeStatistics,
        includeTournaments: options.includeTournaments,
      });
    }

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
  args: tiersValidators.args.deleteTiers,
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
