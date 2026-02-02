/**
 * Team Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { query, mutation } from "../_generated/server";
import { requireAdmin } from "../auth";
import { processData } from "../utils/processData";
import { formatCents } from "../utils/formatCents";
import {
  applyFilters,
  calculatePosition,
  calculateTeamScore,
  enhanceTeam,
  generateAnalytics,
  getOptimizedTeams,
  getSortFunction,
  hashStringToUint32,
  pickUniqueRandomNumbers,
  resolveTournamentForSeeding,
  resolveTourForTournamentSeason,
} from "../utils/teams";
import { requireTourCardOwner } from "../utils/tourCards";
import { teamsValidators } from "../validators/teams";
import type { Id } from "../_generated/dataModel";
import type { DeleteResponse, TeamDoc, GolferDoc } from "../types/types";

/**
 * Create teams with comprehensive options
 *
 * @example
 * Basic team creation
 * const team = await ctx.runMutation(api.functions.teams.createTeams, {
 *   data: {
 *     tournamentId: "tournament123",
 *     tourCardId: "tourcard456",
 *     golferIds: [1234, 5678, 9012, 3456, 7890, 1357],
 *     teamName: "My Dream Team"
 *   }
 * });
 *
 * With advanced options
 * const team = await ctx.runMutation(api.functions.teams.createTeams, {
 *   data: { ... },
 *   options: {
 *     skipValidation: false,
 *     setActive: true,
 *     returnEnhanced: true
 *   }
 * });
 */
export const createTeams = mutation({
  args: teamsValidators.args.createTeams,
  handler: async (ctx, args) => {
    const options = args.options || {};
    const data = args.data;

    if (!options.skipValidation) {
      const validation = teamsValidators.validateTeamData(data);

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }

      const existing = await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q
            .eq("tournamentId", data.tournamentId)
            .eq("tourCardId", data.tourCardId),
        )
        .first();

      if (existing) {
        throw new Error(
          "Team already exists for this tournament and tour card",
        );
      }

      const tournament = await ctx.db.get(data.tournamentId);
      if (!tournament) {
        throw new Error("Tournament not found");
      }

      const tourCard = await ctx.db.get(data.tourCardId);
      if (!tourCard) {
        throw new Error("Tour card not found");
      }

      await requireTourCardOwner(ctx, tourCard);
    }

    const teamId = await ctx.db.insert("teams", {
      ...data,
      updatedAt: Date.now(),
    });

    const team = await ctx.db.get(teamId);
    if (!team) throw new Error("Failed to retrieve created team");

    if (options.returnEnhanced) {
      return await enhanceTeam(ctx, team, {
        includeTournament: options.includeTournament,
        includeStatistics: options.includeStatistics,
        includeMember: options.includeMember,
      });
    }

    return team;
  },
});

/**
 * Get teams with comprehensive query options
 *
 * @example
 * Get single team by ID
 * const team = await ctx.runQuery(api.functions.teams.getTeams, {
 *   options: { id: "team123" }
 * });
 *
 * Get multiple teams by IDs
 * const teams = await ctx.runQuery(api.functions.teams.getTeams, {
 *   options: { ids: ["team1", "team2", "team3"] }
 * });
 *
 * Get teams with filtering, sorting, and pagination
 * const result = await ctx.runQuery(api.functions.teams.getTeams, {
 *   options: {
 *     filter: {
 *       tournamentId: "tournament123",
 *       minPoints: 100,
 *       hasTopTen: true
 *     },
 *     sort: {
 *       sortBy: "points",
 *       sortOrder: "desc"
 *     },
 *     pagination: {
 *       limit: 20,
 *       offset: 0
 *     },
 *     enhance: {
 *       includeTournament: true,
 *       includeMember: true,
 *       includeGolfers: true,
 *       includeStatistics: true
 *     }
 *   }
 * });
 */
export const getTeams = query({
  args: teamsValidators.args.getTeams,
  handler: async (ctx, args) => {
    const options = args.options || {};

    if (options.id) {
      const team = await ctx.db.get(options.id);
      if (!team) return null;

      return await enhanceTeam(ctx, team, options.enhance || {});
    }

    if (options.ids) {
      const teams = await Promise.all(
        options.ids.map(async (id) => {
          const team = await ctx.db.get(id);
          return team
            ? await enhanceTeam(ctx, team, options.enhance || {})
            : null;
        }),
      );
      return teams.filter(Boolean);
    }

    let teams = await getOptimizedTeams(ctx, options);

    teams = applyFilters(teams, options.filter || {});

    const processedTeams = processData(teams, {
      sort: getSortFunction(options.sort || {}),
      limit: options.pagination?.limit,
      skip: options.pagination?.offset,
    });

    if (options.enhance && Object.values(options.enhance).some(Boolean)) {
      const enhancedTeams = await Promise.all(
        processedTeams.map((team) =>
          enhanceTeam(ctx, team, options.enhance || {}),
        ),
      );

      if (options.includeAnalytics) {
        return {
          teams: enhancedTeams,
          analytics: await generateAnalytics(ctx, teams),
          meta: {
            total: teams.length,
            filtered: processedTeams.length,
            offset: options.pagination?.offset || 0,
            limit: options.pagination?.limit,
          },
        };
      }

      return enhancedTeams;
    }

    const basicTeams = processedTeams.map((team) => ({
      ...team,
      totalScore: calculateTeamScore([
        team.roundOne,
        team.roundTwo,
        team.roundThree,
        team.roundFour,
      ]),
      finalPosition: calculatePosition(team.score || 0, team.position),
      earningsFormatted: formatCents(team.earnings || 0),
    }));

    if (options.includeAnalytics) {
      return {
        teams: basicTeams,
        analytics: await generateAnalytics(ctx, teams),
        meta: {
          total: teams.length,
          filtered: basicTeams.length,
          offset: options.pagination?.offset || 0,
          limit: options.pagination?.limit,
        },
      };
    }

    return basicTeams;
  },
});

/**
 * Frontend convenience: get all teams for a tournament.
 */
export const getTournamentTeams = query({
  args: teamsValidators.args.getTournamentTeams,
  handler: async (ctx, args) => {
    return await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();
  },
});

/**
 * Paginated (cursor) version of getTournamentTeams.
 * Returns a single page of results and a continueCursor.
 */
export const getTournamentTeamsPage = query({
  args: teamsValidators.args.getTournamentTeamsPage,
  handler: async (ctx, args) => {
    const numItems = args.limit ?? 100;
    return await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .paginate({
        cursor: args.cursor ?? null,
        numItems,
      });
  },
});

/**
 * Admin utility: seed a tournament with "fake" teams based on tour cards.
 *
 * Creates up to one team per tour card (skipping ones that already have a team)
 * and assigns each team a random set of golfers from the tournament’s golfer pool.
 */
export const adminSeedTeamsForTournamentFromTourCards = mutation({
  args: teamsValidators.args.adminSeedTeamsForTournamentFromTourCards,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const tournament = await resolveTournamentForSeeding(ctx, {
      tournamentId: args.tournamentId,
      tournamentName: args.tournamentName,
      seasonId: args.seasonId,
    });

    const tour = await resolveTourForTournamentSeason(ctx, {
      seasonId: tournament.seasonId,
      tourId: args.tourId,
    });

    const golferCount = args.golferCount ?? 6;
    if (!Number.isInteger(golferCount) || golferCount <= 0) {
      throw new Error("golferCount must be a positive integer");
    }

    const maxTeams = args.maxTeams;
    if (
      maxTeams !== undefined &&
      (!Number.isInteger(maxTeams) || maxTeams <= 0)
    ) {
      throw new Error("maxTeams must be a positive integer");
    }

    const dryRun = args.dryRun ?? false;
    const skipExisting = args.skipExisting ?? true;
    const allowFallbackToAllGolfers = args.allowFallbackToAllGolfers ?? true;

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_tour_season", (q) =>
        q.eq("tourId", tour._id).eq("seasonId", tournament.seasonId),
      )
      .collect();

    if (tourCards.length === 0) {
      throw new Error(
        `No tour cards found for tour ${tour.shortForm} in this tournament’s season`,
      );
    }

    const existingTeams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();
    const existingTeamTourCardIds = new Set(
      existingTeams.map((t) => t.tourCardId),
    );

    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();

    let golferApiIds: number[] = [];
    let golferPoolSource: "tournamentGolfers" | "allGolfers" =
      "tournamentGolfers";

    if (tournamentGolfers.length > 0) {
      const uniqueGolferDocIds = Array.from(
        new Set(tournamentGolfers.map((tg) => tg.golferId)),
      );
      const golferDocs = await Promise.all(
        uniqueGolferDocIds.map((id) => ctx.db.get(id)),
      );

      golferApiIds = golferDocs
        .filter((g): g is GolferDoc => Boolean(g))
        .map((g) => g.apiId)
        .filter((apiId) => Number.isInteger(apiId) && apiId > 0);
    } else if (allowFallbackToAllGolfers) {
      const golfers = await ctx.db.query("golfers").collect();
      golferApiIds = golfers
        .map((g) => g.apiId)
        .filter((apiId) => Number.isInteger(apiId) && apiId > 0);
      golferPoolSource = "allGolfers";
    } else {
      throw new Error(
        "No tournament golfers found for this tournament. Sync golfers first.",
      );
    }

    if (golferApiIds.length < golferCount) {
      throw new Error(
        `Not enough golfers in pool (${golferApiIds.length}) to select ${golferCount} unique golfers`,
      );
    }

    const createdTeamIds: Id<"teams">[] = [];
    let created = 0;
    let skipped = 0;

    const baseSeed = Number.isFinite(args.seed) ? (args.seed as number) : 1;
    const targetTourCards =
      maxTeams === undefined ? tourCards : tourCards.slice(0, maxTeams);

    for (const tourCard of targetTourCards) {
      if (existingTeamTourCardIds.has(tourCard._id)) {
        if (!skipExisting) {
          throw new Error(
            `Team already exists for tourCardId ${tourCard._id} in tournament ${tournament._id}`,
          );
        }
        skipped++;
        continue;
      }

      const teamGolferIds = pickUniqueRandomNumbers(
        golferApiIds,
        golferCount,
        hashStringToUint32(`${tournament._id}:${tourCard._id}`) + baseSeed,
      );

      if (!dryRun) {
        const teamId = await ctx.db.insert("teams", {
          tournamentId: tournament._id,
          tourCardId: tourCard._id,
          golferIds: teamGolferIds,
          updatedAt: Date.now(),
        });
        createdTeamIds.push(teamId);
      }

      created++;
    }

    return {
      tournamentId: tournament._id,
      tournamentName: tournament.name,
      seasonId: tournament.seasonId,
      tourId: tour._id,
      tourShortForm: tour.shortForm,
      golferPoolSource,
      golferPoolSize: golferApiIds.length,
      totalTourCards: tourCards.length,
      created,
      skipped,
      dryRun,
      createdTeamIds,
    };
  },
});

/**
 * Paginated (cursor) teams query using only indexable filters.
 * This avoids unbounded collects for large tables.
 */
export const getTeamsPage = query({
  args: teamsValidators.args.getTeamsPage,
  handler: async (ctx, args) => {
    const numItems = args.limit ?? 100;
    const { tournamentId, tourCardId } = args.filter;

    if (tournamentId && tourCardId) {
      return await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q.eq("tournamentId", tournamentId).eq("tourCardId", tourCardId),
        )
        .paginate({ cursor: args.cursor ?? null, numItems });
    }

    if (tournamentId) {
      return await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
        .paginate({ cursor: args.cursor ?? null, numItems });
    }

    if (tourCardId) {
      return await ctx.db
        .query("teams")
        .withIndex("by_tour_card", (q) => q.eq("tourCardId", tourCardId))
        .paginate({ cursor: args.cursor ?? null, numItems });
    }

    throw new Error(
      "getTeamsPage requires filter.tournamentId and/or filter.tourCardId",
    );
  },
});

/**
 * Frontend convenience: return TourCards sorted for standings.
 */
export const getSeasonStandings = query({
  args: teamsValidators.args.getSeasonStandings,
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tourCards")
      .withIndex("by_season_points", (q) => q.eq("seasonId", args.seasonId))
      .order("desc")
      .collect();
  },
});

export const getChampionshipWinsForMember = query({
  args: teamsValidators.args.getChampionshipWinsForMember,
  handler: async (ctx, args) => {
    const tourCards = args.seasonId
      ? await ctx.db
          .query("tourCards")
          .withIndex("by_member_season", (q) =>
            q.eq("memberId", args.memberId).eq("seasonId", args.seasonId!),
          )
          .collect()
      : await ctx.db
          .query("tourCards")
          .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
          .collect();

    if (tourCards.length === 0) return [];

    const tourCardIds = new Set(tourCards.map((tc) => tc._id));
    const seasonIds = args.seasonId
      ? [args.seasonId]
      : Array.from(new Set(tourCards.map((tc) => tc.seasonId)));

    const majorNames = new Set([
      "The Masters",
      "PGA Championship",
      "U.S. Open",
      "The Open Championship",
    ]);

    const playoffEventNames = [
      "FedEx-St. Jude Championship",
      "BMW Championship",
      "TOUR Championship",
    ];

    const now = Date.now();
    const winsByTournamentId = new Map<
      Id<"tournaments">,
      {
        tournamentId: Id<"tournaments">;
        name: string;
        logoUrl: string | null;
        startDate: number;
        seasonId: Id<"seasons">;
        tierName: string | null;
      }
    >();

    for (const seasonId of seasonIds) {
      const [tiers, tournaments] = await Promise.all([
        ctx.db
          .query("tiers")
          .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
          .collect(),
        ctx.db
          .query("tournaments")
          .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
          .collect(),
      ]);

      const tierNameById = new Map(tiers.map((t) => [t._id, t.name] as const));
      const playoffTierIds = new Set(
        tiers
          .filter((t) => t.name.toLowerCase().includes("playoff"))
          .map((t) => t._id),
      );

      const relevantTournaments = tournaments.filter((t) => {
        const lowerName = t.name.toLowerCase();
        const isCanadianOpen = lowerName.includes("canadian open");
        const isMajor = majorNames.has(t.name);
        const isPlayoffByTier = playoffTierIds.has(t.tierId);
        const isPlayoffByName = playoffEventNames.some((n) => n === t.name);
        const isFinished = t.status === "completed" || t.endDate <= now;
        return (
          (isCanadianOpen || isMajor || isPlayoffByTier || isPlayoffByName) &&
          isFinished
        );
      });

      for (const tournament of relevantTournaments) {
        const [pos1, posT1] = await Promise.all([
          ctx.db
            .query("teams")
            .withIndex("by_tournament_position", (q) =>
              q.eq("tournamentId", tournament._id).eq("position", "1"),
            )
            .collect(),
          ctx.db
            .query("teams")
            .withIndex("by_tournament_position", (q) =>
              q.eq("tournamentId", tournament._id).eq("position", "T1"),
            )
            .collect(),
        ]);

        const winners = [...pos1, ...posT1];
        const userWon = winners.some((team) =>
          tourCardIds.has(team.tourCardId),
        );
        if (!userWon) continue;

        winsByTournamentId.set(tournament._id, {
          tournamentId: tournament._id,
          name: tournament.name,
          logoUrl: tournament.logoUrl ?? null,
          startDate: tournament.startDate,
          seasonId: tournament.seasonId,
          tierName: tierNameById.get(tournament.tierId) ?? null,
        });
      }
    }

    return Array.from(winsByTournamentId.values()).sort(
      (a, b) => b.startDate - a.startDate,
    );
  },
});

/**
 * Update teams with comprehensive options
 *
 * @example
 * Basic update
 * const updatedTeam = await ctx.runMutation(api.functions.teams.updateTeams, {
 *   teamId: "team123",
 *   data: { points: 150, earnings: 25000, position: "T5" }
 * });
 *
 * Advanced update with options
 * const result = await ctx.runMutation(api.functions.teams.updateTeams, {
 *   teamId: "team123",
 *   data: { points: 175 },
 *   options: {
 *     skipValidation: false,
 *     updateTimestamp: true,
 *     returnEnhanced: true,
 *     includeStatistics: true
 *   }
 * });
 */
export const updateTeams = mutation({
  args: teamsValidators.args.updateTeams,
  handler: async (ctx, args) => {
    const options = args.options || {};
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const tourCard = await ctx.db.get(team.tourCardId);
    if (!tourCard) throw new Error("Tour card not found");
    await requireTourCardOwner(ctx, tourCard);

    if (!options.skipValidation) {
      const validation = teamsValidators.validateTeamData(args.data);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
      }
    }

    const updateData: Partial<TeamDoc> = { ...args.data };
    if (options.updateTimestamp !== false) {
      updateData.updatedAt = Date.now();
    }

    await ctx.db.patch(args.teamId, updateData);

    const updatedTeam = await ctx.db.get(args.teamId);
    if (!updatedTeam) throw new Error("Failed to retrieve updated team");

    if (options.returnEnhanced) {
      return await enhanceTeam(ctx, updatedTeam, {
        includeTournament: options.includeTournament,
        includeStatistics: options.includeStatistics,
        includeMember: options.includeMember,
        includeGolfers: options.includeGolfers,
      });
    }

    return updatedTeam;
  },
});

/**
 * Delete teams (hard delete only)
 *
 * This function always performs a hard delete (permanent removal from database).
 * The softDelete option is kept for backward compatibility but is ignored.
 *
 * @example
 * Delete team
 * const result = await ctx.runMutation(api.functions.teams.deleteTeams, {
 *   teamId: "team123"
 * });
 */
export const deleteTeams = mutation({
  args: teamsValidators.args.deleteTeams,
  handler: async (ctx, args): Promise<DeleteResponse<TeamDoc>> => {
    const options = args.options || {};
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const tourCard = await ctx.db.get(team.tourCardId);
    if (!tourCard) throw new Error("Tour card not found");
    await requireTourCardOwner(ctx, tourCard);

    let deletedTeamData: TeamDoc | undefined = undefined;

    if (options.returnDeletedData) {
      deletedTeamData = team;
    }

    await ctx.db.delete(args.teamId);
    return {
      success: true,
      deleted: true,
      deactivated: false,
      deletedData: deletedTeamData,
    };
  },
});
