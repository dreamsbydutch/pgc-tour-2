import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

export const getCurrentSeason = query({
  args: {},
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();
    const currentSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .first();

    if (currentSeason) {
      return currentSeason;
    }

    const seasons = await ctx.db.query("seasons").collect();
    if (seasons.length === 0) {
      return null;
    }

    return [...seasons].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.number - a.number;
    })[0];
  },
});

export const getSeasons = query({
  args: {
    options: v.optional(
      v.object({
        sort: v.optional(
          v.object({
            sortBy: v.optional(v.union(v.literal("year"), v.literal("number"))),
            sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const seasons = await ctx.db.query("seasons").collect();
    const sort = args.options?.sort ?? {};
    const sortBy = sort.sortBy ?? "year";
    const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

    return [...seasons].sort((a, b) => {
      if (sortBy === "number") {
        if (a.number !== b.number) return (a.number - b.number) * sortOrder;
        return (a.year - b.year) * sortOrder;
      }
      if (a.year !== b.year) return (a.year - b.year) * sortOrder;
      return (a.number - b.number) * sortOrder;
    });
  },
});

export const getStandingsViewData = query({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args) => {
    const tours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();

    const teamsByTournamentId = new Map<Id<"tournaments">, Array<unknown>>();
    for (const tournament of tournaments) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect();
      teamsByTournamentId.set(tournament._id, teams);
    }

    const teams = tournaments.flatMap((tournament) => {
      const tableTeams = teamsByTournamentId.get(tournament._id);
      return Array.isArray(tableTeams) ? tableTeams : [];
    });

    return {
      tours,
      tiers,
      tournaments,
      tourCards,
      teams,
    };
  },
});
