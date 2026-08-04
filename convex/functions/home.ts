import { query } from "../_generated/server";
import {
  projectPublicSeason,
  projectPublicTour,
  projectPublicTourCard,
  projectPublicTournament,
  projectViewerMember,
} from "../utils/publicDtos";

export const getPublicHomeDashboard = query({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("appState")
      .withIndex("by_key", (q) => q.eq("key", "primary"))
      .unique();
    let season = state?.currentSeasonId
      ? await ctx.db.get(state.currentSeasonId)
      : null;
    if (!season) {
      season = await ctx.db.query("seasons").order("desc").first();
    }
    if (!season) {
      return { season: null, tours: [], tournaments: [] };
    }

    const [tours, tournaments] = await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(20),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(100),
    ]);
    const courseIds = [...new Set(tournaments.map((item) => item.courseId))];
    const tierIds = [...new Set(tournaments.map((item) => item.tierId))];
    const [courses, tiers] = await Promise.all([
      Promise.all(courseIds.map((id) => ctx.db.get(id))),
      Promise.all(tierIds.map((id) => ctx.db.get(id))),
    ]);
    const courseById = new Map(
      courses.filter(Boolean).map((item) => [item!._id, item!] as const),
    );
    const tierById = new Map(
      tiers.filter(Boolean).map((item) => [item!._id, item!] as const),
    );
    return {
      season: projectPublicSeason(season),
      tours: tours.map(projectPublicTour),
      tournaments: tournaments
        .sort((a, b) => a.startDate - b.startDate)
        .map((tournament) =>
          projectPublicTournament({
            tournament,
            course: courseById.get(tournament.courseId),
            tier: tierById.get(tournament.tierId),
          }),
        ),
    };
  },
});

export const getHomeDashboard = query({
  args: {},
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();
    let season = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .first();
    if (!season) {
      season = (await ctx.db.query("seasons").order("desc").first()) ?? null;
    }
    if (!season) {
      return {
        season: null,
        tours: [],
        tourCards: [],
        tournaments: [],
        member: null,
      };
    }

    const [tours, tournaments, tourCards] = await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(20),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(100),
      ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(500),
    ]);
    const enhancedTournaments = await Promise.all(
      tournaments
        .sort((a, b) => a.startDate - b.startDate)
        .map(async (tournament) =>
          projectPublicTournament({
            tournament,
            course: await ctx.db.get(tournament.courseId),
            tier: await ctx.db.get(tournament.tierId),
          }),
        ),
    );

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        season: projectPublicSeason(season),
        tours: tours.map(projectPublicTour),
        tourCards: tourCards.map(projectPublicTourCard),
        tournaments: enhancedTournaments,
        member: null,
      };
    }
    const member = await ctx.db
      .query("members")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    return {
      season: projectPublicSeason(season),
      tours: tours.map(projectPublicTour),
      tourCards: tourCards.map(projectPublicTourCard),
      tournaments: enhancedTournaments,
      member: member ? projectViewerMember(member) : null,
    };
  },
});
