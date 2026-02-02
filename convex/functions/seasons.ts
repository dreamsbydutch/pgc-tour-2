/**
 * Season Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../auth";
import { processData } from "../utils/processData";
import {
  logAudit,
  computeChanges,
  extractDeleteMetadata,
} from "../utils/auditLog";
import { seasonsValidators } from "../validators/seasons";
import {
  applyFilters,
  calculateDaysRemaining,
  calculateSeasonDuration,
  enhanceSeason,
  generateAnalytics,
  getOptimizedSeasons,
  getSeasonStatus,
  getSortFunction,
} from "../utils/seasons";
import type { DeleteResponse, SeasonDoc } from "../types/types";

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

/**
 * Create seasons with comprehensive options
 *
 * @example
 * Basic season creation
 * const season = await ctx.runMutation(api.functions.seasons.createSeasons, {
 *   data: {
 *     year: 2025,
 *     number: 1,
 *     startDate: new Date("2025-03-01").getTime(),
 *     endDate: new Date("2025-08-31").getTime()
 *   }
 * });
 *
 * With advanced options
 * const season = await ctx.runMutation(api.functions.seasons.createSeasons, {
 *   data: { ... },
 *   options: {
 *     skipValidation: false,
 *     setActive: true,
 *     returnEnhanced: true,
 *   }
 * });
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
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        returnEnhanced: v.optional(v.boolean()),
        includeStatistics: v.optional(v.boolean()),
        includeTours: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const options = args.options || {};
    const data = args.data;

    if (!options.skipValidation) {
      const validation = seasonsValidators.validateSeasonData(data);

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      const sameYear = await ctx.db
        .query("seasons")
        .withIndex("by_year", (q) => q.eq("year", data.year))
        .collect();
      const existing = sameYear.find((s) => s.number === data.number);
      if (existing) {
        throw new Error("Season with this year and number already exists");
      }
    }

    const seasonId = await ctx.db.insert("seasons", {
      year: data.year,
      number: data.number,
      startDate: data.startDate,
      endDate: data.endDate,
      registrationDeadline: data.registrationDeadline,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, {
      entityType: "seasons",
      entityId: seasonId,
      action: "created",
      metadata: {
        year: data.year,
        number: data.number,
      },
    });

    const season = await ctx.db.get(seasonId);
    if (!season) throw new Error("Failed to retrieve created season");

    if (options.returnEnhanced) {
      return await enhanceSeason(ctx, season, {
        includeTours: options.includeTours,
        includeStatistics: options.includeStatistics,
      });
    }

    return season;
  },
});

/**
 * Get seasons with comprehensive query options
 *
 * @example
 * Get single season by ID
 * const season = await ctx.runQuery(api.functions.seasons.getSeasons, {
 *   options: { id: "season123" }
 * });
 *
 * Get multiple seasons by IDs
 * const seasons = await ctx.runQuery(api.functions.seasons.getSeasons, {
 *   options: { ids: ["season1", "season2", "season3"] }
 * });
 *
 * Get seasons with filtering, sorting, and pagination
 * const result = await ctx.runQuery(api.functions.seasons.getSeasons, {
 *   options: {
 *     filter: {
 *       year: 2025,
 *       startAfter: Date.now(),
 *       searchTerm: "Spring"
 *     },
 *     sort: {
 *       sortBy: "startDate",
 *       sortOrder: "desc"
 *     },
 *     pagination: {
 *       limit: 10,
 *       offset: 0
 *     },
 *     enhance: {
 *       includeTours: true,
 *       includeTournaments: true,
 *       includeStatistics: true
 *     }
 *   }
 * });
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
        pagination: v.optional(
          v.object({
            limit: v.optional(v.number()),
            offset: v.optional(v.number()),
          }),
        ),
        enhance: v.optional(
          v.object({
            includeTours: v.optional(v.boolean()),
            includeTournaments: v.optional(v.boolean()),
            includeMembers: v.optional(v.boolean()),
            includeStatistics: v.optional(v.boolean()),
            includeTotals: v.optional(v.boolean()),
          }),
        ),
        includeAnalytics: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.id) {
      const season = await ctx.db.get(options.id);
      if (!season) return null;

      return await enhanceSeason(ctx, season, options.enhance || {});
    }

    if (options.ids) {
      const seasons = await Promise.all(
        options.ids.map(async (id) => {
          const season = await ctx.db.get(id);
          return season
            ? await enhanceSeason(ctx, season, options.enhance || {})
            : null;
        }),
      );
      return seasons.filter(Boolean);
    }

    let seasons = await getOptimizedSeasons(ctx, options);

    seasons = applyFilters(seasons, options.filter || {});

    const processedSeasons = processData(seasons, {
      sort: getSortFunction(options.sort || {}),
      limit: options.pagination?.limit,
      skip: options.pagination?.offset,
    });

    if (options.enhance && Object.values(options.enhance).some(Boolean)) {
      const enhancedSeasons = await Promise.all(
        processedSeasons.map((season) =>
          enhanceSeason(ctx, season, options.enhance || {}),
        ),
      );

      if (options.includeAnalytics) {
        return {
          seasons: enhancedSeasons,
          analytics: await generateAnalytics(ctx, seasons),
          meta: {
            total: seasons.length,
            filtered: processedSeasons.length,
            offset: options.pagination?.offset || 0,
            limit: options.pagination?.limit,
          },
        };
      }

      return enhancedSeasons;
    }

    const basicSeasons = processedSeasons.map((season) => {
      const status = getSeasonStatus(season.startDate, season.endDate);
      return {
        ...season,
        duration: calculateSeasonDuration(season.startDate, season.endDate),
        daysRemaining: calculateDaysRemaining(season.endDate),
        ...status,
      };
    });

    if (options.includeAnalytics) {
      return {
        seasons: basicSeasons,
        analytics: await generateAnalytics(ctx, seasons),
        meta: {
          total: seasons.length,
          filtered: basicSeasons.length,
          offset: options.pagination?.offset || 0,
          limit: options.pagination?.limit,
        },
      };
    }

    return basicSeasons;
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
    const now = Date.now();
    const currentYear = new Date().getFullYear();
    const seasons = await ctx.db.query("seasons").collect();
    if (seasons.length === 0) return null;

    const currentYearSeasons = seasons.filter((s) => s.year === currentYear);
    if (currentYearSeasons.length > 0) {
      return currentYearSeasons.reduce((best, candidate) => {
        const bestNumber = best.number ?? 0;
        const candidateNumber = candidate.number ?? 0;
        if (candidateNumber !== bestNumber) {
          return candidateNumber > bestNumber ? candidate : best;
        }

        const bestStart = best.startDate ?? 0;
        const candidateStart = candidate.startDate ?? 0;
        if (candidateStart !== bestStart) {
          return candidateStart > bestStart ? candidate : best;
        }

        return candidate._creationTime > best._creationTime ? candidate : best;
      }, currentYearSeasons[0]);
    }

    const active = seasons.filter((season) => {
      const startDate = season.startDate;
      const endDate = season.endDate;

      if (typeof startDate === "number" && startDate > now) return false;
      if (typeof endDate === "number" && endDate < now) return false;
      return true;
    });

    if (active.length > 0) {
      return active.reduce((best, candidate) => {
        const bestYear = best.year ?? 0;
        const candidateYear = candidate.year ?? 0;
        if (candidateYear !== bestYear) {
          return candidateYear > bestYear ? candidate : best;
        }

        const bestNumber = best.number ?? 0;
        const candidateNumber = candidate.number ?? 0;
        if (candidateNumber !== bestNumber) {
          return candidateNumber > bestNumber ? candidate : best;
        }

        const bestStart = best.startDate ?? 0;
        const candidateStart = candidate.startDate ?? 0;
        if (candidateStart !== bestStart) {
          return candidateStart > bestStart ? candidate : best;
        }

        return candidate._creationTime > best._creationTime ? candidate : best;
      }, active[0]);
    }

    const upcoming = seasons
      .filter((season) => typeof season.startDate === "number" && season.startDate > now)
      .sort((a, b) => (a.startDate ?? 0) - (b.startDate ?? 0));

    if (upcoming.length > 0) return upcoming[0];

    return seasons.reduce((best, candidate) => {
      const bestYear = best.year ?? 0;
      const candidateYear = candidate.year ?? 0;
      if (candidateYear !== bestYear) {
        return candidateYear > bestYear ? candidate : best;
      }

      const bestNumber = best.number ?? 0;
      const candidateNumber = candidate.number ?? 0;
      if (candidateNumber !== bestNumber) {
        return candidateNumber > bestNumber ? candidate : best;
      }

      const bestStart = best.startDate ?? 0;
      const candidateStart = candidate.startDate ?? 0;
      if (candidateStart !== bestStart) {
        return candidateStart > bestStart ? candidate : best;
      }

      return candidate._creationTime > best._creationTime ? candidate : best;
    }, seasons[0]);
  },
});

/**
 * Update seasons with comprehensive options
 *
 * @example
 * Basic update
 * const updatedSeason = await ctx.runMutation(api.functions.seasons.updateSeasons, {
 *   seasonId: "season123",
 *   data: { name: "Updated Season Name", endDate: new Date("2025-12-31").getTime() }
 * });
 *
 * Advanced update with options
 * const result = await ctx.runMutation(api.functions.seasons.updateSeasons, {
 *   seasonId: "season123",
 *   data: { endDate: new Date("2025-12-31").getTime() },
 *   options: {
 *     skipValidation: false,
 *     updateTimestamp: true,
 *     deactivateOthers: true,
 *     returnEnhanced: true,
 *     includeStatistics: true
 *   }
 * });
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
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        updateTimestamp: v.optional(v.boolean()),
        returnEnhanced: v.optional(v.boolean()),
        includeStatistics: v.optional(v.boolean()),
        includeTours: v.optional(v.boolean()),
        includeTournaments: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const options = args.options || {};
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error("Season not found");
    }

    if (!options.skipValidation) {
      const validation = seasonsValidators.validateSeasonData(args.data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      if (
        (args.data.year || args.data.number) &&
        (args.data.year !== season.year || args.data.number !== season.number)
      ) {
        const year = args.data.year ?? season.year;
        const number = args.data.number ?? season.number;
        const sameYear = await ctx.db
          .query("seasons")
          .withIndex("by_year", (q) => q.eq("year", year))
          .collect();
        const existingSeason = sameYear.find((s) => s.number === number);
        if (existingSeason && existingSeason._id !== args.seasonId) {
          throw new Error("Season with this year and number already exists");
        }
      }
    }

    const updateData: Partial<SeasonDoc> = { ...args.data };

    if (options.updateTimestamp !== false) {
      updateData.updatedAt = Date.now();
    }

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

    if (options.returnEnhanced) {
      return await enhanceSeason(ctx, updatedSeason, {
        includeTours: options.includeTours,
        includeStatistics: options.includeStatistics,
        includeTournaments: options.includeTournaments,
      });
    }

    return updatedSeason;
  },
});

/**
 * Delete seasons (hard delete only)
 *
 * This function always performs a hard delete (permanent removal from database).
 *
 * @example
 * Delete season
 * const result = await ctx.runMutation(api.functions.seasons.deleteSeasons, {
 *   seasonId: "season123"
 * });
 *
 * Delete with data migration
 * const result = await ctx.runMutation(api.functions.seasons.deleteSeasons, {
 *   seasonId: "season123",
 *   options: {
 *     cascadeDelete: true,
 *     migrateToSeason: "newSeason456"
 *   }
 * });
 */
export const deleteSeasons = mutation({
  args: {
    seasonId: v.id("seasons"),
    options: v.optional(
      v.object({
        cascadeDelete: v.optional(v.boolean()),
        migrateToSeason: v.optional(v.id("seasons")),
        returnDeletedData: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<DeleteResponse<SeasonDoc>> => {
    await requireAdmin(ctx);

    const options = args.options || {};
    const season = await ctx.db.get(args.seasonId);
    if (!season) {
      throw new Error("Season not found");
    }

    let migratedCount = 0;
    let deletedSeasonData: SeasonDoc | undefined = undefined;

    if (options.returnDeletedData) {
      deletedSeasonData = season;
    }

    if (options.migrateToSeason) {
      const targetSeason = await ctx.db.get(options.migrateToSeason);
      if (!targetSeason) {
        throw new Error("Target season for migration not found");
      }

      const tours = await ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect();

      if (tours.length > 500) {
        throw new Error(
          `Season has ${tours.length} tours. Cannot migrate >500 items in single operation. ` +
            "Please use admin batch-migrate tool or contact support.",
        );
      }

      for (const tour of tours) {
        await ctx.db.patch(tour._id, {
          seasonId: options.migrateToSeason,
          updatedAt: Date.now(),
        });
        migratedCount++;
      }

      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect();

      if (tournaments.length > 500) {
        throw new Error(
          `Season has ${tournaments.length} tournaments. Cannot migrate >500 items in single operation. ` +
            "Please use admin batch-migrate tool or contact support.",
        );
      }

      for (const tournament of tournaments) {
        await ctx.db.patch(tournament._id, {
          seasonId: options.migrateToSeason,
          updatedAt: Date.now(),
        });
        migratedCount++;
      }

      const tiers = await ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect();

      if (tiers.length > 500) {
        throw new Error(
          `Season has ${tiers.length} tiers. Cannot migrate >500 items in single operation. ` +
            "Please use admin batch-migrate tool or contact support.",
        );
      }

      for (const tier of tiers) {
        await ctx.db.patch(tier._id, {
          seasonId: options.migrateToSeason,
          updatedAt: Date.now(),
        });
        migratedCount++;
      }

      const tourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect();

      if (tourCards.length > 500) {
        throw new Error(
          `Season has ${tourCards.length} tour cards. Cannot migrate >500 items in single operation. ` +
            "Please use admin batch-migrate tool or contact support.",
        );
      }

      for (const tourCard of tourCards) {
        await ctx.db.patch(tourCard._id, {
          seasonId: options.migrateToSeason,
          updatedAt: Date.now(),
        });
        migratedCount++;
      }
    }

    if (options.cascadeDelete && !options.migrateToSeason) {
      const tours = await ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect();

      for (const tour of tours) {
        await ctx.db.delete(tour._id);
      }

      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect();

      for (const tournament of tournaments) {
        await ctx.db.delete(tournament._id);
      }

      const tiers = await ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect();

      for (const tier of tiers) {
        await ctx.db.delete(tier._id);
      }

      const tourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect();

      for (const tourCard of tourCards) {
        await ctx.db.delete(tourCard._id);
      }
    }

    await ctx.db.delete(args.seasonId);

    await logAudit(ctx, {
      entityType: "seasons",
      entityId: args.seasonId,
      action: "deleted",
      metadata: extractDeleteMetadata(
        { deleted: true, transferredCount: migratedCount },
        options,
      ),
    });

    return {
      success: true,
      deleted: true,
      deactivated: false,
      transferredCount: migratedCount > 0 ? migratedCount : undefined,
      deletedData: deletedSeasonData,
    };
  },
});
