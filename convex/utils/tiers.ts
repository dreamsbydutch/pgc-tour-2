import { sumArray } from "./sumArray";
import type {
  AnalyticsResult,
  DatabaseContext,
  EnhancedTierDoc,
  TierDoc,
  TierEnhancementOptions,
  TierFilterOptions,
  TierOptimizedQueryOptions,
  TierSortFunction,
  TierSortOptions,
  TournamentDoc,
} from "../types/types";

/**
 * Get optimized tiers based on query options using indexes
 */
export async function getOptimizedTiers(
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
export function applyFilters(
  tiers: TierDoc[],
  filter: TierFilterOptions,
): TierDoc[] {
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
export function getSortFunction(sort: TierSortOptions): TierSortFunction {
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
export async function enhanceTier(
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
export async function generateAnalytics(
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
