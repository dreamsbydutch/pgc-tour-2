import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

const CANADIAN_OPEN_BADGE_LOGO_URL =
  "https://jn9n1jxo7g.ufs.sh/f/3f3580a5-8a7f-4bc3-a16c-53188869acb2-x8pl2f.png";

function normalizeTournamentName(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase();
}

function isCanadianOpenTournament(name: string | null | undefined) {
  const normalizedName = normalizeTournamentName(name);
  return normalizedName.includes("canadian open");
}

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
    if (!seasonId) {
      return {
        seasons,
        currentSeason: null,
        tours: [],
        tiers: [],
        tournaments: [],
        tourCards: [],
        teams: [],
      };
    }
    const [tours, tiers, tournaments, tourCards] = await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .take(20),
      ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .take(30),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .take(100),
      ctx.db
        .query("tourCards")
        .withIndex("by_season_points", (q) => q.eq("seasonId", seasonId))
        .order("desc")
        .take(500),
    ]);
    let teams = await ctx.db
      .query("teams")
      .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
      .take(10_000);
    if (teams.length === 0 && tournaments.length > 0) {
      teams = (
        await Promise.all(
          tournaments.map((tournament) =>
            ctx.db
              .query("teams")
              .withIndex("by_tournament", (q) =>
                q.eq("tournamentId", tournament._id),
              )
              .take(500),
          ),
        )
      ).flat();
    }
    return {
      seasons,
      currentSeason:
        seasons.find((season) => season._id === seasonId) ??
        (await ctx.db.get(seasonId)),
      tours,
      tiers,
      tournaments,
      tourCards,
      teams,
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
    const page = await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", args.tourCardId))
      .order("desc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
        maximumRowsRead: limit,
        maximumBytesRead: 512_000,
      });
    const tournaments = await Promise.all(
      page.page.map((team) => ctx.db.get(team.tournamentId)),
    );
    return {
      ...page,
      page: page.page.map((team, index) => ({
        ...team,
        tournament: tournaments[index] ?? undefined,
      })),
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
      season,
      tiers,
      tournaments: tournaments
        .sort((a, b) => a.startDate - b.startDate)
        .map((tournament) => ({
          ...tournament,
          course: courseById.get(tournament.courseId),
          tier: tierById.get(tournament.tierId),
        })),
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
      const seasons = await ctx.db.query("seasons").collect();
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
      .collect();

    const majorTierIds = new Set(
      tiers
        .filter((tier) => (tier.name ?? "").trim().toLowerCase() === "major")
        .map((tier) => tier._id),
    );

    if (majorTierIds.size === 0) return {};

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", currentSeason._id))
      .collect();

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
        .collect();

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
          logoUrl: isCanadianOpenTournament(tournament.name)
            ? CANADIAN_OPEN_BADGE_LOGO_URL
            : (tournament.logoUrl ?? null),
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
    return badges.reduce<
      Record<
        string,
        Array<{
          tournamentId: string;
          tournamentName: string;
          logoUrl: string | null;
        }>
      >
    >((result, badge) => {
      const memberId = String(badge.memberId);
      (result[memberId] ??= []).push({
        tournamentId: String(badge.tournamentId),
        tournamentName: badge.tournamentName,
        logoUrl: badge.logoUrl ?? null,
      });
      return result;
    }, {});
  },
});
