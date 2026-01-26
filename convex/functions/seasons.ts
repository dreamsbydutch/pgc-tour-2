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
import { processData, dateUtils, validators } from "./_utils";
import { TIME } from "./_constants";
import { logAudit, computeChanges, extractDeleteMetadata } from "./_auditLog";
import type {
  ValidationResult,
  AnalyticsResult,
  DeleteResponse,
  SeasonDoc,
  EnhancedSeasonDoc,
  MemberDoc,
  SeasonSortFunction,
  DatabaseContext,
  SeasonFilterOptions,
  SeasonOptimizedQueryOptions,
  SeasonEnhancementOptions,
  SeasonSortOptions,
} from "../types/types";

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
 * Validate season data
 */
function validateSeasonData(data: {
  year?: number;
  number?: number;
  startDate?: number;
  endDate?: number;
  registrationDeadline?: number;
}): ValidationResult {
  const errors: string[] = [];

  const currentYear = new Date().getFullYear();

  const yearErr = validators.numberRange(
    data.year,
    2020,
    currentYear + 5,
    "Season year",
  );
  if (yearErr) errors.push(yearErr);

  const numberErr = validators.numberRange(data.number, 1, 10, "Season number");
  if (numberErr) errors.push(numberErr);

  if (data.startDate && data.endDate && data.startDate >= data.endDate) {
    errors.push("Season start date must be before end date");
  }

  if (
    data.registrationDeadline &&
    data.endDate &&
    data.registrationDeadline > data.endDate
  ) {
    errors.push("Registration deadline must be on or before season end date");
  }

  const now = Date.now();
  if (data.endDate && data.endDate < now - 365 * TIME.MS_PER_DAY) {
    errors.push("Season end date cannot be more than 1 year in the past");
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Calculate season duration in days
 */
function calculateSeasonDuration(startDate?: number, endDate?: number): number {
  if (!startDate || !endDate) return 0;
  return dateUtils.daysBetween(startDate, endDate);
}

/**
 * Calculate days remaining in season
 */
function calculateDaysRemaining(endDate?: number): number {
  if (!endDate) return 0;
  const now = Date.now();
  if (endDate < now) return 0;
  return dateUtils.daysUntil(endDate);
}

/**
 * Determine season status
 */
function getSeasonStatus(
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
      const validation = validateSeasonData(data);

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
 * Project convention (updated): "current" means the season whose `year` matches
 * the actual current year (e.g. 2026).
 * If multiple seasons exist for the year, returns the highest `number`.
 */
export const getCurrentSeason = query({
  args: {},
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();

    const seasons = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .collect();

    if (seasons.length === 0) return null;

    return seasons.reduce((best, season) => {
      if (season.number > best.number) return season;
      return best;
    });
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
      const validation = validateSeasonData(args.data);
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

/**
 * Get optimized seasons based on query options using indexes
 */
async function getOptimizedSeasons(
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
function applyFilters(
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
function getSortFunction(sort: SeasonSortOptions): SeasonSortFunction {
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
async function enhanceSeason(
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
async function generateAnalytics(
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
