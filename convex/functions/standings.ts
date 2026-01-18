import { query } from "../_generated/server";
import { v } from "convex/values";

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
