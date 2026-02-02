import { dateUtils } from "./dateUtils";
import type {
  AnalyticsResult,
  DatabaseContext,
  EnhancedSeasonDoc,
  MemberDoc,
  SeasonDoc,
  SeasonEnhancementOptions,
  SeasonFilterOptions,
  SeasonOptimizedQueryOptions,
  SeasonSortFunction,
  SeasonSortOptions,
} from "../types/types";

/**
 * Calculate season duration in days
 */
export function calculateSeasonDuration(
  startDate?: number,
  endDate?: number,
): number {
  if (!startDate || !endDate) return 0;
  return dateUtils.daysBetween(startDate, endDate);
}

/**
 * Calculate days remaining in season
 */
export function calculateDaysRemaining(endDate?: number): number {
  if (!endDate) return 0;
  const now = Date.now();
  if (endDate < now) return 0;
  return dateUtils.daysUntil(endDate);
}

/**
 * Determine season status
 */
export function getSeasonStatus(
  startDate?: number,
  endDate?: number,
): {
  isUpcoming: boolean;
  isInProgress: boolean;
  isCompleted: boolean;
} {
  const now = Date.now();

  if (!startDate || !endDate) {
    return { isUpcoming: false, isInProgress: false, isCompleted: false };
  }

  if (now < startDate) {
    return { isUpcoming: true, isInProgress: false, isCompleted: false };
  } else if (now >= startDate && now <= endDate) {
    return { isUpcoming: false, isInProgress: true, isCompleted: false };
  } else {
    return { isUpcoming: false, isInProgress: false, isCompleted: true };
  }
}

/**
 * Get optimized seasons based on query options using indexes
 */
export async function getOptimizedSeasons(
  ctx: DatabaseContext,
  options: SeasonOptimizedQueryOptions,
): Promise<SeasonDoc[]> {
  const filter = options.filter || {};

  if (filter.year && filter.number) {
    const sameYear = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", filter.year!))
      .collect();
    return sameYear.filter((s) => s.number === filter.number);
  }

  if (filter.year) {
    return await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", filter.year!))
      .collect();
  }

  return await ctx.db.query("seasons").collect();
}

/**
 * Apply comprehensive filters to seasons
 */
export function applyFilters(
  seasons: SeasonDoc[],
  filter: SeasonFilterOptions,
): SeasonDoc[] {
  return seasons.filter((season) => {
    if (filter.minYear !== undefined && season.year < filter.minYear) {
      return false;
    }
    if (filter.maxYear !== undefined && season.year > filter.maxYear) {
      return false;
    }

    if (filter.number !== undefined && season.number !== filter.number) {
      return false;
    }

    if (
      filter.startAfter !== undefined &&
      (!season.startDate || season.startDate < filter.startAfter)
    ) {
      return false;
    }
    if (
      filter.startBefore !== undefined &&
      (!season.startDate || season.startDate > filter.startBefore)
    ) {
      return false;
    }
    if (
      filter.endAfter !== undefined &&
      (!season.endDate || season.endDate < filter.endAfter)
    ) {
      return false;
    }
    if (
      filter.endBefore !== undefined &&
      (!season.endDate || season.endDate > filter.endBefore)
    ) {
      return false;
    }

    if (filter.isUpcoming !== undefined || filter.isCompleted !== undefined) {
      const status = getSeasonStatus(season.startDate, season.endDate);
      if (
        filter.isUpcoming !== undefined &&
        status.isUpcoming !== filter.isUpcoming
      ) {
        return false;
      }
      if (
        filter.isCompleted !== undefined &&
        status.isCompleted !== filter.isCompleted
      ) {
        return false;
      }
    }

    if (
      filter.createdAfter !== undefined &&
      season._creationTime < filter.createdAfter
    ) {
      return false;
    }
    if (
      filter.createdBefore !== undefined &&
      season._creationTime > filter.createdBefore
    ) {
      return false;
    }
    if (
      filter.updatedAfter !== undefined &&
      (season.updatedAt || 0) < filter.updatedAfter
    ) {
      return false;
    }
    if (
      filter.updatedBefore !== undefined &&
      (season.updatedAt || 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Get sorting function based on sort options
 */
export function getSortFunction(sort: SeasonSortOptions): SeasonSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "desc" ? -1 : 1;

  switch (sort.sortBy) {
    case "year":
      return (a: SeasonDoc, b: SeasonDoc) => (a.year - b.year) * sortOrder;
    case "startDate":
      return (a: SeasonDoc, b: SeasonDoc) =>
        ((a.startDate || 0) - (b.startDate || 0)) * sortOrder;
    case "endDate":
      return (a: SeasonDoc, b: SeasonDoc) =>
        ((a.endDate || 0) - (b.endDate || 0)) * sortOrder;
    case "createdAt":
      return (a: SeasonDoc, b: SeasonDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: SeasonDoc, b: SeasonDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    default:
      return undefined;
  }
}

/**
 * Enhance a single season with related data
 */
export async function enhanceSeason(
  ctx: DatabaseContext,
  season: SeasonDoc,
  enhance: SeasonEnhancementOptions,
): Promise<EnhancedSeasonDoc> {
  const status = getSeasonStatus(season.startDate, season.endDate);

  const enhanced: EnhancedSeasonDoc = {
    ...season,
    duration: calculateSeasonDuration(season.startDate, season.endDate),
    daysRemaining: calculateDaysRemaining(season.endDate),
    ...status,
  };

  if (enhance.includeTours || enhance.includeStatistics) {
    const tours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    if (enhance.includeTours) {
      enhanced.tours = tours;
    }

    if (enhance.includeStatistics) {
      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .collect();

      const tourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .collect();

      const uniqueMemberIds = new Set(
        tourCards.map((tc) => tc.memberId).filter(Boolean) as string[],
      );

      enhanced.statistics = {
        totalTours: tours.length,
        activeTours: tours.length,
        totalTournaments: tournaments.length,
        activeTournaments: tournaments.filter((t) => t.status !== "cancelled")
          .length,
        totalMembers: uniqueMemberIds.size,
        activeMembers: uniqueMemberIds.size,
        totalEarnings: tourCards.reduce((sum, tc) => sum + tc.earnings, 0),
        totalPoints: tourCards.reduce((sum, tc) => sum + tc.points, 0),
      };
    }
  }

  if (enhance.includeTournaments) {
    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();
    enhanced.tournaments = tournaments;
  }

  if (enhance.includeMembers) {
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    const uniqueMemberIds = new Set(
      tourCards.map((tc) => tc.memberId).filter(Boolean) as string[],
    );

    const members = await Promise.all(
      Array.from(uniqueMemberIds).map(async (clerkId) => {
        return await ctx.db
          .query("members")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
          .first();
      }),
    );

    enhanced.members = members.filter((m): m is MemberDoc => m !== null);
  }

  return enhanced;
}

/**
 * Generate analytics for seasons
 */
export async function generateAnalytics(
  _ctx: DatabaseContext,
  seasons: SeasonDoc[],
): Promise<AnalyticsResult> {
  const currentYear = new Date().getFullYear();
  const active = seasons.filter((season) => season.year === currentYear).length;

  return {
    total: seasons.length,
    active,
    inactive: seasons.length - active,
    statistics: {
      averageYear:
        seasons.length > 0
          ? seasons.reduce((sum, season) => sum + season.year, 0) /
            seasons.length
          : currentYear,
      currentYearCount: seasons.filter((season) => season.year === currentYear)
        .length,
      futureYearCount: seasons.filter((season) => season.year > currentYear)
        .length,
      pastYearCount: seasons.filter((season) => season.year < currentYear)
        .length,
    },
    breakdown: seasons.reduce(
      (acc, season) => {
        const key = `${season.year}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
}
