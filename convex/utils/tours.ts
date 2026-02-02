import { formatCents } from "./formatCents";
import { sumArray } from "./sumArray";
import type {
  AnalyticsResult,
  DatabaseContext,
  EnhanceOptions,
  EnhancedTourDoc,
  OptimizedQueryOptions,
  ParticipantWithMember,
  TourCardDoc,
  TourDoc,
  TourFilterOptions,
  TourSortFunction,
  TourSortOptions,
} from "../types/types";

/**
 * Get optimized tours based on query options using indexes
 */
export async function getOptimizedTours(
  ctx: DatabaseContext,
  options: OptimizedQueryOptions,
): Promise<TourDoc[]> {
  const filter = options.filter || {};

  if (filter.seasonId) {
    return await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", filter.seasonId!))
      .collect();
  }

  return await ctx.db.query("tours").collect();
}

/**
 * Apply comprehensive filters to tours
 */
export function applyFilters(
  tours: TourDoc[],
  filter: TourFilterOptions,
): TourDoc[] {
  return tours.filter((tour) => {
    if (filter.shortForm && tour.shortForm !== filter.shortForm) {
      return false;
    }

    if (filter.minBuyIn !== undefined && tour.buyIn < filter.minBuyIn) {
      return false;
    }
    if (filter.maxBuyIn !== undefined && tour.buyIn > filter.maxBuyIn) {
      return false;
    }

    if (
      filter.minParticipants !== undefined &&
      (!tour.maxParticipants || tour.maxParticipants < filter.minParticipants)
    ) {
      return false;
    }
    if (
      filter.maxParticipants !== undefined &&
      (!tour.maxParticipants || tour.maxParticipants > filter.maxParticipants)
    ) {
      return false;
    }

    if (filter.searchTerm) {
      const searchTerm = filter.searchTerm.toLowerCase();
      const searchableText = [tour.name, tour.shortForm]
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    const totalPlayoffSpots = sumArray(tour.playoffSpots);
    if (
      filter.playoffSpotsMin !== undefined &&
      totalPlayoffSpots < filter.playoffSpotsMin
    ) {
      return false;
    }
    if (
      filter.playoffSpotsMax !== undefined &&
      totalPlayoffSpots > filter.playoffSpotsMax
    ) {
      return false;
    }

    if (
      filter.createdAfter !== undefined &&
      tour._creationTime < filter.createdAfter
    ) {
      return false;
    }
    if (
      filter.createdBefore !== undefined &&
      tour._creationTime > filter.createdBefore
    ) {
      return false;
    }
    if (
      filter.updatedAfter !== undefined &&
      (tour.updatedAt || 0) < filter.updatedAfter
    ) {
      return false;
    }
    if (
      filter.updatedBefore !== undefined &&
      (tour.updatedAt || 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Get sorting function based on sort options
 */
export function getSortFunction(sort: TourSortOptions): TourSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "name":
      return (a: TourDoc, b: TourDoc) =>
        a.name.localeCompare(b.name) * sortOrder;
    case "shortForm":
      return (a: TourDoc, b: TourDoc) =>
        a.shortForm.localeCompare(b.shortForm) * sortOrder;
    case "buyIn":
      return (a: TourDoc, b: TourDoc) => (a.buyIn - b.buyIn) * sortOrder;
    case "maxParticipants":
      return (a: TourDoc, b: TourDoc) =>
        ((a.maxParticipants || 0) - (b.maxParticipants || 0)) * sortOrder;
    case "createdAt":
      return (a: TourDoc, b: TourDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: TourDoc, b: TourDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    case "playoffSpots":
      return (a: TourDoc, b: TourDoc) =>
        (sumArray(a.playoffSpots) - sumArray(b.playoffSpots)) * sortOrder;
    default:
      return undefined;
  }
}

/**
 * Enhance a single tour with related data
 */
export async function enhanceTour(
  ctx: DatabaseContext,
  tour: TourDoc,
  enhance: EnhanceOptions,
): Promise<EnhancedTourDoc> {
  const enhanced: EnhancedTourDoc = {
    ...tour,
    buyInFormatted: formatCents(tour.buyIn),
    totalPlayoffSpots: sumArray(tour.playoffSpots),
  };

  if (enhance.includeSeason) {
    const season = await ctx.db.get(tour.seasonId);
    enhanced.season = season || undefined;
  }

  if (enhance.includeTournaments) {
    const tournaments = await ctx.db.query("tournaments").collect();
    enhanced.tournaments = tournaments;
    enhanced.tournamentCount = tournaments.length;
  }

  if (enhance.includeParticipants || enhance.includeStatistics) {
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_tour", (q) => q.eq("tourId", tour._id))
      .collect();

    if (enhance.includeParticipants) {
      enhanced.participants = await Promise.all(
        tourCards.map(
          async (tc: TourCardDoc): Promise<ParticipantWithMember> => {
            const member = await ctx.db.get(tc.memberId);
            return { ...tc, member: member ?? null };
          },
        ),
      );
    }

    if (enhance.includeStatistics) {
      enhanced.statistics = {
        totalParticipants: tourCards.length,
        activeParticipants: tourCards.length,
        totalEarnings: tourCards.reduce(
          (sum: number, tc: TourCardDoc) => sum + tc.earnings,
          0,
        ),
        totalPoints: tourCards.reduce(
          (sum: number, tc: TourCardDoc) => sum + tc.points,
          0,
        ),
        averageEarnings:
          tourCards.length > 0
            ? tourCards.reduce(
                (sum: number, tc: TourCardDoc) => sum + tc.earnings,
                0,
              ) / tourCards.length
            : 0,
        averagePoints:
          tourCards.length > 0
            ? tourCards.reduce(
                (sum: number, tc: TourCardDoc) => sum + tc.points,
                0,
              ) / tourCards.length
            : 0,
      };
    }

    if (enhance.includeTourCards) {
      enhanced.tourCards = tourCards;
    }
  }

  return enhanced;
}

/**
 * Generate analytics for tours
 */
export async function generateAnalytics(
  _ctx: DatabaseContext,
  tours: TourDoc[],
): Promise<AnalyticsResult> {
  return {
    total: tours.length,
    active: tours.length,
    inactive: 0,
    statistics: {
      averageBuyIn:
        tours.length > 0
          ? tours.reduce((sum, tour) => sum + tour.buyIn, 0) / tours.length
          : 0,
      totalBuyInValue: tours.reduce((sum, tour) => sum + tour.buyIn, 0),
      averagePlayoffSpots:
        tours.length > 0
          ? tours.reduce((sum, tour) => sum + sumArray(tour.playoffSpots), 0) /
            tours.length
          : 0,
    },
    breakdown: tours.reduce(
      (acc, tour) => {
        acc[tour.shortForm] = (acc[tour.shortForm] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
}
