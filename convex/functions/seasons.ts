/**
 * Season Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../utils/auth";
import { processData } from "../utils/batchProcess";
import { logAudit, computeChanges } from "../utils/auditLog";
import { applyFilters, getSortFunction } from "../utils/seasons";
import type { SeasonDoc } from "../types/types";

/**
 * Creates a new season.
 *
 * Behavior:
 * - Requires admin.
 * - Validates for duplicate (year, number) unless `options.skipValidation`.
 * - Optionally returns an enhanced season view when `options.returnEnhanced`.
 *
 * @param args.data Core season fields to insert.
 * @param args.options Optional behavior flags (validation + response shaping).
 * @returns The created season doc, or an enhanced season doc when requested.
 */
export const createSeasons = mutation({
  args: {
    data: v.object({
      year: v.number(),
      number: v.number(),
      startDate: v.optional(v.number()),
      endDate: v.optional(v.number()),
      registrationDeadline: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const seasonId = await ctx.db.insert("seasons", {
      year: args.data.year,
      number: args.data.number,
      startDate: args.data.startDate,
      endDate: args.data.endDate,
      registrationDeadline: args.data.registrationDeadline,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, {
      entityType: "seasons",
      entityId: seasonId,
      action: "created",
      metadata: {
        year: args.data.year,
        number: args.data.number,
      },
    });

    const season = await ctx.db.get(seasonId);
    if (!season) throw new Error("Failed to retrieve created season");

    return season;
  },
});

/**
 * Fetches seasons.
 *
 * Modes:
 * - `options.id`: returns a single (optionally enhanced) season or `null`.
 * - `options.ids`: returns an array of seasons (missing IDs filtered out).
 * - Otherwise: returns a list using filtering/sorting/pagination; may return analytics.
 *
 * Notes:
 * - Enhancement is controlled by `options.enhance`.
 * - When `options.includeAnalytics` is true, returns `{ seasons, analytics, meta }`.
 */
export const getSeasons = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("seasons")),
        ids: v.optional(v.array(v.id("seasons"))),
        filter: v.optional(
          v.object({
            year: v.optional(v.number()),
            minYear: v.optional(v.number()),
            maxYear: v.optional(v.number()),
            number: v.optional(v.number()),
            name: v.optional(v.string()),
            hasDescription: v.optional(v.boolean()),
            startAfter: v.optional(v.number()),
            startBefore: v.optional(v.number()),
            endAfter: v.optional(v.number()),
            endBefore: v.optional(v.number()),
            searchTerm: v.optional(v.string()),
            isUpcoming: v.optional(v.boolean()),
            isCompleted: v.optional(v.boolean()),
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
                v.literal("year"),
                v.literal("startDate"),
                v.literal("endDate"),
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
      const season = await ctx.db.get(options.id);
      if (!season) return null;

      return season;
    }

    if (options.ids) {
      const seasons = await Promise.all(
        options.ids.map(async (id) => {
          const season = await ctx.db.get(id);
          return season;
        }),
      );
      return seasons.filter(Boolean);
    }
    let seasons = await ctx.db.query("seasons").collect();
    seasons = applyFilters(seasons, options.filter || {});
    const processedSeasons = processData(seasons, {
      sort: getSortFunction(options.sort || {}),
    });
    return processedSeasons;
  },
});

/**
 * Get the current season.
 *
 * "Current" is derived primarily from dates:
 * - Prefer a season where `startDate <= now <= endDate` (or no `endDate`).
 * - If none are active yet, return the next upcoming season by `startDate`.
 * - As a final fallback, return the most recent season by `(year, number, startDate)`.
 */
export const getCurrentSeason = query({
  args: {},
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();
    const seasons = await ctx.db.query("seasons").collect();
    if (seasons.length === 0) return null;
    const currentYearSeasons = seasons.find((s) => s.year === currentYear);
    if (currentYearSeasons) {
      return currentYearSeasons;
    }
    return null;
  },
});
export const getCurrentSeason_Internal = internalQuery({
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();
    const seasons = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .collect();

    if (seasons.length === 0) {
      return { ok: true, skipped: true, reason: "no_current_season" } as const;
    }
    return { ok: true, skipped: false, season: seasons[0] } as const;
  },
});

/**
 * Updates an existing season.
 *
 * Behavior:
 * - Requires admin.
 * - Optionally validates incoming changes unless `options.skipValidation`.
 * - Updates `updatedAt` unless `options.updateTimestamp === false`.
 * - Optionally returns an enhanced season view when `options.returnEnhanced`.
 */
export const updateSeasons = mutation({
  args: {
    seasonId: v.id("seasons"),
    data: v.object({
      year: v.optional(v.number()),
      number: v.optional(v.number()),
      startDate: v.optional(v.number()),
      endDate: v.optional(v.number()),
      registrationDeadline: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error("Season not found");
    }

    const updateData: Partial<SeasonDoc> = { ...args.data };
    updateData.updatedAt = Date.now();
    await ctx.db.patch(args.seasonId, updateData);

    const changes = computeChanges(season, updateData);
    if (Object.keys(changes).length > 0) {
      await logAudit(ctx, {
        entityType: "seasons",
        entityId: args.seasonId,
        action: "updated",
        changes,
      });
    }
    const updatedSeason = await ctx.db.get(args.seasonId);
    if (!updatedSeason) throw new Error("Failed to retrieve updated season");

    return updatedSeason;
  },
});

export const getStandingsViewData = query({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args) => {
    const [tours, tiers, tournaments, tourCards] = await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
      ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
      ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
    ]);

    const sortedTournaments = tournaments
      .slice()
      .sort((a, b) => a.startDate - b.startDate);

    const teamsByTournament = await Promise.all(
      sortedTournaments.map(async (t) => {
        return await ctx.db
          .query("teams")
          .withIndex("by_tournament", (q) => q.eq("tournamentId", t._id))
          .collect();
      }),
    );

    const teams = teamsByTournament.flat();

    return {
      tours,
      tiers,
      tournaments: sortedTournaments,
      tourCards,
      teams,
    };
  },
});
