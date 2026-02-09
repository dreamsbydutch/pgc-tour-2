/**
 * Tour Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation } from "../_generated/server";
import { requireAdmin } from "../utils/auth";
import { processData } from "../utils/batchProcess";
import { sumArray } from "../utils/sumArray";
import { applyFilters, getSortFunction } from "../utils/tours";
import { logAudit, computeChanges } from "../utils/auditLog";
import type { TourDoc } from "../types/types";
import { v } from "convex/values";
import { formatCents } from "../utils";

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
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const tourId = await ctx.db.insert("tours", {
      name: args.data.name,
      shortForm: args.data.shortForm,
      logoUrl: args.data.logoUrl,
      seasonId: args.data.seasonId,
      buyIn: args.data.buyIn,
      playoffSpots: args.data.playoffSpots,
      maxParticipants: args.data.maxParticipants,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, {
      entityType: "tours",
      entityId: tourId,
      action: "created",
      metadata: {
        seasonId: args.data.seasonId,
        name: args.data.name,
      },
    });

    const tour = await ctx.db.get(tourId);
    if (!tour) throw new Error("Failed to retrieve created tour");

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
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.id) {
      const tour = await ctx.db.get(options.id);
      if (!tour) return null;

      return {
        ...tour,
        buyIn: formatCents(tour.buyIn),
        playoffSpots: sumArray(tour.playoffSpots),
      };
    }

    if (options.ids) {
      const tours = await Promise.all(
        options.ids.map(async (id) => {
          const tour = await ctx.db.get(id);
          return tour;
        }),
      );
      return tours.filter(Boolean).map((tour) => ({
        ...tour,
        buyIn: formatCents(tour?.buyIn ?? 0),
        playoffSpots: sumArray(tour?.playoffSpots ?? []),
      }));
    }

    let tours = await ctx.db.query("tours").collect();
    tours = applyFilters(tours, options.filter || {});
    const processedTours = processData(tours, {
      sort: getSortFunction(options.sort || {}),
    });
    return processedTours.map((tour) => ({
      ...tour,
      buyIn: formatCents(tour.buyIn),
      playoffSpots: sumArray(tour.playoffSpots),
    }));
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
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const tour = await ctx.db.get(args.tourId);
    if (!tour) {
      throw new Error("Tour not found");
    }

    const updateData: Partial<TourDoc> = { ...args.data };
    updateData.updatedAt = Date.now();

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

    return updatedTour;
  },
});
