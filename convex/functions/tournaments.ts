/**
 * Tournament Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, internalQuery, mutation, internalMutation } from "../_generated/server";
import { requireAdmin } from "../auth";
import { processData } from "../utils/processData";
import {
  logAudit,
  computeChanges,
  extractDeleteMetadata,
} from "../utils/auditLog";
import { tournamentsValidators } from "../validators/tournaments";
import {
  applyTournamentFilters,
  calculateTournamentDuration,
  enhanceTournament,
  formatDateRange,
  generateTournamentAnalytics,
  getCalculatedStatus,
  getOptimizedTournaments,
  getPlayoffTournamentsBySeason,
  getTournamentSortFunction,
} from "../utils/tournaments";
import type { Doc, Id } from "../_generated/dataModel";
import type {
  DeleteResponse,
  TournamentDoc,
  GolferDoc,
  TournamentGolferDoc,
  TournamentEnhancementOptions,
  EnhancedTournamentDoc,
} from "../types/types";
import { isPlayoffTier } from "../utils";
import {
  TeamsCronGolferSnap,
  TeamsCronTournamentSnap,
} from "../types/cronJobs";
import { internal } from "../_generated/api";

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
  args: tournamentsValidators.args.createTournaments,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const options = args.options || {};
    const data = args.data;

    if (!options.skipValidation) {
      const validation = tournamentsValidators.validateTournamentData(data);

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
  args: tournamentsValidators.args.getTournaments,
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
export const getTournaments_Internal = internalQuery({
  args: tournamentsValidators.args.fetchTournamentOptions,
  handler: async (ctx, args) => {
    const now = parseInt(new Date().toISOString());
    if (args.tournamentId) {
      const tournament = await ctx.db.get(args.tournamentId);
      if (!tournament) return undefined;

      return await enhanceTournament(ctx, tournament, args || {});
    }
    if (args.tournamentIds) {
      const tournaments = await Promise.all(
        args.tournamentIds.map(async (id) => {
          const tournament = await ctx.db.get(id);
          return tournament
            ? await enhanceTournament(ctx, tournament, args || {})
            : undefined;
        }),
      );
      return tournaments.filter((t) => t !== undefined);
    }
    if (args.tournamentType === "active") {
      let tournament = await ctx.db
        .query("tournaments")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .first();
      if (!tournament) {
        tournament = await ctx.db
          .query("tournaments")
          .filter((q) =>
            q.and(
              q.eq(q.field("livePlay"), true),
              q.neq(q.field("status"), "completed"),
              q.neq(q.field("status"), "cancelled"),
            ),
          )
          .first();
        if (!tournament) {
          tournament = await ctx.db
            .query("tournaments")
            .withIndex("by_dates", (q) => q.lte("startDate", now))
            .filter((q) =>
              q.and(
                q.gte(q.field("endDate"), now),
                q.neq(q.field("status"), "completed"),
                q.neq(q.field("status"), "cancelled"),
              ),
            )
            .first();
        }
        if (!tournament) {
          return undefined;
        }
      }

      return await enhanceTournament(ctx, tournament, args || {});
    }
    if (args.tournamentType === "next") {
      let upcomingTournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_status", (q) => q.eq("status", "upcoming"))
        .collect();

      const future = upcomingTournaments.filter((t) => t.startDate > now);
      future.sort((a, b) => a.startDate - b.startDate);
      const nextTournament = future[0];
      if (!nextTournament) {
        return undefined;
      }

      return await enhanceTournament(ctx, nextTournament, args || {});
    }
    if (args.tournamentType === "recent") {
      let upcomingTournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_status", (q) => q.eq("status", "completed"))
        .collect();

      const future = upcomingTournaments.filter((t) => t.startDate > now);
      future.sort((a, b) => b.startDate - a.startDate);
      const nextTournament = future[0];
      if (!nextTournament) {
        return undefined;
      }

      return await enhanceTournament(ctx, nextTournament, args || {});
    }
    if (args.tournamentType === "completed") {
      let upcomingTournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_status", (q) => q.eq("status", "completed"))
        .collect();
      if (!upcomingTournaments.length) {
        return undefined;
      }
      if (args.seasonId) {
        upcomingTournaments = upcomingTournaments.filter(
          (t) => t.seasonId === args.seasonId,
        );
      }
      if (args.tierId) {
        upcomingTournaments = upcomingTournaments.filter(
          (t) => t.tierId === args.tierId,
        );
      }
      upcomingTournaments.sort((a, b) => a.startDate - b.startDate);

      return await Promise.all(
        upcomingTournaments.map((t) => enhanceTournament(ctx, t, args || {})),
      );
    }
    if (args.tournamentType === "upcoming") {
      let upcomingTournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_status", (q) => q.eq("status", "upcoming"))
        .collect();
      if (!upcomingTournaments.length) {
        return undefined;
      }
      if (args.seasonId) {
        upcomingTournaments = upcomingTournaments.filter(
          (t) => t.seasonId === args.seasonId,
        );
      }
      if (args.tierId) {
        upcomingTournaments = upcomingTournaments.filter(
          (t) => t.tierId === args.tierId,
        );
      }
      upcomingTournaments.sort((a, b) => a.startDate - b.startDate);

      return await Promise.all(
        upcomingTournaments.map((t) => enhanceTournament(ctx, t, args || {})),
      );
    }
    if (args.tournamentType === "all") {
      let upcomingTournaments = await ctx.db.query("tournaments").collect();
      if (!upcomingTournaments.length) {
        return undefined;
      }
      if (args.seasonId) {
        upcomingTournaments = upcomingTournaments.filter(
          (t) => t.seasonId === args.seasonId,
        );
      }
      if (args.tierId) {
        upcomingTournaments = upcomingTournaments.filter(
          (t) => t.tierId === args.tierId,
        );
      }
      upcomingTournaments.sort((a, b) => a.startDate - b.startDate);

      return await Promise.all(
        upcomingTournaments.map((t) => enhanceTournament(ctx, t, args || {})),
      );
    }
    return undefined;
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
  args: tournamentsValidators.args.getTournamentLeaderboardView,
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

    const seasonTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const tournamentStartById = new Map(
      seasonTournaments.map((t) => [t._id, t.startDate ?? 0]),
    );
    const currentTournamentStart = tournament.startDate ?? 0;
    const isPriorTournament = (tournamentId: Id<"tournaments">): boolean => {
      return (
        (tournamentStartById.get(tournamentId) ?? 0) < currentTournamentStart
      );
    };

    const tourCardIds = Array.from(new Set(teams.map((t) => t.tourCardId)));

    const pointsBeforeTournamentByTourCardId = new Map<
      Id<"tourCards">,
      number
    >();
    for (const tourCardId of tourCardIds) {
      const priorTeams = await ctx.db
        .query("teams")
        .withIndex("by_tour_card", (q) => q.eq("tourCardId", tourCardId))
        .collect();
      const pointsBeforeTournament = priorTeams
        .filter((t) => isPriorTournament(t.tournamentId))
        .reduce((sum, t) => sum + (t.points ?? 0), 0);
      pointsBeforeTournamentByTourCardId.set(
        tourCardId,
        pointsBeforeTournament,
      );
    }

    const tourCards = await Promise.all(
      tourCardIds.map((id) => ctx.db.get(id)),
    );
    const tourCardById = new Map(
      tourCards.filter(Boolean).map((tc) => [tc!._id, tc!]),
    );

    const teamsWithTourCard = teams.map((team) => ({
      ...team,
      pointsBeforeTournament:
        pointsBeforeTournamentByTourCardId.get(team.tourCardId) ?? 0,
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

    const leaderboardLastUpdatedAt =
      typeof tournament.leaderboardLastUpdatedAt === "number"
        ? tournament.leaderboardLastUpdatedAt
        : typeof tournament.updatedAt === "number"
          ? tournament.updatedAt
          : null;

    return {
      tournament: enhancedTournament,
      teams: teamsWithTourCard,
      golfers: golfersWithStats,
      tours,
      viewer,
      leaderboardLastUpdatedAt,
    };
  },
});

export const hasTournamentGolfers = query({
  args: tournamentsValidators.args.tournamentId,
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
  args: tournamentsValidators.args.tournamentId,
  handler: async (ctx, args) => {
    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
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
          rating: tg.rating ?? null,
        };
      })
      .filter(Boolean);
  },
});

/**
 * Frontend convenience: get all tournaments for simple list UIs.
 */
export const getAllTournaments = query({
  args: tournamentsValidators.args.getAllTournaments,
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
  args: tournamentsValidators.args.updateTournaments,
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
      const validation = tournamentsValidators.validateTournamentData(
        args.data,
      );
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
  args: tournamentsValidators.args.deleteTournaments,
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

export const markTournamentCompleted = internalMutation({
  args: tournamentsValidators.args.tournamentId,
  handler: async (ctx, args) => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    await ctx.db.patch(args.tournamentId, {
      status: "completed",
      currentRound: 5,
      livePlay: false,
      leaderboardLastUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});
