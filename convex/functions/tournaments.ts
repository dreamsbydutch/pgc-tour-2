import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type {
  TournamentCreatePayload,
  TournamentQueryOptions,
  TournamentUpdatePayload,
} from "../types/tournaments";
import { omitUndefined } from "../utils/misc";
import {
  enhanceTournaments,
  findCurrentTournament,
  findLastTournament,
  findNextTournament,
  getTournamentPlayoffState,
  isWithinNextTournamentWindow,
  listTournaments,
  sortTournaments,
} from "../utils/tournaments";
import { requireAdmin } from "../utils/auth";
import { tournamentsValidators } from "../validators/tournaments";

/**
 * Creates a tournament after validating that its related season, tier, and
 * course records exist.
 *
 * @param ctx Convex mutation context.
 * @param data New tournament payload.
 * @returns The inserted tournament document.
 */
async function createTournamentRecord(
  ctx: MutationCtx,
  data: TournamentCreatePayload,
) {
  const [season, tier, course] = await Promise.all([
    ctx.db.get(data.seasonId),
    ctx.db.get(data.tierId),
    ctx.db.get(data.courseId),
  ]);

  if (!season) {
    throw new Error("Season not found");
  }

  if (!tier) {
    throw new Error("Tier not found");
  }

  if (!course) {
    throw new Error("Course not found");
  }

  const tournamentId = await ctx.db.insert("tournaments", {
    ...data,
    updatedAt: Date.now(),
  });

  return await ctx.db.get(tournamentId);
}

/**
 * Updates a tournament and validates any changed related ids before writing the
 * patch.
 *
 * @param ctx Convex mutation context.
 * @param tournamentId Tournament document id.
 * @param data Partial tournament fields to update.
 * @returns The updated tournament document.
 */
async function updateTournamentRecord(
  ctx: MutationCtx,
  tournamentId: Id<"tournaments">,
  data: TournamentUpdatePayload,
) {
  const existing = await ctx.db.get(tournamentId);
  if (!existing) {
    throw new Error("Tournament not found");
  }

  const nextSeasonId = data.seasonId ?? existing.seasonId;
  const nextTierId = data.tierId ?? existing.tierId;
  const nextCourseId = data.courseId ?? existing.courseId;

  const [season, tier, course] = await Promise.all([
    ctx.db.get(nextSeasonId),
    ctx.db.get(nextTierId),
    ctx.db.get(nextCourseId),
  ]);

  if (!season) {
    throw new Error("Season not found");
  }

  if (!tier) {
    throw new Error("Tier not found");
  }

  if (!course) {
    throw new Error("Course not found");
  }

  await ctx.db.patch(
    tournamentId,
    omitUndefined({
      ...data,
      updatedAt: Date.now(),
    }),
  );

  return await ctx.db.get(tournamentId);
}

/**
 * Deletes a tournament and its directly linked teams and tournamentGolfer rows.
 *
 * @param ctx Convex mutation context.
 * @param tournamentId Tournament document id.
 * @returns Confirmation with cascade delete counts.
 */
async function deleteTournamentRecord(
  ctx: MutationCtx,
  tournamentId: Id<"tournaments">,
) {
  const existing = await ctx.db.get(tournamentId);
  if (!existing) {
    throw new Error("Tournament not found");
  }

  const [teams, tournamentGolfers] = await Promise.all([
    ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect(),
    ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect(),
  ]);

  await Promise.all([
    ...teams.map((team) => ctx.db.delete(team._id)),
    ...tournamentGolfers.map((tournamentGolfer) =>
      ctx.db.delete(tournamentGolfer._id),
    ),
  ]);

  await ctx.db.delete(tournamentId);

  return {
    ok: true,
    tournamentId,
    deletedTeams: teams.length,
    deletedTournamentGolfers: tournamentGolfers.length,
  } as const;
}

/**
 * Resolves tournaments from query options, including optional season/status
 * filtering, sorting, and related-doc enhancement.
 *
 * @param ctx Convex query context.
 * @param options Tournament query options.
 * @returns Matching tournament rows.
 */
async function getTournamentsForOptions(
  ctx: QueryCtx,
  options: TournamentQueryOptions,
) {
  const filter = options.filter ?? {};
  const sort = options.sort ?? {};
  const enhance = options.enhance ?? {};

  let tournaments = await listTournaments(ctx, filter.seasonId);

  if (filter.status) {
    tournaments = tournaments.filter(
      (tournament) => tournament.status === filter.status,
    );
  }

  const sorted = sortTournaments(tournaments, sort);
  return await enhanceTournaments(ctx, sorted, enhance);
}

/**
 * Returns a tournament by its document id.
 *
 * @param tournamentId Tournament document id.
 * @returns The matching tournament document, or null when missing.
 */
export const getTournament = query({
  args: tournamentsValidators.args.getTournament,
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tournamentId);
  },
});

/**
 * Returns all tournaments, optionally limited to a single season.
 *
 * @param seasonId Optional season scope.
 * @returns Matching tournament documents.
 */
export const getAllTournaments = query({
  args: tournamentsValidators.args.getAllTournaments,
  handler: async (ctx, args) => {
    return await listTournaments(ctx, args.seasonId);
  },
});

/**
 * Returns tournaments with optional season and status filtering, sorting, and
 * related-doc enhancement.
 *
 * @param options Tournament query options.
 * @returns Matching tournament rows.
 */
export const getTournaments = query({
  args: tournamentsValidators.args.getTournaments,
  handler: async (ctx, args) => {
    return await getTournamentsForOptions(ctx, args.options ?? {});
  },
});

/**
 * Returns the current tournament, defined as a tournament explicitly marked
 * active or one whose current time falls between its start and end dates.
 *
 * @param seasonId Optional season scope.
 * @returns The current tournament, or null when none qualifies.
 */
export const getCurrentTournament = query({
  args: tournamentsValidators.args.getCurrentTournament,
  handler: async (ctx, args) => {
    const tournaments = await listTournaments(ctx, args.seasonId);
    return findCurrentTournament(tournaments);
  },
});

/**
 * Returns the most recently ended tournament when it ended within the last four
 * days.
 *
 * @param seasonId Optional season scope.
 * @returns The recent tournament, or null when none qualifies.
 */
export const getLastTournament = query({
  args: tournamentsValidators.args.getLastTournament,
  handler: async (ctx, args) => {
    const tournaments = await listTournaments(ctx, args.seasonId);
    return findLastTournament(tournaments);
  },
});

/**
 * Returns the next upcoming tournament and whether it starts within the six-day
 * cron window.
 *
 * @param seasonId Optional season scope.
 * @returns The next tournament plus its cron-window flag.
 */
export const getNextTournament = query({
  args: tournamentsValidators.args.getNextTournament,
  handler: async (ctx, args) => {
    const tournaments = await listTournaments(ctx, args.seasonId);
    const tournament = findNextTournament(tournaments);
    const playoffState = await getTournamentPlayoffState(ctx, tournament);

    return {
      tournament,
      isWithinSixDayWindow: isWithinNextTournamentWindow(tournament),
      isPlayoff: playoffState.isPlayoff,
      playoffEventIndex: playoffState.playoffEventIndex,
      isNonFirstPlayoffTournament: playoffState.isNonFirstPlayoffTournament,
      firstPlayoffEventId: playoffState.firstPlayoffEventId,
      previousPlayoffEventId: playoffState.previousPlayoffEventId,
    } as const;
  },
});

/**
 * Returns the combined leaderboard view for a tournament, defaulting to the
 * current tournament, then next upcoming, then recent past tournament.
 *
 * @param tournamentId Optional explicit tournament id.
 * @param memberId Optional member id used to load the viewer's season tour card.
 * @returns Tournament, related tours, teams, golfers, and season context.
 */
export const getTournamentLeaderboardView = query({
  args: tournamentsValidators.args.getTournamentLeaderboardView,
  handler: async (ctx, args) => {
    const allTournaments = await listTournaments(ctx);

    let tournament = args.tournamentId
      ? await ctx.db.get(args.tournamentId)
      : null;

    if (!tournament) {
      tournament =
        findCurrentTournament(allTournaments) ??
        findNextTournament(allTournaments) ??
        findLastTournament(allTournaments);
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

    const playoffState = await getTournamentPlayoffState(ctx, tournament);

    const seasonTournaments = sortTournaments(
      allTournaments.filter((item) => item.seasonId === tournament.seasonId),
      { sortBy: "startDate", sortOrder: "desc" },
    );

    const [tours, teams, tournamentGolfers] = await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
        .collect(),
      ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect(),
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect(),
    ]);

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
      tournamentGolfers.map((tournamentGolfer) =>
        ctx.db.get(tournamentGolfer.golferId),
      ),
    );

    const enhancedGolfers = tournamentGolfers.map((tournamentGolfer, index) => {
      const golfer = golferDocs[index];
      return {
        ...tournamentGolfer,
        apiId: golfer?.apiId,
        playerName: golfer?.playerName,
        country: golfer?.country,
        worldRank: tournamentGolfer.worldRank ?? golfer?.worldRank,
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
      tournament: {
        ...tournament,
        playoffEventIndex: playoffState.playoffEventIndex,
      },
      tours,
      teams: enhancedTeams,
      golfers: enhancedGolfers,
      allTournaments: seasonTournaments,
      userTourCard,
    };
  },
});

/**
 * Returns the tournament pick pool sorted by group, world rank, and player
 * name.
 *
 * @param tournamentId Tournament document id.
 * @returns Pick-pool rows for the tournament.
 */
export const getTournamentPickPool = query({
  args: tournamentsValidators.args.getTournamentPickPool,
  handler: async (ctx, args) => {
    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .collect();

    const pickPool = await Promise.all(
      tournamentGolfers.map(async (tournamentGolfer) => {
        const golfer = await ctx.db.get(tournamentGolfer.golferId);
        if (!golfer) {
          return null;
        }

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

        if (groupA !== groupB) {
          return groupA - groupB;
        }

        const rankA = a.worldRank ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.worldRank ?? Number.MAX_SAFE_INTEGER;

        if (rankA !== rankB) {
          return rankA - rankB;
        }

        return a.playerName.localeCompare(b.playerName);
      });
  },
});

/**
 * Admin-only mutation that creates a tournament.
 *
 * @param data New tournament payload.
 * @returns The inserted tournament document.
 */
export const createTournament = mutation({
  args: tournamentsValidators.args.createTournament,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await createTournamentRecord(ctx, args.data);
  },
});

/**
 * Admin-only mutation that updates a tournament.
 *
 * @param tournamentId Tournament document id.
 * @param data Partial tournament fields to update.
 * @returns The updated tournament document.
 */
export const updateTournament = mutation({
  args: tournamentsValidators.args.updateTournament,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await updateTournamentRecord(ctx, args.tournamentId, args.data);
  },
});

/**
 * Admin-only mutation that deletes a tournament and its directly attached data.
 *
 * @param tournamentId Tournament document id.
 * @returns Confirmation with cascade delete counts.
 */
export const deleteTournament = mutation({
  args: tournamentsValidators.args.deleteTournament,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await deleteTournamentRecord(ctx, args.tournamentId);
  },
});
