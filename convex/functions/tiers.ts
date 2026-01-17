/**
 * Tier Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../auth";
import { processData, sumArray, validators } from "./_utils";
import { logAudit, computeChanges, extractDeleteMetadata } from "./_auditLog";
import type {
  ValidationResult,
  AnalyticsResult,
  DeleteResponse,
  TierDoc,
  EnhancedTierDoc,
  TournamentDoc,
  TierSortFunction,
  DatabaseContext,
  TierFilterOptions,
  TierOptimizedQueryOptions,
  TierEnhancementOptions,
  TierSortOptions,
} from "../types/types";

/**
 * Validate tier data
 */
function validateTierData(data: {
  name?: string;
  payouts?: number[];
  points?: number[];
  minimumParticipants?: number;
  maximumParticipants?: number;
  description?: string;
}): ValidationResult {
  const errors: string[] = [];

  const nameErr = validators.stringLength(data.name, 3, 100, "Tier name");
  if (nameErr) errors.push(nameErr);

  if (data.payouts && data.payouts.length === 0) {
    errors.push("At least one payout amount must be defined");
  }

  if (data.payouts && data.payouts.some((payout) => payout < 0)) {
    errors.push("All payout amounts must be non-negative");
  }

  if (data.points && data.points.length === 0) {
    errors.push("At least one points value must be defined");
  }

  if (data.points && data.points.some((point) => point < 0)) {
    errors.push("All points values must be non-negative");
  }

  if (
    data.payouts &&
    data.points &&
    data.payouts.length !== data.points.length
  ) {
    errors.push("Payouts and points arrays must have the same length");
  }

  if (data.minimumParticipants !== undefined && data.minimumParticipants < 1) {
    errors.push("Minimum participants must be at least 1");
  }

  if (data.maximumParticipants !== undefined && data.maximumParticipants < 1) {
    errors.push("Maximum participants must be at least 1");
  }

  if (
    data.minimumParticipants !== undefined &&
    data.maximumParticipants !== undefined &&
    data.minimumParticipants > data.maximumParticipants
  ) {
    errors.push("Minimum participants cannot exceed maximum participants");
  }

  return { isValid: errors.length === 0, errors };
}

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
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        setActive: v.optional(v.boolean()),
        returnEnhanced: v.optional(v.boolean()),
        includeStatistics: v.optional(v.boolean()),
        includeSeason: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const data = args.data;

    if (!options.skipValidation) {
      const validation = validateTierData(data);

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
            minParticipants: v.optional(v.number()),
            maxParticipants: v.optional(v.number()),
            hasDescription: v.optional(v.boolean()),
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
                v.literal("minimumParticipants"),
                v.literal("maximumParticipants"),
                v.literal("createdAt"),
                v.literal("updatedAt"),
              ),
            ),
            sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
          }),
        ),
        pagination: v.optional(
          v.object({
            limit: v.optional(v.number()),
            offset: v.optional(v.number()),
          }),
        ),
        enhance: v.optional(
          v.object({
            includeSeason: v.optional(v.boolean()),
            includeTournaments: v.optional(v.boolean()),
            includeStatistics: v.optional(v.boolean()),
          }),
        ),
        activeOnly: v.optional(v.boolean()),
        includeAnalytics: v.optional(v.boolean()),
      }),
    ),
  },
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
  args: {
    tierId: v.id("tiers"),
    data: v.object({
      name: v.optional(v.string()),
      payouts: v.optional(v.array(v.number())),
      points: v.optional(v.array(v.number())),
    }),
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        updateTimestamp: v.optional(v.boolean()),
        returnEnhanced: v.optional(v.boolean()),
        includeStatistics: v.optional(v.boolean()),
        includeSeason: v.optional(v.boolean()),
        includeTournaments: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const tier = await ctx.db.get(args.tierId);
    if (!tier) {
      throw new Error("Tier not found");
    }

    if (!options.skipValidation) {
      const validation = validateTierData(args.data);
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

/**
 * Get optimized tiers based on query options using indexes
 */
async function getOptimizedTiers(
  ctx: DatabaseContext,
  options: TierOptimizedQueryOptions,
): Promise<TierDoc[]> {
  const filter = options.filter || {};

  if (filter.seasonId) {
    return await ctx.db
      .query("tiers")
      .withIndex("by_season", (q) => q.eq("seasonId", filter.seasonId!))
      .collect();
  }

  return await ctx.db.query("tiers").collect();
}

/**
 * Apply comprehensive filters to tiers
 */
function applyFilters(tiers: TierDoc[], filter: TierFilterOptions): TierDoc[] {
  return tiers.filter((tier) => {
    if (filter.name && tier.name !== filter.name) {
      return false;
    }

    const totalPayouts = sumArray(tier.payouts);
    if (filter.minPayouts !== undefined && totalPayouts < filter.minPayouts) {
      return false;
    }
    if (filter.maxPayouts !== undefined && totalPayouts > filter.maxPayouts) {
      return false;
    }

    const totalPoints = sumArray(tier.points);
    if (filter.minPoints !== undefined && totalPoints < filter.minPoints) {
      return false;
    }
    if (filter.maxPoints !== undefined && totalPoints > filter.maxPoints) {
      return false;
    }

    if (filter.hasDescription !== undefined) {
      const hasDescription = false;
      if (hasDescription !== filter.hasDescription) {
        return false;
      }
    }

    if (filter.searchTerm) {
      const searchTerm = filter.searchTerm.toLowerCase();
      const searchableText = [tier.name].join(" ").toLowerCase();

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    if (
      filter.payoutLevelsMin !== undefined &&
      tier.payouts.length < filter.payoutLevelsMin
    ) {
      return false;
    }
    if (
      filter.payoutLevelsMax !== undefined &&
      tier.payouts.length > filter.payoutLevelsMax
    ) {
      return false;
    }

    if (
      filter.pointLevelsMin !== undefined &&
      tier.points.length < filter.pointLevelsMin
    ) {
      return false;
    }
    if (
      filter.pointLevelsMax !== undefined &&
      tier.points.length > filter.pointLevelsMax
    ) {
      return false;
    }

    if (
      filter.createdAfter !== undefined &&
      tier._creationTime < filter.createdAfter
    ) {
      return false;
    }
    if (
      filter.createdBefore !== undefined &&
      tier._creationTime > filter.createdBefore
    ) {
      return false;
    }
    if (
      filter.updatedAfter !== undefined &&
      (tier.updatedAt || 0) < filter.updatedAfter
    ) {
      return false;
    }
    if (
      filter.updatedBefore !== undefined &&
      (tier.updatedAt || 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Get sorting function based on sort options
 */
function getSortFunction(sort: TierSortOptions): TierSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "name":
      return (a: TierDoc, b: TierDoc) =>
        a.name.localeCompare(b.name) * sortOrder;
    case "totalPayouts":
      return (a: TierDoc, b: TierDoc) =>
        (sumArray(a.payouts) - sumArray(b.payouts)) * sortOrder;
    case "totalPoints":
      return (a: TierDoc, b: TierDoc) =>
        (sumArray(a.points) - sumArray(b.points)) * sortOrder;
    case "createdAt":
      return (a: TierDoc, b: TierDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: TierDoc, b: TierDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    default:
      return undefined;
  }
}

/**
 * Enhance a single tier with related data
 */
async function enhanceTier(
  ctx: DatabaseContext,
  tier: TierDoc,
  enhance: TierEnhancementOptions,
): Promise<EnhancedTierDoc> {
  const enhanced: EnhancedTierDoc = {
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
  };

  if (enhance.includeSeason) {
    const season = await ctx.db.get(tier.seasonId);
    enhanced.season = season || undefined;
  }

  if (enhance.includeTournaments || enhance.includeStatistics) {
    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_tier", (q) => q.eq("tierId", tier._id))
      .collect();

    if (enhance.includeTournaments) {
      enhanced.tournaments = tournaments;
      enhanced.tournamentCount = tournaments.length;
    }

    if (enhance.includeStatistics) {
      enhanced.statistics = {
        totalTournaments: tournaments.length,
        activeTournaments: tournaments.filter(
          (t: TournamentDoc) => t.status !== "cancelled",
        ).length,
        totalDistributedPayouts: 0,
        totalDistributedPoints: 0,
        participantCount: 0,
        averageParticipants: 0,
      };
    }
  }

  return enhanced;
}

/**
 * Generate analytics for tiers
 */
async function generateAnalytics(
  _ctx: DatabaseContext,
  tiers: TierDoc[],
): Promise<AnalyticsResult> {
  return {
    total: tiers.length,
    active: tiers.length,
    inactive: 0,
    statistics: {
      averageTotalPayouts:
        tiers.length > 0
          ? tiers.reduce((sum, tier) => sum + sumArray(tier.payouts), 0) /
            tiers.length
          : 0,
      totalPayoutValue: tiers.reduce(
        (sum, tier) => sum + sumArray(tier.payouts),
        0,
      ),
      averageTotalPoints:
        tiers.length > 0
          ? tiers.reduce((sum, tier) => sum + sumArray(tier.points), 0) /
            tiers.length
          : 0,
      totalPointsValue: tiers.reduce(
        (sum, tier) => sum + sumArray(tier.points),
        0,
      ),
      averagePayoutLevels:
        tiers.length > 0
          ? tiers.reduce((sum, tier) => sum + tier.payouts.length, 0) /
            tiers.length
          : 0,
    },
    breakdown: tiers.reduce(
      (acc, tier) => {
        const key = `${tier.payouts.length} levels`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
}
