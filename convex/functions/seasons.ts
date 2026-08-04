import { query } from "../_generated/server";
import { v } from "convex/values";
import {
  projectMajorChampionBadgesByMemberId,
  projectPublicSeason,
  projectPublicStandingsHistory,
  projectPublicStandingsRow,
  projectPublicStandingsTournament,
  projectPublicTier,
  projectPublicTour,
  projectPublicTournament,
} from "../utils/publicDtos";
import {
  isCanadianOpenTournament,
  resolveChampionBadgeLogoUrl,
} from "../utils/tournamentBadges";

export const getCurrentSeason = query({
  args: {},
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();
    const currentSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .first();

    if (currentSeason) {
      return projectPublicSeason(currentSeason);
    }

    const seasons = await ctx.db.query("seasons").take(100);
    if (seasons.length === 0) {
      return null;
    }

    const season = [...seasons].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.number - a.number;
    })[0];
    return season ? projectPublicSeason(season) : null;
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
    const seasons = await ctx.db.query("seasons").take(100);
    const sort = args.options?.sort ?? {};
    const sortBy = sort.sortBy ?? "year";
    const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

    return [...seasons]
      .sort((a, b) => {
        if (sortBy === "number") {
          if (a.number !== b.number) return (a.number - b.number) * sortOrder;
          return (a.year - b.year) * sortOrder;
        }
        if (a.year !== b.year) return (a.year - b.year) * sortOrder;
        return (a.number - b.number) * sortOrder;
      })
      .map(projectPublicSeason);
  },
});

export const getStandingsViewData = query({
  args: {
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args) => {
    const [tours, tiers, standingsRows, badges] = await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .take(20),
      ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .take(30),
      ctx.db
        .query("standingsRows")
        .withIndex("by_season_variant", (q) =>
          q.eq("seasonId", args.seasonId).eq("variant", "regular"),
        )
        .take(500),
      ctx.db
        .query("majorChampionBadges")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .take(500),
    ]);

    return {
      tours: tours.map(projectPublicTour),
      tiers: tiers.map(projectPublicTier),
      tournaments: [],
      standingsRows: standingsRows.map(projectPublicStandingsRow),
      majorChampionBadgesByMemberId:
        projectMajorChampionBadgesByMemberId(badges),
      teams: [],
    };
  },
});

export const getStandingsIndex = query({
  args: {
    seasonId: v.optional(v.id("seasons")),
  },
  handler: async (ctx, args) => {
    const [appState, seasons] = await Promise.all([
      ctx.db
        .query("appState")
        .withIndex("by_key", (q) => q.eq("key", "primary"))
        .unique(),
      ctx.db.query("seasons").order("desc").take(50),
    ]);
    const seasonId =
      args.seasonId ?? appState?.currentSeasonId ?? seasons[0]?._id;
    const seasonDtos = seasons.map(projectPublicSeason);
    if (!seasonId) {
      return {
        seasons: seasonDtos,
        currentSeason: null,
        tours: [],
        tiers: [],
        standingsRows: [],
        majorChampionBadgesByMemberId: projectMajorChampionBadgesByMemberId([]),
      };
    }
    const [tours, tiers, standingsRows, badges] = await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .take(20),
      ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .take(30),
      ctx.db
        .query("standingsRows")
        .withIndex("by_season_variant", (q) =>
          q.eq("seasonId", seasonId).eq("variant", "regular"),
        )
        .take(500),
      ctx.db
        .query("majorChampionBadges")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .take(500),
    ]);
    const currentSeason =
      seasons.find((season) => season._id === seasonId) ??
      (await ctx.db.get(seasonId));
    return {
      seasons: seasonDtos,
      currentSeason: currentSeason ? projectPublicSeason(currentSeason) : null,
      tours: tours.map(projectPublicTour),
      tiers: tiers.map(projectPublicTier),
      standingsRows: standingsRows.map(projectPublicStandingsRow),
      majorChampionBadgesByMemberId:
        projectMajorChampionBadgesByMemberId(badges),
    };
  },
});

export const getTourCardTournamentHistory = query({
  args: {
    tourCardId: v.id("tourCards"),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 50);
    const tourCard = await ctx.db.get(args.tourCardId);
    if (!tourCard) {
      return {
        continueCursor: "",
        isDone: true,
        page: [],
        tournaments: [],
      };
    }
    const [page, tournaments, tiers] = await Promise.all([
      ctx.db
        .query("standingsContributions")
        .withIndex("by_tour_card_start_date", (q) =>
          q.eq("tourCardId", args.tourCardId),
        )
        .order("desc")
        .paginate({
          cursor: args.cursor ?? null,
          numItems: limit,
          maximumRowsRead: limit,
          maximumBytesRead: 512_000,
        }),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", tourCard.seasonId))
        .take(100),
      ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", tourCard.seasonId))
        .take(30),
    ]);
    const tierById = new Map(tiers.map((tier) => [tier._id, tier] as const));
    const now = Date.now();
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      page: page.page.flatMap((item) => {
        if (item.tournamentStartDate > now) return [];
        return [projectPublicStandingsHistory(item)];
      }),
      tournaments: tournaments
        .map((tournament) =>
          projectPublicStandingsTournament(
            tournament,
            tierById.get(tournament.tierId),
          ),
        )
        .filter((tournament) => !tournament.isPlayoff)
        .sort((a, b) => a.startDate - b.startDate),
    };
  },
});

export const getRulebookView = query({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("appState")
      .withIndex("by_key", (q) => q.eq("key", "primary"))
      .unique();
    const season = state?.currentSeasonId
      ? await ctx.db.get(state.currentSeasonId)
      : await ctx.db.query("seasons").order("desc").first();
    if (!season) return { season: null, tiers: [], tournaments: [] };
    const [tiers, tournaments] = await Promise.all([
      ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(30),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .take(100),
    ]);
    const courses = await Promise.all(
      [...new Set(tournaments.map((item) => item.courseId))].map((id) =>
        ctx.db.get(id),
      ),
    );
    const courseById = new Map(
      courses.filter(Boolean).map((item) => [item!._id, item!] as const),
    );
    const tierById = new Map(tiers.map((tier) => [tier._id, tier] as const));
    return {
      season: projectPublicSeason(season),
      tiers: tiers.map(projectPublicTier),
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

export const getCurrentSeasonMajorChampionBadges = query({
  args: {},
  handler: async (ctx) => {
    const currentYear = new Date().getFullYear();
    let currentSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .first();

    if (!currentSeason) {
      const seasons = await ctx.db.query("seasons").take(100);
      currentSeason =
        [...seasons].sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.number - a.number;
        })[0] ?? null;
    }

    if (!currentSeason) return {};

    const tiers = await ctx.db
      .query("tiers")
      .withIndex("by_season", (q) => q.eq("seasonId", currentSeason._id))
      .take(30);

    const majorTierIds = new Set(
      tiers
        .filter((tier) => (tier.name ?? "").trim().toLowerCase() === "major")
        .map((tier) => tier._id),
    );

    if (majorTierIds.size === 0) return {};

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", currentSeason._id))
      .take(100);

    const isTournamentCompleted = (tournament: (typeof tournaments)[number]) =>
      tournament.status === "completed";

    const badgeTournaments = tournaments
      .filter(
        (tournament) =>
          (majorTierIds.has(tournament.tierId) ||
            isCanadianOpenTournament(tournament.name)) &&
          isTournamentCompleted(tournament),
      )
      .sort((a, b) => a.startDate - b.startDate);

    const badgesByMemberId: Record<
      string,
      Array<{
        tournamentId: string;
        tournamentName: string;
        logoUrl: string | null;
      }>
    > = {};

    const parseRank = (position: string | null | undefined) => {
      if (!position) return Number.POSITIVE_INFINITY;
      const match = /\d+/.exec(position);
      if (!match) return Number.POSITIVE_INFINITY;
      const value = Number.parseInt(match[0], 10);
      return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
    };

    for (const tournament of badgeTournaments) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .take(500);

      const winningTeams = teams.filter(
        (team) => parseRank(team.position) === 1,
      );
      if (winningTeams.length === 0) continue;

      const winningTourCards = await Promise.all(
        winningTeams.map((team) => ctx.db.get(team.tourCardId)),
      );

      for (const tourCard of winningTourCards) {
        if (!tourCard?.memberId) continue;

        const memberId = String(tourCard.memberId);
        const currentBadges = badgesByMemberId[memberId] ?? [];
        if (
          currentBadges.some(
            (badge) => badge.tournamentId === String(tournament._id),
          )
        ) {
          continue;
        }

        currentBadges.push({
          tournamentId: String(tournament._id),
          tournamentName: tournament.name,
          logoUrl:
            resolveChampionBadgeLogoUrl(tournament.name, tournament.logoUrl) ??
            null,
        });
        badgesByMemberId[memberId] = currentBadges;
      }
    }

    return badgesByMemberId;
  },
});

export const getMajorChampionBadgesReadModel = query({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("appState")
      .withIndex("by_key", (q) => q.eq("key", "primary"))
      .unique();
    if (!state?.currentSeasonId) return {};
    const badges = await ctx.db
      .query("majorChampionBadges")
      .withIndex("by_season", (q) => q.eq("seasonId", state.currentSeasonId!))
      .take(500);
    return projectMajorChampionBadgesByMemberId(badges);
  },
});
