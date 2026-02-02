/**
 * Tour Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation } from "../_generated/server";
import { requireAdmin } from "../auth";
import { processData } from "../utils/processData";
import { formatCents } from "../utils/formatCents";
import { sumArray } from "../utils/sumArray";
import {
  applyFilters,
  enhanceTour,
  generateAnalytics,
  getOptimizedTours,
  getSortFunction,
} from "../utils/tours";
import {
  logAudit,
  computeChanges,
  extractDeleteMetadata,
} from "../utils/auditLog";
import { toursValidators } from "../validators/tours";
import type { DeleteResponse, TourDoc } from "../types/types";

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
  args: toursValidators.args.createTours,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const data = args.data;

    if (!options.skipValidation) {
      const validation = toursValidators.validateTourData(data);

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
  args: toursValidators.args.getTours,
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
  args: toursValidators.args.updateTours,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const tour = await ctx.db.get(args.tourId);
    if (!tour) {
      throw new Error("Tour not found");
    }

    if (!options.skipValidation) {
      const validation = toursValidators.validateTourData(args.data);
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
  args: toursValidators.args.deleteTours,
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
