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
import { PRE_TOURNAMENT_PICK_WINDOW_MS } from "./_constants";

const TOURNAMENT_DEFAULT_HANDOFF_WINDOW_MS = 72 * 60 * 60 * 1000;

type TournamentDefaultCandidate = {
  startDate: number;
  endDate: number;
  status?: Doc<"tournaments">["status"];
};

type TournamentGolferGroupCandidate = {
  group?: number | null;
};

export function getNextUpcomingTournament<T extends TournamentDefaultCandidate>(
  tournaments: T[],
  now: number,
): T | null {
  return (
    [...tournaments]
      .filter((tournament) => tournament.startDate > now)
      .sort((a, b) => a.startDate - b.startDate)[0] ?? null
  );
}

export function hasRealTournamentGroups<
  T extends TournamentGolferGroupCandidate,
>(tournamentGolfers: T[]): boolean {
  return tournamentGolfers.some(
    (tournamentGolfer) =>
      typeof tournamentGolfer.group === "number" && tournamentGolfer.group > 0,
  );
}

export function selectTournamentLeaderboardDefault<
  T extends TournamentDefaultCandidate,
>(args: {
  explicitTournament?: T | null;
  tournaments: T[];
  now: number;
  nextUpcomingHasGroups: boolean;
}): T | null {
  if (args.explicitTournament) return args.explicitTournament;

  const { tournaments, now, nextUpcomingHasGroups } = args;

  const activeByStatus =
    tournaments.find((tournament) => tournament.status === "active") ?? null;
  if (activeByStatus) return activeByStatus;

  const activeByDate =
    tournaments.find(
      (tournament) => tournament.startDate <= now && tournament.endDate >= now,
    ) ?? null;
  if (activeByDate) return activeByDate;

  const nextUpcoming = getNextUpcomingTournament(tournaments, now);
  const recentCompleted =
    [...tournaments]
      .filter((tournament) => tournament.endDate < now)
      .sort((a, b) => b.endDate - a.endDate)[0] ?? null;

  if (recentCompleted) {
    if (!nextUpcoming) return recentCompleted;
    if (nextUpcomingHasGroups) return nextUpcoming;

    const msSinceRecentEnded = now - recentCompleted.endDate;
    if (msSinceRecentEnded < TOURNAMENT_DEFAULT_HANDOFF_WINDOW_MS) {
      return recentCompleted;
    }

    return nextUpcoming;
  }

  return nextUpcoming;
}

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
        golferApiId: tg.golferApiId,
        playerName: tg.playerName,
        country: tg.country,
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
        seasonId: team.seasonId,
        tourId: team.tourId,
        memberId: team.memberId,
        displayName: team.displayName,
        playoff: team.playoff,
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
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("appState")
      .withIndex("by_key", (q) => q.eq("key", "primary"))
      .unique();
    const now = state?.updatedAt ?? Date.now();
    const explicitTournament = args.tournamentId
      ? await ctx.db.get(args.tournamentId)
      : null;
    const stateTournamentId =
      state?.activeTournamentId ?? state?.nextTournamentId;
    const stateTournament =
      !explicitTournament && stateTournamentId
        ? await ctx.db.get(stateTournamentId)
        : null;
    const candidate = explicitTournament ?? stateTournament;
    const allTournaments = candidate
      ? await ctx.db
          .query("tournaments")
          .withIndex("by_season", (q) => q.eq("seasonId", candidate.seasonId))
          .take(100)
      : await ctx.db.query("tournaments").take(500);

    const nextUpcoming = state?.nextTournamentId
      ? (allTournaments.find((item) => item._id === state.nextTournamentId) ??
        null)
      : getNextUpcomingTournament(allTournaments, now);
    const nextUpcomingHasGroups = nextUpcoming
      ? hasRealTournamentGroups(
          await ctx.db
            .query("tournamentGolfers")
            .withIndex("by_tournament", (q) =>
              q.eq("tournamentId", nextUpcoming._id),
            )
            .take(500),
        )
      : false;

    const tournament = selectTournamentLeaderboardDefault({
      explicitTournament: candidate,
      tournaments: allTournaments,
      now,
      nextUpcomingHasGroups,
    });

    if (!tournament) {
      return {
        tournament: null,
        tours: [],
        tourCards: [],
        teams: [],
        golfers: [],
        allTournaments: [],
        userTourCard: null,
        pickPool: [],
      };
    }

    const seasonTournaments = allTournaments
      .filter((t) => t.seasonId === tournament.seasonId)
      .sort((a, b) => b.startDate - a.startDate);
    const seasonIds = Array.from(
      new Set(seasonTournaments.map((tournament) => tournament.seasonId)),
    );
    const tierIds = Array.from(
      new Set(seasonTournaments.map((tournament) => tournament.tierId)),
    );
    const courseIds = Array.from(
      new Set(seasonTournaments.map((tournament) => tournament.courseId)),
    );
    const [seasonDocs, tierDocs, courseDocs] = await Promise.all([
      Promise.all(seasonIds.map((seasonId) => ctx.db.get(seasonId))),
      Promise.all(tierIds.map((tierId) => ctx.db.get(tierId))),
      Promise.all(courseIds.map((courseId) => ctx.db.get(courseId))),
    ]);
    const seasonById = new Map(
      seasonDocs
        .filter(Boolean)
        .map((season) => [season!._id, season!] as const),
    );
    const tierById = new Map(
      tierDocs.filter(Boolean).map((tier) => [tier!._id, tier!] as const),
    );
    const courseById = new Map(
      courseDocs
        .filter(Boolean)
        .map((course) => [course!._id, course!] as const),
    );
    const playoffTournaments = seasonTournaments
      .filter((seasonTournament) =>
        (tierById.get(seasonTournament.tierId)?.name ?? "")
          .toLowerCase()
          .includes("playoff"),
      )
      .sort((a, b) => a.startDate - b.startDate);
    const getEventIndex = (tournamentId: Doc<"tournaments">["_id"]) => {
      const index = playoffTournaments.findIndex(
        (playoffTournament) => playoffTournament._id === tournamentId,
      );
      return index < 0 ? 0 : index + 1;
    };
    const eventIndex = getEventIndex(tournament._id);
    const enhancedTournament = {
      ...tournament,
      season: seasonById.get(tournament.seasonId),
      tier: tierById.get(tournament.tierId),
      course: courseById.get(tournament.courseId),
      isPlayoff: eventIndex > 0,
      eventIndex,
      pickWindow: {
        opensAt: tournament.startDate - PRE_TOURNAMENT_PICK_WINDOW_MS,
        closesAt: tournament.startDate,
        isOpen: state
          ? state.pickWindowTournamentId === tournament._id
          : now >= tournament.startDate - PRE_TOURNAMENT_PICK_WINDOW_MS &&
            now < tournament.startDate &&
            tournament.status !== "active" &&
            tournament.status !== "completed" &&
            tournament.status !== "cancelled",
      },
    };
    const enhancedSeasonTournaments = seasonTournaments.map(
      (seasonTournament) => ({
        ...seasonTournament,
        season: seasonById.get(seasonTournament.seasonId),
        tier: tierById.get(seasonTournament.tierId),
        course: courseById.get(seasonTournament.courseId),
        isPlayoff: getEventIndex(seasonTournament._id) > 0,
        eventIndex: getEventIndex(seasonTournament._id),
      }),
    );

    const tours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .take(20);

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season_points", (q) =>
        q.eq("seasonId", tournament.seasonId),
      )
      .order("desc")
      .take(500);

    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .take(500);

    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .take(500);

    const teamTourCards = await Promise.all(
      teams.map((team) =>
        team.tourId && team.memberId && team.displayName
          ? Promise.resolve(null)
          : ctx.db.get(team.tourCardId),
      ),
    );

    const enhancedTeams = teams.map((team, index) => {
      const card = teamTourCards[index];
      return {
        ...team,
        tourId: team.tourId ?? card?.tourId,
        displayName: team.displayName ?? card?.displayName,
        memberId: team.memberId ?? card?.memberId,
        playoff: team.playoff ?? card?.playoff,
      };
    });

    const golferDocs = await Promise.all(
      tournamentGolfers.map((tg) =>
        tg.golferApiId !== undefined && tg.playerName
          ? Promise.resolve(null)
          : ctx.db.get(tg.golferId),
      ),
    );

    const enhancedGolfers = tournamentGolfers.map((tg, index) => {
      const golfer = golferDocs[index];
      return {
        ...tg,
        apiId: tg.golferApiId ?? golfer?.apiId,
        playerName: tg.playerName ?? golfer?.playerName,
        country: tg.country ?? golfer?.country,
        worldRank: tg.worldRank ?? golfer?.worldRank,
      };
    });

    return {
      tournament: enhancedTournament,
      tours,
      tourCards,
      teams: enhancedTeams,
      golfers: enhancedGolfers,
      allTournaments: enhancedSeasonTournaments,
      userTourCard: null,
      pickPool: enhancedTournament.pickWindow.isOpen
        ? enhancedGolfers
            .map((golfer) => ({
              golferApiId: golfer.apiId,
              playerName: golfer.playerName,
              group: golfer.group ?? null,
              worldRank: golfer.worldRank ?? null,
              rating: golfer.rating ?? null,
            }))
            .filter(
              (golfer) =>
                golfer.golferApiId !== undefined &&
                golfer.playerName !== undefined,
            )
        : [],
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
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .take(500);

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
