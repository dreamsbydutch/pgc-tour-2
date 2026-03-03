/**
 * Tournament Management - Simplified CRUD Functions
 *
 * Clean CRUD operations with comprehensive options objects.
 * Each function (create, get, update, delete) handles all use cases
 * through flexible configuration rather than multiple specialized functions.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/**
 * HELPER
 * Gets all teams and golfers from the first playoff tournament and duplicates them into the current playoff tournament
 * args : {
 *    currentTournamentId,
 *    previousPlayoffTournamentId
 * }
 */
export const duplicateFromPreviousPlayoff = internalMutation({
  args: {
    currentTournamentId: v.id("tournaments"),
    previousPlayoffTournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const tournamentGolfersFrompreviousPlayoffTournament = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.previousPlayoffTournamentId),
      )
      .collect();

    const teamsFrompreviousPlayoffTournament = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.previousPlayoffTournamentId),
      )
      .collect();

    let golfersCopied = 0;
    let teamsCopied = 0;
    const groupSet = new Set<number>();

    for (const tg of tournamentGolfersFrompreviousPlayoffTournament) {
      if (tg.group) groupSet.add(tg.group);

      const tournamentGolfersFromCurrentTournament = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q
            .eq("golferId", tg.golferId)
            .eq("tournamentId", args.currentTournamentId),
        )
        .first();
      if (tournamentGolfersFromCurrentTournament) continue;

      await ctx.db.insert("tournamentGolfers", {
        golferId: tg.golferId,
        tournamentId: args.currentTournamentId,
        group: tg.group,
        rating: tg.rating,
        worldRank: tg.worldRank,
        updatedAt: Date.now(),
      });
      golfersCopied += 1;
    }

    for (const team of teamsFrompreviousPlayoffTournament) {
      const teamFromCurrentTournament = await ctx.db
        .query("teams")
        .withIndex("by_tournament_tour_card", (q) =>
          q
            .eq("tournamentId", args.currentTournamentId)
            .eq("tourCardId", team.tourCardId),
        )
        .first();
      if (teamFromCurrentTournament) continue;

      await ctx.db.insert("teams", {
        tournamentId: args.currentTournamentId,
        tourCardId: team.tourCardId,
        golferIds: team.golferIds,
        score: team.score,
        position: team.position,
        pastPosition: team.pastPosition,
        updatedAt: Date.now(),
      });
      teamsCopied += 1;
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: args.currentTournamentId,
      copiedFromTournamentId: args.previousPlayoffTournamentId,
      golfersCopied,
      teamsCopied,
      groupsCreated: groupSet.size,
    } as const;
  },
});

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

export const getTournaments = query({
  args: {
    options: v.optional(
      v.object({
        filter: v.optional(
          v.object({
            seasonId: v.optional(v.id("seasons")),
            status: v.optional(
              v.union(
                v.literal("upcoming"),
                v.literal("active"),
                v.literal("completed"),
                v.literal("cancelled"),
              ),
            ),
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
              ),
            ),
            sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
          }),
        ),
        enhance: v.optional(
          v.object({
            includeCourse: v.optional(v.boolean()),
            includeTier: v.optional(v.boolean()),
            includeSeason: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options ?? {};
    const filter = options.filter ?? {};
    const sort = options.sort ?? {};
    const enhance = options.enhance ?? {};

    let tournaments: Doc<"tournaments">[];

    if (filter.seasonId) {
      tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", filter.seasonId!))
        .collect();
    } else if (filter.status) {
      tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_status", (q) => q.eq("status", filter.status!))
        .collect();
    } else {
      tournaments = await ctx.db.query("tournaments").collect();
    }

    let filtered = tournaments;
    if (filter.status) {
      filtered = filtered.filter((t) => t.status === filter.status);
    }

    const sortOrder = sort.sortOrder === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const sortBy = sort.sortBy ?? "startDate";
      if (sortBy === "name") {
        return a.name.localeCompare(b.name) * sortOrder;
      }
      if (sortBy === "endDate") {
        return (a.endDate - b.endDate) * sortOrder;
      }
      if (sortBy === "status") {
        return (a.status ?? "").localeCompare(b.status ?? "") * sortOrder;
      }
      return (a.startDate - b.startDate) * sortOrder;
    });

    if (
      !enhance.includeCourse &&
      !enhance.includeTier &&
      !enhance.includeSeason
    ) {
      return sorted;
    }

    return await Promise.all(
      sorted.map(async (tournament) => ({
        ...tournament,
        course: enhance.includeCourse
          ? ((await ctx.db.get(tournament.courseId)) ?? undefined)
          : undefined,
        tier: enhance.includeTier
          ? ((await ctx.db.get(tournament.tierId)) ?? undefined)
          : undefined,
        season: enhance.includeSeason
          ? ((await ctx.db.get(tournament.seasonId)) ?? undefined)
          : undefined,
      })),
    );
  },
});

export const getTournamentLeaderboardView = query({
  args: {
    tournamentId: v.optional(v.id("tournaments")),
    memberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const allTournaments = await ctx.db.query("tournaments").collect();
    const now = Date.now();

    let tournament = args.tournamentId
      ? await ctx.db.get(args.tournamentId)
      : null;

    if (!tournament) {
      tournament =
        allTournaments.find((t) => t.status === "active") ??
        allTournaments.find((t) => t.startDate <= now && t.endDate >= now) ??
        [...allTournaments]
          .filter((t) => t.startDate > now)
          .sort((a, b) => a.startDate - b.startDate)[0] ??
        [...allTournaments]
          .filter((t) => t.endDate < now)
          .sort((a, b) => b.endDate - a.endDate)[0] ??
        null;
    }

    if (!tournament) {
      return {
        tournament: null,
        tours: [],
        teams: [],
        golfers: [],
        allTournaments: [],
        userTourCard: null,
      };
    }

    const seasonTournaments = allTournaments
      .filter((t) => t.seasonId === tournament.seasonId)
      .sort((a, b) => b.startDate - a.startDate);

    const tours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();

    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();

    const teamTourCards = await Promise.all(
      teams.map((team) => ctx.db.get(team.tourCardId)),
    );

    const enhancedTeams = teams.map((team, index) => {
      const card = teamTourCards[index];
      return {
        ...team,
        tourId: card?.tourId,
        displayName: card?.displayName,
        memberId: card?.memberId,
        playoff: card?.playoff,
      };
    });

    const golferDocs = await Promise.all(
      tournamentGolfers.map((tg) => ctx.db.get(tg.golferId)),
    );

    const enhancedGolfers = tournamentGolfers.map((tg, index) => {
      const golfer = golferDocs[index];
      return {
        ...tg,
        apiId: golfer?.apiId,
        playerName: golfer?.playerName,
        country: golfer?.country,
        worldRank: tg.worldRank ?? golfer?.worldRank,
      };
    });

    let userTourCard = null;
    if (args.memberId) {
      userTourCard = await ctx.db
        .query("tourCards")
        .withIndex("by_member_season", (q) =>
          q.eq("memberId", args.memberId!).eq("seasonId", tournament.seasonId),
        )
        .first();
    }

    return {
      tournament,
      tours,
      teams: enhancedTeams,
      golfers: enhancedGolfers,
      allTournaments: seasonTournaments,
      userTourCard,
    };
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

    const pickPool = await Promise.all(
      tournamentGolfers.map(async (tournamentGolfer) => {
        const golfer = await ctx.db.get(tournamentGolfer.golferId);
        if (!golfer) return null;

        return {
          golferApiId: golfer.apiId,
          playerName: golfer.playerName,
          group: tournamentGolfer.group ?? null,
          worldRank: tournamentGolfer.worldRank ?? golfer.worldRank ?? null,
          rating: tournamentGolfer.rating ?? null,
        };
      }),
    );

    return pickPool
      .filter((row) => row !== null)
      .sort((a, b) => {
        const groupA = a.group ?? Number.MAX_SAFE_INTEGER;
        const groupB = b.group ?? Number.MAX_SAFE_INTEGER;

        if (groupA !== groupB) return groupA - groupB;

        const rankA = a.worldRank ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.worldRank ?? Number.MAX_SAFE_INTEGER;

        if (rankA !== rankB) return rankA - rankB;

        return a.playerName.localeCompare(b.playerName);
      });
  },
});
