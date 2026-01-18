/**
 * Team Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import {
  query,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { v } from "convex/values";
import { requireOwnResource } from "../auth";
import { processData, formatCents, sumArray, validators } from "./_utils";
import type { Id } from "../_generated/dataModel";
import type {
  ValidationResult,
  AnalyticsResult,
  DeleteResponse,
  TeamDoc,
  EnhancedTeamDoc,
  GolferDoc,
  TeamSortFunction,
  DatabaseContext,
  TeamFilterOptions,
  TeamOptimizedQueryOptions,
  TeamEnhancementOptions,
  TeamSortOptions,
} from "../types/types";

/**
 * Validate team data
 */
function validateTeamData(data: {
  golferIds?: number[];
  earnings?: number;
  points?: number;
  score?: number;
  round?: number;
  position?: string;
}): ValidationResult {
  const errors: string[] = [];

  if (data.golferIds && data.golferIds.length === 0) {
    errors.push("At least one golfer must be selected");
  }

  if (
    data.golferIds &&
    data.golferIds.some((id) => !Number.isInteger(id) || id <= 0)
  ) {
    errors.push("All golfer IDs must be positive integers");
  }

  const earningsErr = validators.positiveNumber(data.earnings, "Earnings");
  if (earningsErr) errors.push(earningsErr);

  const pointsErr = validators.positiveNumber(data.points, "Points");
  if (pointsErr) errors.push(pointsErr);

  const roundErr = validators.numberRange(data.round, 1, 4, "Round");
  if (roundErr) errors.push(roundErr);

  return { isValid: errors.length === 0, errors };
}

/**
 * Calculate team score relative to par
 */
function calculateTeamScore(rounds: (number | undefined)[]): number {
  const validRounds = rounds.filter(
    (round): round is number => round !== undefined && !isNaN(round),
  );
  return sumArray(validRounds);
}

/**
 * Determine final position from score and leaderboard data
 */
function calculatePosition(_score: number, position?: string): number {
  if (position && position !== "CUT") {
    const pos = parseInt(position);
    if (!isNaN(pos)) return pos;
  }
  return 999;
}

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
  args: {
    data: v.object({
      tournamentId: v.id("tournaments"),
      tourCardId: v.id("tourCards"),
      golferIds: v.array(v.number()),
      earnings: v.optional(v.number()),
      points: v.optional(v.number()),
      makeCut: v.optional(v.number()),
      position: v.optional(v.string()),
      pastPosition: v.optional(v.string()),
      score: v.optional(v.number()),
      topTen: v.optional(v.number()),
      topFive: v.optional(v.number()),
      topThree: v.optional(v.number()),
      win: v.optional(v.number()),
      today: v.optional(v.number()),
      thru: v.optional(v.number()),
      round: v.optional(v.number()),
      roundOneTeeTime: v.optional(v.string()),
      roundOne: v.optional(v.number()),
      roundTwoTeeTime: v.optional(v.string()),
      roundTwo: v.optional(v.number()),
      roundThreeTeeTime: v.optional(v.string()),
      roundThree: v.optional(v.number()),
      roundFourTeeTime: v.optional(v.string()),
      roundFour: v.optional(v.number()),
    }),
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        setActive: v.optional(v.boolean()),
        returnEnhanced: v.optional(v.boolean()),
        includeStatistics: v.optional(v.boolean()),
        includeTournament: v.optional(v.boolean()),
        includeMember: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};
    const data = args.data;

    if (!options.skipValidation) {
      const validation = validateTeamData(data);

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

      await requireTourCardOwner(ctx, tourCard._id);
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
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("teams")),
        ids: v.optional(v.array(v.id("teams"))),
        filter: v.optional(
          v.object({
            tournamentId: v.optional(v.id("tournaments")),
            tourCardId: v.optional(v.id("tourCards")),
            minEarnings: v.optional(v.number()),
            maxEarnings: v.optional(v.number()),
            minPoints: v.optional(v.number()),
            maxPoints: v.optional(v.number()),
            minScore: v.optional(v.number()),
            maxScore: v.optional(v.number()),
            position: v.optional(v.string()),
            round: v.optional(v.number()),
            makeCut: v.optional(v.number()),
            hasTopTen: v.optional(v.boolean()),
            hasWin: v.optional(v.boolean()),
            golferCount: v.optional(v.number()),
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
                v.literal("earnings"),
                v.literal("points"),
                v.literal("score"),
                v.literal("position"),
                v.literal("today"),
                v.literal("round"),
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
            includeTournament: v.optional(v.boolean()),
            includeTourCard: v.optional(v.boolean()),
            includeMember: v.optional(v.boolean()),
            includeGolfers: v.optional(v.boolean()),
            includeStatistics: v.optional(v.boolean()),
            includeRounds: v.optional(v.boolean()),
          }),
        ),
        activeOnly: v.optional(v.boolean()),
        tournamentOnly: v.optional(v.boolean()),
        includeAnalytics: v.optional(v.boolean()),
      }),
    ),
  },
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
  args: {
    tournamentId: v.id("tournaments"),
  },
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
  args: {
    tournamentId: v.id("tournaments"),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
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
 * Paginated (cursor) teams query using only indexable filters.
 * This avoids unbounded collects for large tables.
 */
export const getTeamsPage = query({
  args: {
    filter: v.object({
      tournamentId: v.optional(v.id("tournaments")),
      tourCardId: v.optional(v.id("tourCards")),
    }),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
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
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tourCards")
      .withIndex("by_season_points", (q) => q.eq("seasonId", args.seasonId))
      .order("desc")
      .collect();
  },
});

export const getChampionshipWinsForMember = query({
  args: {
    memberId: v.id("members"),
    seasonId: v.optional(v.id("seasons")),
  },
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
        return (isCanadianOpen || isMajor || isPlayoffByTier || isPlayoffByName) &&
          isFinished;
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
        const userWon = winners.some((team) => tourCardIds.has(team.tourCardId));
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
  args: {
    teamId: v.id("teams"),
    data: v.object({
      golferIds: v.optional(v.array(v.number())),
      earnings: v.optional(v.number()),
      points: v.optional(v.number()),
      makeCut: v.optional(v.number()),
      position: v.optional(v.string()),
      pastPosition: v.optional(v.string()),
      score: v.optional(v.number()),
      topTen: v.optional(v.number()),
      topFive: v.optional(v.number()),
      topThree: v.optional(v.number()),
      win: v.optional(v.number()),
      today: v.optional(v.number()),
      thru: v.optional(v.number()),
      round: v.optional(v.number()),
      roundOneTeeTime: v.optional(v.string()),
      roundOne: v.optional(v.number()),
      roundTwoTeeTime: v.optional(v.string()),
      roundTwo: v.optional(v.number()),
      roundThreeTeeTime: v.optional(v.string()),
      roundThree: v.optional(v.number()),
      roundFourTeeTime: v.optional(v.string()),
      roundFour: v.optional(v.number()),
    }),
    options: v.optional(
      v.object({
        skipValidation: v.optional(v.boolean()),
        updateTimestamp: v.optional(v.boolean()),
        returnEnhanced: v.optional(v.boolean()),
        includeStatistics: v.optional(v.boolean()),
        includeTournament: v.optional(v.boolean()),
        includeMember: v.optional(v.boolean()),
        includeGolfers: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options || {};
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const tourCard = await ctx.db.get(team.tourCardId);
    if (!tourCard) throw new Error("Tour card not found");
    await requireTourCardOwner(ctx, tourCard._id);

    if (!options.skipValidation) {
      const validation = validateTeamData(args.data);
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
  args: {
    teamId: v.id("teams"),
    options: v.optional(
      v.object({
        softDelete: v.optional(v.boolean()),
        returnDeletedData: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<DeleteResponse<TeamDoc>> => {
    const options = args.options || {};
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const tourCard = await ctx.db.get(team.tourCardId);
    if (!tourCard) throw new Error("Tour card not found");
    await requireTourCardOwner(ctx, tourCard._id);

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

/**
 * Get optimized teams based on query options using indexes
 */
async function getOptimizedTeams(
  ctx: DatabaseContext,
  options: TeamOptimizedQueryOptions,
): Promise<TeamDoc[]> {
  const filter = options.filter || {};

  if (filter.tournamentId && filter.tourCardId) {
    return await ctx.db
      .query("teams")
      .withIndex("by_tournament_tour_card", (q) =>
        q
          .eq("tournamentId", filter.tournamentId!)
          .eq("tourCardId", filter.tourCardId!),
      )
      .collect();
  }

  if (filter.tournamentId) {
    return await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", filter.tournamentId!),
      )
      .collect();
  }

  if (filter.tourCardId) {
    return await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", filter.tourCardId!))
      .collect();
  }

  return await ctx.db.query("teams").collect();
}

/**
 * Apply comprehensive filters to teams
 */
function applyFilters(teams: TeamDoc[], filter: TeamFilterOptions): TeamDoc[] {
  const {
    minEarnings,
    maxEarnings,
    minPoints,
    maxPoints,
    minScore,
    maxScore,
    position,
    round,
    makeCut,
    hasTopTen,
    hasWin,
    golferCount,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
  } = filter;

  return teams.filter((team) => {
    if (minEarnings !== undefined && (team.earnings || 0) < minEarnings) {
      return false;
    }
    if (maxEarnings !== undefined && (team.earnings || 0) > maxEarnings) {
      return false;
    }

    if (minPoints !== undefined && (team.points || 0) < minPoints) {
      return false;
    }
    if (maxPoints !== undefined && (team.points || 0) > maxPoints) {
      return false;
    }

    if (minScore !== undefined && (team.score || 999) < minScore) {
      return false;
    }
    if (maxScore !== undefined && (team.score || 999) > maxScore) {
      return false;
    }

    if (position && team.position !== position) {
      return false;
    }

    if (round !== undefined && team.round !== round) {
      return false;
    }

    if (makeCut !== undefined && team.makeCut !== makeCut) {
      return false;
    }

    if (hasTopTen !== undefined) {
      const teamHasTopTen = (team.topTen ?? 0) > 0;
      if (teamHasTopTen !== hasTopTen) {
        return false;
      }
    }

    if (hasWin !== undefined) {
      const teamHasWin = (team.win ?? 0) > 0;
      if (teamHasWin !== hasWin) {
        return false;
      }
    }

    if (golferCount !== undefined && team.golferIds.length !== golferCount) {
      return false;
    }

    if (createdAfter !== undefined && team._creationTime < createdAfter) {
      return false;
    }
    if (createdBefore !== undefined && team._creationTime > createdBefore) {
      return false;
    }
    if (updatedAfter !== undefined && (team.updatedAt || 0) < updatedAfter) {
      return false;
    }
    if (updatedBefore !== undefined && (team.updatedAt || 0) > updatedBefore) {
      return false;
    }

    return true;
  });
}

/**
 * Get sorting function based on sort options
 */
function getSortFunction(sort: TeamSortOptions): TeamSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "earnings":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.earnings || 0) - (b.earnings || 0)) * sortOrder;
    case "points":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.points || 0) - (b.points || 0)) * sortOrder;
    case "score":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.score || 999) - (b.score || 999)) * sortOrder;
    case "position":
      return (a: TeamDoc, b: TeamDoc) => {
        const posA = calculatePosition(a.score || 999, a.position);
        const posB = calculatePosition(b.score || 999, b.position);
        return (posA - posB) * sortOrder;
      };
    case "today":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.today || 0) - (b.today || 0)) * sortOrder;
    case "round":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.round || 0) - (b.round || 0)) * sortOrder;
    case "createdAt":
      return (a: TeamDoc, b: TeamDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    default:
      return undefined;
  }
}

/**
 * Enhance a single team with related data
 */
async function enhanceTeam(
  ctx: DatabaseContext,
  team: TeamDoc,
  enhance: TeamEnhancementOptions,
): Promise<EnhancedTeamDoc> {
  const enhanced: EnhancedTeamDoc = {
    ...team,
    totalScore: calculateTeamScore([
      team.roundOne,
      team.roundTwo,
      team.roundThree,
      team.roundFour,
    ]),
    finalPosition: calculatePosition(team.score || 0, team.position),
    earningsFormatted: formatCents(team.earnings || 0),
  };

  if (enhance.includeTournament) {
    const tournament = await ctx.db.get(team.tournamentId);
    enhanced.tournament = tournament || undefined;
  }

  if (enhance.includeTourCard || enhance.includeMember) {
    const tourCard = await ctx.db.get(team.tourCardId);
    if (tourCard) {
      enhanced.tourCard = tourCard;

      if (enhance.includeMember) {
        const member = await ctx.db.get(tourCard.memberId);
        enhanced.member = member || undefined;
      }
    }
  }

  if (enhance.includeGolfers) {
    const golfers = await Promise.all(
      team.golferIds.map(async (golferId) => {
        const golfer = await ctx.db
          .query("golfers")
          .withIndex("by_api_id", (q) => q.eq("apiId", golferId))
          .first();
        return golfer;
      }),
    );
    enhanced.golfers = golfers.filter((g): g is GolferDoc => g !== null);
  }

  if (enhance.includeStatistics) {
    const teamHistory = await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", team.tourCardId))
      .collect();

    const validScores = teamHistory
      .map((t) => t.score)
      .filter(
        (score): score is number => score !== undefined && score !== null,
      );

    enhanced.statistics = {
      averageScore:
        validScores.length > 0
          ? validScores.reduce((sum, score) => sum + score, 0) /
            validScores.length
          : 0,
      bestRound:
        Math.min(
          ...[
            team.roundOne,
            team.roundTwo,
            team.roundThree,
            team.roundFour,
          ].filter((r): r is number => r !== undefined),
        ) || 0,
      worstRound:
        Math.max(
          ...[
            team.roundOne,
            team.roundTwo,
            team.roundThree,
            team.roundFour,
          ].filter((r): r is number => r !== undefined),
        ) || 0,
      cutsMade: teamHistory.filter((t) => t.makeCut === 1).length,
      totalTournaments: teamHistory.length,
      totalEarnings: teamHistory.reduce((sum, t) => sum + (t.earnings || 0), 0),
      totalPoints: teamHistory.reduce((sum, t) => sum + (t.points || 0), 0),
      averagePosition:
        teamHistory.length > 0
          ? teamHistory.reduce((sum, t) => {
              const pos = calculatePosition(t.score || 999, t.position);
              return sum + pos;
            }, 0) / teamHistory.length
          : 999,
    };
  }

  return enhanced;
}

async function requireTourCardOwner(
  ctx: MutationCtx | QueryCtx,
  tourCardId: Id<"tourCards">,
) {
  const tourCard = await ctx.db.get(tourCardId);
  const member = tourCard ? await ctx.db.get(tourCard.memberId) : null;
  const clerkId = member?.clerkId;
  if (!clerkId) {
    throw new Error("Unauthorized: Tour card owner is not linked to Clerk");
  }
  await requireOwnResource(ctx, clerkId);
}

/**
 * Generate analytics for teams
 */
async function generateAnalytics(
  _ctx: DatabaseContext,
  teams: TeamDoc[],
): Promise<AnalyticsResult> {
  const activeTeams = teams;
  const totalEarnings = teams.reduce(
    (sum, team) => sum + (team.earnings || 0),
    0,
  );
  const totalPoints = teams.reduce((sum, team) => sum + (team.points || 0), 0);

  return {
    total: teams.length,
    active: activeTeams.length,
    inactive: 0,
    statistics: {
      averageEarnings: teams.length > 0 ? totalEarnings / teams.length : 0,
      totalEarnings,
      averagePoints: teams.length > 0 ? totalPoints / teams.length : 0,
      totalPoints,
      cutsMade: teams.filter((team) => team.makeCut === 1).length,
      averageScore:
        teams.length > 0
          ? teams.reduce((sum, team) => sum + (team.score || 999), 0) /
            teams.length
          : 0,
    },
    breakdown: teams.reduce(
      (acc, team) => {
        const key = team.position || "No Position";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
}
