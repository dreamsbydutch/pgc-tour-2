/**
 * Tour Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../auth";
import { processData, formatCents, sumArray, validators } from "./_utils";
import { logAudit, computeChanges, extractDeleteMetadata } from "./_auditLog";
import type {
  ValidationResult,
  AnalyticsResult,
  DeleteResponse,
  TourDoc,
  EnhancedTourDoc,
  TourCardDoc,
  TourSortFunction,
  DatabaseContext,
  TourFilterOptions,
  OptimizedQueryOptions,
  EnhanceOptions,
  TourSortOptions,
  ParticipantWithMember,
} from "../types/types";

/**
 * Validate tour data
 */
function validateTourData(data: {
  name?: string;
  shortForm?: string;
  buyIn?: number;
  maxParticipants?: number;
  playoffSpots?: number[];
  logoUrl?: string;
}): ValidationResult {
  const errors: string[] = [];

  const nameErr = validators.stringLength(data.name, 3, 100, "Tour name");
  if (nameErr) errors.push(nameErr);

  const shortFormErr = validators.stringLength(
    data.shortForm,
    2,
    10,
    "Short form",
  );
  if (shortFormErr) errors.push(shortFormErr);

  const buyInErr = validators.positiveNumber(data.buyIn, "Buy-in amount");
  if (buyInErr) errors.push(buyInErr);

  if (data.maxParticipants !== undefined && data.maxParticipants < 1) {
    errors.push("Maximum participants must be at least 1");
  }

  if (data.playoffSpots && data.playoffSpots.length === 0) {
    errors.push("At least one playoff spot must be defined");
  }

  if (data.playoffSpots && data.playoffSpots.some((spot) => spot < 1)) {
    errors.push("All playoff spots must be positive numbers");
  }

  const logoUrlErr = validators.url(data.logoUrl, "Logo URL");
  if (logoUrlErr) errors.push(logoUrlErr);

  return { isValid: errors.length === 0, errors };
}

/**
 * Create tours with comprehensive options
 *
 * @example
 * Basic tour creation
 * const tour = await ctx.runMutation(api.functions.tours.createTours, {
 *   data: {
 *     name: "PGA Tour 2025 Spring",
 *     shortForm: "PGA",
 *     logoUrl: "https://example.com/logo.png",
 *     seasonId: "season123",
 *     buyIn: 10000,
 *     playoffSpots: [8, 4, 2]
 *   }
 * });
 *
 * With advanced options
 * const tour = await ctx.runMutation(api.functions.tours.createTours, {
 *   data: { ... },
 *   options: {
 *     skipValidation: false,
 *     setActive: true,
 *     autoCreateTourCards: true,
 *     returnEnhanced: true
 *   }
 * });
 */
export const createTours = mutation({
  args: {
    data: v.object({
      name: v.string(),
      shortForm: v.string(),
      logoUrl: v.string(),
      seasonId: v.id("seasons"),
      buyIn: v.number(),
      playoffSpots: v.array(v.number()),
      maxParticipants: v.optional(v.number()),
    }),
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        setActive: v.optional(v.boolean()),
        autoCreateTourCards: v.optional(v.boolean()),
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
      const validation = validateTourData(data);

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      const existing = await ctx.db
        .query("tours")
        .withIndex("by_name_season", (q) =>
          q.eq("name", data.name).eq("seasonId", data.seasonId),
        )
        .first();

      if (existing) {
        throw new Error("Tour with this name already exists in the season");
      }

      const season = await ctx.db.get(data.seasonId);
      if (!season) {
        throw new Error("Season not found");
      }
    }

    const tourId = await ctx.db.insert("tours", {
      name: data.name,
      shortForm: data.shortForm,
      logoUrl: data.logoUrl,
      seasonId: data.seasonId,
      buyIn: data.buyIn,
      playoffSpots: data.playoffSpots,
      maxParticipants: data.maxParticipants,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, {
      entityType: "tours",
      entityId: tourId,
      action: "created",
      metadata: {
        seasonId: data.seasonId,
        name: data.name,
      },
    });

    if (options.autoCreateTourCards) {
      const members = await ctx.db.query("members").collect();
      for (const member of members) {
        await ctx.db.insert("tourCards", {
          memberId: member._id,
          displayName:
            `${member.firstname || ""} ${member.lastname || ""}`.trim() ||
            member.email.split("@")[0],
          tourId,
          seasonId: data.seasonId,
          earnings: 0,
          points: 0,
          topTen: 0,
          madeCut: 0,
          appearances: 0,
          updatedAt: Date.now(),
        });
      }
    }

    const tour = await ctx.db.get(tourId);
    if (!tour) throw new Error("Failed to retrieve created tour");

    if (options.returnEnhanced) {
      return await enhanceTour(ctx, tour, {
        includeSeason: options.includeSeason,
        includeStatistics: options.includeStatistics,
      });
    }

    return tour;
  },
});

/**
 * Get tours with comprehensive query options
 *
 * @example
 * Get single tour by ID
 * const tour = await ctx.runQuery(api.functions.tours.getTours, {
 *   options: { id: "tour123" }
 * });
 *
 * Get multiple tours by IDs
 * const tours = await ctx.runQuery(api.functions.tours.getTours, {
 *   options: { ids: ["tour1", "tour2", "tour3"] }
 * });
 *
 * Get tours with filtering, sorting, and pagination
 * const result = await ctx.runQuery(api.functions.tours.getTours, {
 *   options: {
 *     filter: {
 *       seasonId: "season123",
 *       minBuyIn: 5000,
 *       searchTerm: "PGA"
 *     },
 *     sort: {
 *       sortBy: "buyIn",
 *       sortOrder: "desc"
 *     },
 *     pagination: {
 *       limit: 20,
 *       offset: 0
 *     },
 *     enhance: {
 *       includeSeason: true,
 *       includeParticipants: true,
 *       includeStatistics: true
 *     }
 *   }
 * });
 */
export const getTours = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("tours")),
        ids: v.optional(v.array(v.id("tours"))),
        filter: v.optional(
          v.object({
            seasonId: v.optional(v.id("seasons")),
            shortForm: v.optional(v.string()),
            minBuyIn: v.optional(v.number()),
            maxBuyIn: v.optional(v.number()),
            minParticipants: v.optional(v.number()),
            maxParticipants: v.optional(v.number()),
            hasDescription: v.optional(v.boolean()),
            searchTerm: v.optional(v.string()),
            playoffSpotsMin: v.optional(v.number()),
            playoffSpotsMax: v.optional(v.number()),
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
                v.literal("shortForm"),
                v.literal("buyIn"),
                v.literal("maxParticipants"),
                v.literal("createdAt"),
                v.literal("updatedAt"),
                v.literal("playoffSpots"),
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
            includeParticipants: v.optional(v.boolean()),
            includeStatistics: v.optional(v.boolean()),
            includeTourCards: v.optional(v.boolean()),
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
      const tour = await ctx.db.get(options.id);
      if (!tour) return null;

      return await enhanceTour(ctx, tour, options.enhance || {});
    }

    if (options.ids) {
      const tours = await Promise.all(
        options.ids.map(async (id) => {
          const tour = await ctx.db.get(id);
          return tour
            ? await enhanceTour(ctx, tour, options.enhance || {})
            : null;
        }),
      );
      return tours.filter(Boolean);
    }

    let tours = await getOptimizedTours(ctx, options);

    tours = applyFilters(tours, options.filter || {});

    const processedTours = processData(tours, {
      sort: getSortFunction(options.sort || {}),
      limit: options.pagination?.limit,
      skip: options.pagination?.offset,
    });

    if (options.enhance && Object.values(options.enhance).some(Boolean)) {
      const enhancedTours = await Promise.all(
        processedTours.map((tour) =>
          enhanceTour(ctx, tour, options.enhance || {}),
        ),
      );

      if (options.includeAnalytics) {
        return {
          tours: enhancedTours,
          analytics: await generateAnalytics(ctx, tours),
          meta: {
            total: tours.length,
            filtered: processedTours.length,
            offset: options.pagination?.offset || 0,
            limit: options.pagination?.limit,
          },
        };
      }

      return enhancedTours;
    }

    const basicTours = processedTours.map((tour) => ({
      ...tour,
      buyInFormatted: formatCents(tour.buyIn),
      totalPlayoffSpots: sumArray(tour.playoffSpots),
    }));

    if (options.includeAnalytics) {
      return {
        tours: basicTours,
        analytics: await generateAnalytics(ctx, tours),
        meta: {
          total: tours.length,
          filtered: basicTours.length,
          offset: options.pagination?.offset || 0,
          limit: options.pagination?.limit,
        },
      };
    }

    return basicTours;
  },
});

/**
 * Update tours with comprehensive options
 *
 * @example
 * Basic update
 * const updatedTour = await ctx.runMutation(api.functions.tours.updateTours, {
 *   tourId: "tour123",
 *   data: { name: "Updated Tour Name", buyIn: 15000 }
 * });
 *
 * Advanced update with options
 * const result = await ctx.runMutation(api.functions.tours.updateTours, {
 *   tourId: "tour123",
 *   data: { buyIn: 20000 },
 *   options: {
 *     skipValidation: false,
 *     updateTimestamp: true,
 *     cascadeToTourCards: true,
 *     returnEnhanced: true,
 *     includeStatistics: true
 *   }
 * });
 */
export const updateTours = mutation({
  args: {
    tourId: v.id("tours"),
    data: v.object({
      name: v.optional(v.string()),
      shortForm: v.optional(v.string()),
      logoUrl: v.optional(v.string()),
      buyIn: v.optional(v.number()),
      playoffSpots: v.optional(v.array(v.number())),
      maxParticipants: v.optional(v.number()),
    }),
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        updateTimestamp: v.optional(v.boolean()),
        cascadeToTourCards: v.optional(v.boolean()),
        returnEnhanced: v.optional(v.boolean()),
        includeStatistics: v.optional(v.boolean()),
        includeSeason: v.optional(v.boolean()),
        includeParticipants: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const tour = await ctx.db.get(args.tourId);
    if (!tour) {
      throw new Error("Tour not found");
    }

    if (!options.skipValidation) {
      const validation = validateTourData(args.data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      if (args.data.name && args.data.name !== tour.name) {
        const existingTour = await ctx.db
          .query("tours")
          .withIndex("by_name_season", (q) =>
            q.eq("name", args.data.name!).eq("seasonId", tour.seasonId),
          )
          .first();

        if (existingTour && existingTour._id !== args.tourId) {
          throw new Error("Tour with this name already exists in the season");
        }
      }
    }

    const updateData: Partial<TourDoc> = { ...args.data };
    if (options.updateTimestamp !== false) {
      updateData.updatedAt = Date.now();
    }

    await ctx.db.patch(args.tourId, updateData);

    const changes = computeChanges(tour, updateData);
    if (Object.keys(changes).length > 0) {
      await logAudit(ctx, {
        entityType: "tours",
        entityId: args.tourId,
        action: "updated",
        changes,
      });
    }

    const updatedTour = await ctx.db.get(args.tourId);
    if (!updatedTour) throw new Error("Failed to retrieve updated tour");

    if (options.returnEnhanced) {
      return await enhanceTour(ctx, updatedTour, {
        includeSeason: options.includeSeason,
        includeStatistics: options.includeStatistics,
        includeParticipants: options.includeParticipants,
      });
    }

    return updatedTour;
  },
});

/**
 * Delete tours (hard delete only)
 *
 * This function always performs a hard delete (permanent removal from database).
 * The softDelete option is kept for backward compatibility but is ignored.
 *
 * @example
 * Delete tour
 * const result = await ctx.runMutation(api.functions.tours.deleteTours, {
 *   tourId: "tour123"
 * });
 *
 * Delete with participant transfer
 * const result = await ctx.runMutation(api.functions.tours.deleteTours, {
 *   tourId: "tour123",
 *   options: {
 *     cascadeDelete: true,
 *     transferParticipants: "targetTour456"
 *   }
 * });
 */
export const deleteTours = mutation({
  args: {
    tourId: v.id("tours"),
    options: v.optional(
      v.object({
        softDelete: v.optional(v.boolean()),
        cascadeDelete: v.optional(v.boolean()),
        transferParticipants: v.optional(v.id("tours")),
        returnDeletedData: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<DeleteResponse<TourDoc>> => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const tour = await ctx.db.get(args.tourId);
    if (!tour) {
      throw new Error("Tour not found");
    }

    let transferredCount = 0;
    let deletedTourData: TourDoc | undefined = undefined;

    if (options.returnDeletedData) {
      deletedTourData = tour;
    }

    if (options.transferParticipants) {
      const targetTour = await ctx.db.get(options.transferParticipants);
      if (!targetTour) {
        throw new Error("Target tour for participant transfer not found");
      }

      const tourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_tour", (q) => q.eq("tourId", args.tourId))
        .collect();

      for (const tourCard of tourCards) {
        const existingCard = await ctx.db
          .query("tourCards")
          .withIndex("by_member", (q) => q.eq("memberId", tourCard.memberId))
          .filter((q) => q.eq(q.field("tourId"), options.transferParticipants!))
          .first();

        if (!existingCard) {
          await ctx.db.insert("tourCards", {
            memberId: tourCard.memberId,
            displayName: tourCard.displayName,
            tourId: options.transferParticipants,
            seasonId: targetTour.seasonId,
            earnings: 0,
            points: 0,
            topTen: 0,
            madeCut: 0,
            appearances: 0,
            updatedAt: Date.now(),
          });
          transferredCount++;
        }
      }
    }

    if (options.cascadeDelete !== false) {
      const tourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_tour", (q) => q.eq("tourId", args.tourId))
        .collect();

      if (tourCards.length > 500) {
        throw new Error(
          `Tour has ${tourCards.length} tour cards. Cannot delete >500 cards in single operation. ` +
            "Please use admin batch-delete tool or contact support.",
        );
      }

      for (const tourCard of tourCards) {
        await ctx.db.delete(tourCard._id);
      }
    }

    await ctx.db.delete(args.tourId);

    await logAudit(ctx, {
      entityType: "tours",
      entityId: args.tourId,
      action: "deleted",
      metadata: extractDeleteMetadata(
        { deleted: true, transferredCount },
        options,
      ),
    });

    return {
      success: true,
      deleted: true,
      deactivated: false,
      transferredCount: transferredCount > 0 ? transferredCount : undefined,
      deletedData: deletedTourData,
    };
  },
});

/**
 * Get optimized tours based on query options using indexes
 */
async function getOptimizedTours(
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
function applyFilters(tours: TourDoc[], filter: TourFilterOptions): TourDoc[] {
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
function getSortFunction(sort: TourSortOptions): TourSortFunction {
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
async function enhanceTour(
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
async function generateAnalytics(
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
