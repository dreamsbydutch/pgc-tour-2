/**
 * Tournament Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "../auth";
import { processData, dateUtils, validators } from "./_utils";
import { logAudit, computeChanges, extractDeleteMetadata } from "./_auditLog";
import type { Id } from "../_generated/dataModel";
import type {
  ValidationResult,
  AnalyticsResult,
  DeleteResponse,
  TournamentDoc,
  EnhancedTournamentDoc,
  GolferDoc,
  TournamentGolferDoc,
  TournamentSortFunction,
  DatabaseContext,
  TournamentFilterOptions,
  TournamentSortOptions,
  TournamentEnhancementOptions,
} from "../types/types";

/**
 * Validate tournament data
 */
function validateTournamentData(data: {
  name?: string;
  seasonId?: Id<"seasons">;
  tierId?: Id<"tiers">;
  courseId?: Id<"courses">;
  startDate?: number;
  endDate?: number;
  status?: "upcoming" | "active" | "completed" | "cancelled";
}): ValidationResult {
  const errors: string[] = [];

  const nameErr = validators.stringLength(data.name, 3, 100, "Tournament name");
  if (nameErr) errors.push(nameErr);

  if (data.startDate && data.endDate && data.startDate >= data.endDate) {
    errors.push("Start date must be before end date");
  }

  if (
    data.status &&
    !["upcoming", "active", "completed", "cancelled"].includes(data.status)
  ) {
    errors.push("Invalid tournament status");
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Calculate tournament duration in days
 */
function calculateTournamentDuration(
  startDate: number,
  endDate: number,
): number {
  return dateUtils.daysBetween(startDate, endDate);
}

/**
 * Format tournament date range for display
 */
function formatDateRange(startDate: number, endDate: number): string {
  const start = new Date(startDate).toLocaleDateString();
  const end = new Date(endDate).toLocaleDateString();
  return `${start} - ${end}`;
}

/**
 * Get tournament status based on dates
 */
function getCalculatedStatus(
  startDate: number,
  endDate: number,
  currentStatus?: string,
): "upcoming" | "active" | "completed" | "cancelled" {
  if (currentStatus === "cancelled") return "cancelled";

  const now = Date.now();

  if (now < startDate) return "upcoming";
  if (now >= startDate && now <= endDate) return "active";
  return "completed";
}

/**
 * Create tournaments with comprehensive options
 *
 * @example
 * Basic tournament creation
 * const tournament = await ctx.runMutation(api.functions.tournaments.createTournaments, {
 *   data: {
 *     name: "PGA Championship 2025",
 *     seasonId: "season123",
 *     tierId: "tier1",
 *     courseId: "course456",
 *     startDate: Date.now() + 86400000,
 *     endDate: Date.now() + 259200000,
 *     tourIds: ["tour1", "tour2"]
 *   }
 * });
 *
 * With advanced options
 * const tournament = await ctx.runMutation(api.functions.tournaments.createTournaments, {
 *   data: { ... },
 *   options: {
 *     skipValidation: false,
 *     setActive: true,
 *     autoSetStatus: true,
 *     returnEnhanced: true
 *   }
 * });
 */
export const createTournaments = mutation({
  args: {
    clerkId: v.optional(v.string()),
    data: v.object({
      name: v.string(),
      seasonId: v.id("seasons"),
      tierId: v.id("tiers"),
      courseId: v.id("courses"),
      startDate: v.number(),
      endDate: v.number(),
      logoUrl: v.optional(v.string()),
      apiId: v.optional(v.string()),
      status: v.optional(
        v.union(
          v.literal("upcoming"),
          v.literal("active"),
          v.literal("completed"),
          v.literal("cancelled"),
        ),
      ),
      livePlay: v.optional(v.boolean()),
      currentRound: v.optional(v.number()),
    }),
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        setActive: v.optional(v.boolean()),
        autoSetStatus: v.optional(v.boolean()),
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
      const validation = validateTournamentData(data);

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      const existing = await ctx.db
        .query("tournaments")
        .filter((q) =>
          q.and(
            q.eq(q.field("name"), data.name),
            q.eq(q.field("seasonId"), data.seasonId),
          ),
        )
        .first();

      if (existing) {
        throw new Error(
          "Tournament with this name already exists in the season",
        );
      }

      const season = await ctx.db.get(data.seasonId);
      if (!season) throw new Error("Season not found");

      const tier = await ctx.db.get(data.tierId);
      if (!tier) throw new Error("Tier not found");

      const course = await ctx.db.get(data.courseId);
      if (!course) throw new Error("Course not found");
    }

    let finalStatus = data.status;
    if (options.autoSetStatus || !finalStatus) {
      finalStatus = getCalculatedStatus(data.startDate, data.endDate);
    }

    const tournamentId = await ctx.db.insert("tournaments", {
      name: data.name,
      seasonId: data.seasonId,
      tierId: data.tierId,
      courseId: data.courseId,
      startDate: data.startDate,
      endDate: data.endDate,
      logoUrl: data.logoUrl,
      apiId: data.apiId,
      livePlay: data.livePlay,
      currentRound: data.currentRound,
      status: finalStatus,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, {
      entityType: "tournaments",
      entityId: tournamentId,
      action: "created",
      metadata: {
        seasonId: data.seasonId,
        tierId: data.tierId,
        status: finalStatus,
      },
    });

    const tournament = await ctx.db.get(tournamentId);
    if (!tournament) throw new Error("Failed to retrieve created tournament");

    if (options.returnEnhanced) {
      return await enhanceTournament(ctx, tournament, {
        includeSeason: options.includeSeason,
        includeStatistics: options.includeStatistics,
      });
    }

    return tournament;
  },
});

/**
 * Get tournaments with comprehensive query options
 *
 * @example
 * Get single tournament by ID
 * const tournament = await ctx.runQuery(api.functions.tournaments.getTournaments, {
 *   options: { id: "tournament123" }
 * });
 *
 * Get multiple tournaments by IDs
 * const tournaments = await ctx.runQuery(api.functions.tournaments.getTournaments, {
 *   options: { ids: ["tournament1", "tournament2", "tournament3"] }
 * });
 *
 * Get tournaments with filtering, sorting, and pagination
 * const result = await ctx.runQuery(api.functions.tournaments.getTournaments, {
 *   options: {
 *     filter: {
 *       seasonId: "season123",
 *       status: "active",
 *       startAfter: Date.now(),
 *       searchTerm: "PGA"
 *     },
 *     sort: {
 *       sortBy: "startDate",
 *       sortOrder: "asc"
 *     },
 *     pagination: {
 *       limit: 20,
 *       offset: 0
 *     },
 *     enhance: {
 *       includeSeason: true,
 *       includeTier: true,
 *       includeCourse: true
 *     }
 *   }
 * });
 */
export const getTournaments = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("tournaments")),
        ids: v.optional(v.array(v.id("tournaments"))),
        filter: v.optional(
          v.object({
            seasonId: v.optional(v.id("seasons")),
            tierId: v.optional(v.id("tiers")),
            courseId: v.optional(v.id("courses")),
            tourIds: v.optional(v.array(v.id("tours"))),
            status: v.optional(
              v.union(
                v.literal("upcoming"),
                v.literal("active"),
                v.literal("completed"),
                v.literal("cancelled"),
              ),
            ),
            startAfter: v.optional(v.number()),
            startBefore: v.optional(v.number()),
            endAfter: v.optional(v.number()),
            endBefore: v.optional(v.number()),
            hasRegistration: v.optional(v.boolean()),
            livePlay: v.optional(v.boolean()),
            currentRound: v.optional(v.number()),
            searchTerm: v.optional(v.string()),
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
                v.literal("startDate"),
                v.literal("endDate"),
                v.literal("status"),
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
            includeTier: v.optional(v.boolean()),
            includeCourse: v.optional(v.boolean()),
            includeTours: v.optional(v.boolean()),
            includeTeams: v.optional(v.boolean()),
            includeGolfers: v.optional(v.boolean()),
            includeLeaderboard: v.optional(v.boolean()),
            includeStatistics: v.optional(v.boolean()),
          }),
        ),
        activeOnly: v.optional(v.boolean()),
        upcomingOnly: v.optional(v.boolean()),
        liveOnly: v.optional(v.boolean()),
        includeAnalytics: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.id) {
      const tournament = await ctx.db.get(options.id);
      if (!tournament) return null;

      return await enhanceTournament(ctx, tournament, options.enhance || {});
    }

    if (options.ids) {
      const tournaments = await Promise.all(
        options.ids.map(async (id) => {
          const tournament = await ctx.db.get(id);
          return tournament
            ? await enhanceTournament(ctx, tournament, options.enhance || {})
            : null;
        }),
      );
      return tournaments.filter(Boolean);
    }

    let tournaments = await getOptimizedTournaments(ctx, options);

    tournaments = applyTournamentFilters(tournaments, options.filter || {});

    const processedTournaments = processData(tournaments, {
      sort: getTournamentSortFunction(options.sort || {}),
      limit: options.pagination?.limit,
      skip: options.pagination?.offset,
    });

    if (options.enhance && Object.values(options.enhance).some(Boolean)) {
      const enhancedTournaments = await Promise.all(
        processedTournaments.map((tournament) =>
          enhanceTournament(ctx, tournament, options.enhance || {}),
        ),
      );

      if (options.includeAnalytics) {
        return {
          tournaments: enhancedTournaments,
          analytics: await generateTournamentAnalytics(ctx, tournaments),
          meta: {
            total: tournaments.length,
            filtered: processedTournaments.length,
            offset: options.pagination?.offset || 0,
            limit: options.pagination?.limit,
          },
        };
      }

      return enhancedTournaments;
    }

    const basicTournaments = processedTournaments.map((tournament) => ({
      ...tournament,
      dateRange: formatDateRange(tournament.startDate, tournament.endDate),
      duration: calculateTournamentDuration(
        tournament.startDate,
        tournament.endDate,
      ),
      calculatedStatus: getCalculatedStatus(
        tournament.startDate,
        tournament.endDate,
        tournament.status,
      ),
    }));

    if (options.includeAnalytics) {
      return {
        tournaments: basicTournaments,
        analytics: await generateTournamentAnalytics(ctx, tournaments),
        meta: {
          total: tournaments.length,
          filtered: basicTournaments.length,
          offset: options.pagination?.offset || 0,
          limit: options.pagination?.limit,
        },
      };
    }

    return basicTournaments;
  },
});

/**
 * Tournament leaderboard “view model” payload for the tournament screen.
 *
 * Returns everything the leaderboard UI needs in one call:
 * - tournament (optionally enhanced with season/tier/course)
 * - teams for the tournament (with tourCard embedded)
 * - tournament golfers for the tournament (with golfer embedded)
 * - tours for the tournament's season (for toggles)
 *
 * This query does not enforce auth (matches current repo convention). If you
 * pass `viewerClerkId`, it is used only as a best-effort to return the current
 * member + their tour card for this season.
 */
export const getTournamentLeaderboardView = query({
  args: {
    tournamentId: v.id("tournaments"),
    options: v.optional(
      v.object({
        includeTournamentEnhancements: v.optional(
          v.object({
            includeSeason: v.optional(v.boolean()),
            includeTier: v.optional(v.boolean()),
            includeCourse: v.optional(v.boolean()),
          }),
        ),
        includeTours: v.optional(v.boolean()),
        includeViewer: v.optional(v.boolean()),
        viewerClerkId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options ?? {};

    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) return null;

    const tournamentEnhanceOptions: TournamentEnhancementOptions = {
      includeSeason:
        options.includeTournamentEnhancements?.includeSeason ?? true,
      includeTier: options.includeTournamentEnhancements?.includeTier ?? true,
      includeCourse:
        options.includeTournamentEnhancements?.includeCourse ?? true,
    };
    const enhancedTournament = await enhanceTournament(
      ctx,
      tournament,
      tournamentEnhanceOptions,
    );

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();

    const tourCardIds = Array.from(new Set(teams.map((t) => t.tourCardId)));
    const tourCards = await Promise.all(
      tourCardIds.map((id) => ctx.db.get(id)),
    );
    const tourCardById = new Map(
      tourCards.filter(Boolean).map((tc) => [tc!._id, tc!]),
    );

    const teamsWithTourCard = teams.map((team) => ({
      ...team,
      tourCard: tourCardById.get(team.tourCardId) ?? null,
    }));

    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();

    const golferIds = Array.from(
      new Set(tournamentGolfers.map((tg) => tg.golferId)),
    );
    const golfers = await Promise.all(golferIds.map((id) => ctx.db.get(id)));
    const golferById = new Map(
      golfers.filter(Boolean).map((g) => [g!._id, g!]),
    );

    const golfersWithStats = tournamentGolfers
      .map((tg) => {
        const golfer = golferById.get(tg.golferId);
        if (!golfer) return null;
        return { ...tg, golfer };
      })
      .filter(Boolean) as Array<TournamentGolferDoc & { golfer: GolferDoc }>;

    const tours =
      options.includeTours === false
        ? []
        : await ctx.db
            .query("tours")
            .withIndex("by_season", (q) =>
              q.eq("seasonId", tournament.seasonId),
            )
            .collect();

    let viewer: { member: unknown | null; tourCard: unknown | null } | null =
      null;
    if (options.includeViewer && options.viewerClerkId) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_clerk_id", (q) =>
          q.eq("clerkId", options.viewerClerkId!),
        )
        .first();

      const viewerTourCard = member
        ? await ctx.db
            .query("tourCards")
            .withIndex("by_member_season", (q) =>
              q.eq("memberId", member._id).eq("seasonId", tournament.seasonId),
            )
            .first()
        : null;

      viewer = { member: member ?? null, tourCard: viewerTourCard ?? null };
    }

    return {
      tournament: enhancedTournament,
      teams: teamsWithTourCard,
      golfers: golfersWithStats,
      tours,
      viewer,
    };
  },
});

export const hasTournamentGolfers = query({
  args: {
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const tournamentGolfer = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .first();

    return Boolean(tournamentGolfer);
  },
});

export const getTournamentPickPool = query({
  args: {
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", args.tournamentId))
      .collect();

    const golferIds = Array.from(
      new Set(tournamentGolfers.map((tg) => tg.golferId)),
    );
    const golfers = await Promise.all(golferIds.map((id) => ctx.db.get(id)));
    const golferById = new Map(
      golfers.filter(Boolean).map((g) => [g!._id, g!]),
    );

    return tournamentGolfers
      .map((tg) => {
        const golfer = golferById.get(tg.golferId);
        if (!golfer) return null;

        return {
          golferApiId: golfer.apiId,
          playerName: golfer.playerName,
          group: tg.group ?? null,
          worldRank: tg.worldRank ?? golfer.worldRank ?? null,
        };
      })
      .filter(Boolean);
  },
});

/**
 * Frontend convenience: get all tournaments for simple list UIs.
 */
export const getAllTournaments = query({
  args: {
    seasonId: v.optional(v.id("seasons")),
  },
  handler: async (ctx, args) => {
    if (args.seasonId) {
      return await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId!))
        .collect();
    }

    return await ctx.db.query("tournaments").collect();
  },
});

/**
 * Frontend convenience: fetch a tournament with its related docs.
 *
 * Includes:
 * - `course`
 * - `season`
 */
export const getTournamentWithDetails = query({
  args: {
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) return null;

    const [course, season] = await Promise.all([
      tournament.courseId ? ctx.db.get(tournament.courseId) : null,
      tournament.seasonId ? ctx.db.get(tournament.seasonId) : null,
    ]);

    return {
      tournament,
      course,
      season,
    };
  },
});

/**
 * Update tournaments with comprehensive options
 *
 * @example
 * Basic update
 * const updatedTournament = await ctx.runMutation(api.functions.tournaments.updateTournaments, {
 *   tournamentId: "tournament123",
 *   data: { name: "Updated Tournament Name", status: "active" }
 * });
 *
 * Advanced update with options
 * const result = await ctx.runMutation(api.functions.tournaments.updateTournaments, {
 *   tournamentId: "tournament123",
 *   data: { status: "completed", currentRound: 4 },
 *   options: {
 *     skipValidation: false,
 *     updateTimestamp: true,
 *     autoUpdateStatus: true,
 *     returnEnhanced: true
 *   }
 * });
 */
export const updateTournaments = mutation({
  args: {
    clerkId: v.optional(v.string()),
    tournamentId: v.id("tournaments"),
    data: v.object({
      name: v.optional(v.string()),
      startDate: v.optional(v.number()),
      endDate: v.optional(v.number()),
      seasonId: v.optional(v.id("seasons")),
      tierId: v.optional(v.id("tiers")),
      courseId: v.optional(v.id("courses")),
      logoUrl: v.optional(v.string()),
      apiId: v.optional(v.string()),
      status: v.optional(
        v.union(
          v.literal("upcoming"),
          v.literal("active"),
          v.literal("completed"),
          v.literal("cancelled"),
        ),
      ),
      livePlay: v.optional(v.boolean()),
      currentRound: v.optional(v.number()),
    }),
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        updateTimestamp: v.optional(v.boolean()),
        autoUpdateStatus: v.optional(v.boolean()),
        returnEnhanced: v.optional(v.boolean()),
        includeStatistics: v.optional(v.boolean()),
        includeSeason: v.optional(v.boolean()),
        includeTier: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    if (args.data.seasonId && args.data.seasonId !== tournament.seasonId) {
      const season = await ctx.db.get(args.data.seasonId);
      if (!season) throw new Error("Season not found");
    }
    if (args.data.tierId && args.data.tierId !== tournament.tierId) {
      const tier = await ctx.db.get(args.data.tierId);
      if (!tier) throw new Error("Tier not found");
    }
    if (args.data.courseId && args.data.courseId !== tournament.courseId) {
      const course = await ctx.db.get(args.data.courseId);
      if (!course) throw new Error("Course not found");
    }

    if (!options.skipValidation) {
      const validation = validateTournamentData(args.data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      const targetName = args.data.name ?? tournament.name;
      const targetSeasonId = args.data.seasonId ?? tournament.seasonId;
      if (
        targetName !== tournament.name ||
        targetSeasonId !== tournament.seasonId
      ) {
        const existingTournament = await ctx.db
          .query("tournaments")
          .filter((q) =>
            q.and(
              q.eq(q.field("name"), targetName),
              q.eq(q.field("seasonId"), targetSeasonId),
            ),
          )
          .first();

        if (
          existingTournament &&
          existingTournament._id !== args.tournamentId
        ) {
          throw new Error(
            "Tournament with this name already exists in the season",
          );
        }
      }
    }

    const updateData: Partial<TournamentDoc> = { ...args.data };

    if (
      options.autoUpdateStatus &&
      (args.data.startDate || args.data.endDate)
    ) {
      const startDate = args.data.startDate || tournament.startDate;
      const endDate = args.data.endDate || tournament.endDate;
      updateData.status = getCalculatedStatus(
        startDate,
        endDate,
        updateData.status,
      );
    }

    if (options.updateTimestamp !== false) {
      updateData.updatedAt = Date.now();
    }

    await ctx.db.patch(args.tournamentId, updateData);

    const changes = computeChanges(tournament, updateData);
    if (Object.keys(changes).length > 0) {
      await logAudit(ctx, {
        entityType: "tournaments",
        entityId: args.tournamentId,
        action: "updated",
        changes,
      });
    }

    const updatedTournament = await ctx.db.get(args.tournamentId);
    if (!updatedTournament)
      throw new Error("Failed to retrieve updated tournament");

    if (options.returnEnhanced) {
      return await enhanceTournament(ctx, updatedTournament, {
        includeSeason: options.includeSeason,
        includeTier: options.includeTier,
        includeStatistics: options.includeStatistics,
      });
    }

    return updatedTournament;
  },
});

/**
 * Delete tournaments (hard delete by default)
 *
 * By default, this performs a hard delete (permanent removal).
 * For backward compatibility, you can opt into "soft delete" (status: cancelled).
 *
 * @example
 * Hard delete (default)
 * const result = await ctx.runMutation(api.functions.tournaments.deleteTournaments, {
 *   tournamentId: "tournament123"
 * });
 *
 * Hard delete with team cleanup
 * const result = await ctx.runMutation(api.functions.tournaments.deleteTournaments, {
 *   tournamentId: "tournament123",
 *   options: {
 *     cascadeDelete: true,
 *     cleanupTeams: true
 *   }
 * });
 *
 * Soft delete (sets status: cancelled, opt-in for back-compat)
 * const result = await ctx.runMutation(api.functions.tournaments.deleteTournaments, {
 *   tournamentId: "tournament123",
 *   options: {
 *     softDelete: true
 *   }
 * });
 */
export const deleteTournaments = mutation({
  args: {
    tournamentId: v.id("tournaments"),
    options: v.optional(
      v.object({
        softDelete: v.optional(v.boolean()),
        cascadeDelete: v.optional(v.boolean()),
        cleanupTeams: v.optional(v.boolean()),
        returnDeletedData: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<DeleteResponse<TournamentDoc>> => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    let cleanedUpTeams = 0;
    let deletedTournamentData: TournamentDoc | undefined = undefined;

    if (options.returnDeletedData) {
      deletedTournamentData = tournament;
    }

    if (options.cascadeDelete !== false) {
      if (options.cleanupTeams) {
        const teams = await ctx.db
          .query("teams")
          .withIndex("by_tournament", (q) =>
            q.eq("tournamentId", args.tournamentId),
          )
          .collect();

        if (teams.length > 500) {
          throw new Error(
            `Tournament has ${teams.length} teams. Cannot delete >500 teams in single operation. ` +
              "Please use admin batch-delete tool or contact support.",
          );
        }

        for (const team of teams) {
          await ctx.db.delete(team._id);
          cleanedUpTeams++;
        }
      }

      const tournamentGolfers = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", args.tournamentId),
        )
        .collect();

      if (tournamentGolfers.length > 500) {
        throw new Error(
          `Tournament has ${tournamentGolfers.length} golfer records. Cannot delete >500 records in single operation. ` +
            "Please use admin batch-delete tool or contact support.",
        );
      }

      for (const tg of tournamentGolfers) {
        await ctx.db.delete(tg._id);
      }
    }

    if (options.softDelete === true) {
      await ctx.db.patch(args.tournamentId, {
        status: "cancelled" as const,
        updatedAt: Date.now(),
      });

      await logAudit(ctx, {
        entityType: "tournaments",
        entityId: args.tournamentId,
        action: "updated",
        changes: { status: { old: tournament.status, new: "cancelled" } },
        metadata: { softDelete: true, cleanedUpTeams },
      });

      return {
        success: true,
        deleted: false,
        deactivated: true,
        transferredCount: cleanedUpTeams > 0 ? cleanedUpTeams : undefined,
        deletedData: deletedTournamentData,
      };
    } else {
      await ctx.db.delete(args.tournamentId);

      await logAudit(ctx, {
        entityType: "tournaments",
        entityId: args.tournamentId,
        action: "deleted",
        metadata: extractDeleteMetadata(
          { deleted: true, transferredCount: cleanedUpTeams },
          options,
        ),
      });

      return {
        success: true,
        deleted: true,
        deactivated: false,
        transferredCount: cleanedUpTeams > 0 ? cleanedUpTeams : undefined,
        deletedData: deletedTournamentData,
      };
    }
  },
});

/**
 * Get optimized tournaments based on query options using indexes
 */
async function getOptimizedTournaments(
  ctx: DatabaseContext,
  options: {
    filter?: TournamentFilterOptions;
    activeOnly?: boolean;
    upcomingOnly?: boolean;
    liveOnly?: boolean;
  },
): Promise<TournamentDoc[]> {
  const filter = options.filter || {};

  if (filter.seasonId && filter.status) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_season_status", (q) =>
        q.eq("seasonId", filter.seasonId!).eq("status", filter.status!),
      )
      .collect();
  }

  if (filter.seasonId) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", filter.seasonId!))
      .collect();
  }

  if (filter.tierId) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_tier", (q) => q.eq("tierId", filter.tierId!))
      .collect();
  }

  if (filter.courseId) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_course", (q) => q.eq("courseId", filter.courseId!))
      .collect();
  }

  if (filter.status) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", filter.status!))
      .collect();
  }

  if (options.activeOnly) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  }

  if (options.upcomingOnly) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "upcoming"))
      .collect();
  }

  if (options.liveOnly) {
    return await ctx.db
      .query("tournaments")
      .filter((q) => q.eq(q.field("livePlay"), true))
      .collect();
  }

  return await ctx.db.query("tournaments").collect();
}

/**
 * Apply comprehensive filters to tournaments
 */
function applyTournamentFilters(
  tournaments: TournamentDoc[],
  filter: TournamentFilterOptions,
): TournamentDoc[] {
  return tournaments.filter((tournament) => {
    if (
      filter.startAfter !== undefined &&
      tournament.startDate <= filter.startAfter
    ) {
      return false;
    }
    if (
      filter.startBefore !== undefined &&
      tournament.startDate >= filter.startBefore
    ) {
      return false;
    }
    if (
      filter.endAfter !== undefined &&
      tournament.endDate <= filter.endAfter
    ) {
      return false;
    }
    if (
      filter.endBefore !== undefined &&
      tournament.endDate >= filter.endBefore
    ) {
      return false;
    }

    if (
      filter.livePlay !== undefined &&
      tournament.livePlay !== filter.livePlay
    ) {
      return false;
    }

    if (
      filter.currentRound !== undefined &&
      tournament.currentRound !== filter.currentRound
    ) {
      return false;
    }

    if (filter.searchTerm) {
      const searchTerm = filter.searchTerm.toLowerCase();
      const searchableText = [tournament.name].join(" ").toLowerCase();

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    if (
      filter.createdAfter !== undefined &&
      tournament._creationTime < filter.createdAfter
    ) {
      return false;
    }
    if (
      filter.createdBefore !== undefined &&
      tournament._creationTime > filter.createdBefore
    ) {
      return false;
    }
    if (
      filter.updatedAfter !== undefined &&
      (tournament.updatedAt || 0) < filter.updatedAfter
    ) {
      return false;
    }
    if (
      filter.updatedBefore !== undefined &&
      (tournament.updatedAt || 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Get sorting function based on sort options
 */
function getTournamentSortFunction(
  sort: TournamentSortOptions,
): TournamentSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "name":
      return (a: TournamentDoc, b: TournamentDoc) =>
        a.name.localeCompare(b.name) * sortOrder;
    case "startDate":
      return (a: TournamentDoc, b: TournamentDoc) =>
        (a.startDate - b.startDate) * sortOrder;
    case "endDate":
      return (a: TournamentDoc, b: TournamentDoc) =>
        (a.endDate - b.endDate) * sortOrder;
    case "status":
      return (a: TournamentDoc, b: TournamentDoc) =>
        (a.status || "").localeCompare(b.status || "") * sortOrder;
    case "createdAt":
      return (a: TournamentDoc, b: TournamentDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: TournamentDoc, b: TournamentDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    default:
      return undefined;
  }
}

/**
 * Enhance a single tournament with related data
 */
async function enhanceTournament(
  ctx: DatabaseContext,
  tournament: TournamentDoc,
  enhance: TournamentEnhancementOptions,
): Promise<EnhancedTournamentDoc> {
  const enhanced: EnhancedTournamentDoc = {
    ...tournament,
    dateRange: formatDateRange(tournament.startDate, tournament.endDate),
    duration: calculateTournamentDuration(
      tournament.startDate,
      tournament.endDate,
    ),
    calculatedStatus: getCalculatedStatus(
      tournament.startDate,
      tournament.endDate,
      tournament.status,
    ),
  };

  if (enhance.includeSeason) {
    const season = await ctx.db.get(tournament.seasonId);
    enhanced.season = season || undefined;
  }

  if (enhance.includeTier) {
    const tier = await ctx.db.get(tournament.tierId);
    enhanced.tier = tier || undefined;
  }

  if (enhance.includeCourse) {
    const course = await ctx.db.get(tournament.courseId);
    enhanced.course = course || undefined;
  }

  if (enhance.includeTeams) {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();
    enhanced.teams = teams;
    enhanced.teamCount = teams.length;
  }

  if (enhance.includeGolfers) {
    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();

    const golfers = await Promise.all(
      tournamentGolfers.map(async (tg) => {
        const golfer = await ctx.db.get(tg.golferId);
        return golfer ? { ...tg, golfer } : null;
      }),
    );
    enhanced.golfers = golfers.filter(Boolean) as Array<
      TournamentGolferDoc & { golfer: GolferDoc }
    >;
  }

  if (enhance.includeStatistics) {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();

    enhanced.statistics = {
      totalTeams: teams.length,
      activeTeams: teams.length,
      averageScore:
        teams.length > 0
          ? teams.reduce((sum, team) => sum + (team.points || 0), 0) /
            teams.length
          : 0,
      lowestScore:
        teams.length > 0
          ? Math.min(...teams.map((team) => team.points || Infinity))
          : 0,
      highestScore:
        teams.length > 0
          ? Math.max(...teams.map((team) => team.points || 0))
          : 0,
    };
  }

  return enhanced;
}

/**
 * Generate analytics for tournaments
 */
async function generateTournamentAnalytics(
  _ctx: DatabaseContext,
  tournaments: TournamentDoc[],
): Promise<AnalyticsResult> {
  return {
    total: tournaments.length,
    active: tournaments.filter((t) => t.status === "active").length,
    inactive: tournaments.filter((t) => t.status !== "active").length,
    statistics: {
      upcoming: tournaments.filter((t) => t.status === "upcoming").length,
      completed: tournaments.filter((t) => t.status === "completed").length,
      cancelled: tournaments.filter((t) => t.status === "cancelled").length,
      withLivePlay: tournaments.filter((t) => t.livePlay === true).length,
      averageDuration:
        tournaments.length > 0
          ? tournaments.reduce(
              (sum, t) =>
                sum + calculateTournamentDuration(t.startDate, t.endDate),
              0,
            ) / tournaments.length
          : 0,
    },
    breakdown: tournaments.reduce(
      (acc, tournament) => {
        const status = tournament.status || "unknown";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
}
