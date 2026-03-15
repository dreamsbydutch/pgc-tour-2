import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type {
  TournamentCreatePayload,
  TournamentFetchResult,
  TournamentQueryOptions,
  TournamentUpdatePayload,
} from "../types/tournaments";
import { omitUndefined } from "../utils/_shared/object";
import {
  findCurrentTournament,
  findLastTournament,
  findNextTournament,
  getTournamentById,
  getTournamentPlayoffState,
  isWithinNextTournamentWindow,
  listTournaments,
  sortTournaments,
} from "../utils/tournaments";
import { requireAdmin } from "../utils/auth";
import { tournamentsValidators } from "../validators/tournaments";
import { v } from "convex/values";

// Level 0: shared context types

type TournamentFunctionContext = MutationCtx | QueryCtx;

// Level 1: mutation record and hydration helpers

/** Hydrates one tournament doc with the standard course, tier, and season data used by function responses. */
async function hydrateTournamentResponse(
  ctx: TournamentFunctionContext,
  tournamentId: Id<"tournaments">,
): Promise<TournamentFetchResult> {
  const tournament = await ctx.db.get(tournamentId);

  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const [course, tier, season] = await Promise.all([
    ctx.db.get(tournament.courseId),
    ctx.db.get(tournament.tierId),
    ctx.db.get(tournament.seasonId),
  ]);

  if (!course) {
    throw new Error("Course not found");
  }

  if (!tier) {
    throw new Error("Tier not found");
  }

  if (!season) {
    throw new Error("Season not found");
  }

  return {
    ...tournament,
    course,
    tier,
    season,
  };
}

/** Creates a tournament after validating linked records and returns the hydrated tournament response. */
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

  return await hydrateTournamentResponse(ctx, tournamentId);
}

/** Updates a tournament after validating linked ids and returns the hydrated tournament response. */
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

  return await hydrateTournamentResponse(ctx, tournamentId);
}

/** Deletes a tournament and related rows while returning the hydrated deleted tournament and delete counts. */
async function deleteTournamentRecord(
  ctx: MutationCtx,
  tournamentId: Id<"tournaments">,
) {
  const existing = await ctx.db.get(tournamentId);
  if (!existing) {
    throw new Error("Tournament not found");
  }

  const deletedTournament = await hydrateTournamentResponse(ctx, tournamentId);

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
    tournament: deletedTournament,
    tournamentId,
    deletedTeams: teams.length,
    deletedTournamentGolfers: tournamentGolfers.length,
  } as const;
}

// Level 2: query composition helpers

/** Resolves tournament query options into a filtered and sorted hydrated tournament collection. */
async function getTournamentsForOptions(
  ctx: QueryCtx,
  options: TournamentQueryOptions,
) {
  const filter = options.filter ?? {};
  const sort = options.sort ?? {};

  let tournaments = await listTournaments(ctx, filter.seasonId);

  if (filter.status) {
    tournaments = tournaments.filter(
      (tournament) => tournament.status === filter.status,
    );
  }

  return sortTournaments(tournaments, sort);
}

// Level 3: public read queries

/** Returns one tournament with its default course, tier, and season payload. */
export const getTournament = query({
  args: tournamentsValidators.args.getTournament,
  handler: async (ctx, args) => {
    return await getTournamentById(ctx, args.tournamentId);
  },
});

/** Returns hydrated tournaments for a season or the caller-visible season set. */
export const getAllTournaments = query({
  args: {
    seasonId: v.optional(v.id("seasons")),
  },
  handler: async (ctx, args) => {
    return await listTournaments(ctx, args.seasonId);
  },
});

/** Returns hydrated tournaments after applying the requested season, status, and sort options. */
export const getTournaments = query({
  args: tournamentsValidators.args.getTournaments,
  handler: async (ctx, args) => {
    return await getTournamentsForOptions(ctx, args.options ?? {});
  },
});

/** Returns the current hydrated tournament by status or active date window. */
export const getCurrentTournament = query({
  args: {
    seasonId: v.optional(v.id("seasons")),
  },
  handler: async (ctx, args) => {
    const tournaments = await listTournaments(ctx, args.seasonId);
    return findCurrentTournament(tournaments);
  },
});

/** Returns the most recent hydrated tournament that ended inside the recent lookback window. */
export const getLastTournament = query({
  args: {
    seasonId: v.optional(v.id("seasons")),
  },
  handler: async (ctx, args) => {
    const tournaments = await listTournaments(ctx, args.seasonId);
    return findLastTournament(tournaments);
  },
});

/** Returns the next hydrated tournament plus the six-day upcoming-window and playoff metadata flags. */
export const getNextTournament = query({
  args: {
    seasonId: v.optional(v.id("seasons")),
  },
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

/** Returns the tournament pick pool sorted by group, world rank, and player name. */
export const getTournamentGroups = query({
  args: tournamentsValidators.args.getTournamentGroups,
  handler: async (ctx, args) => {
    const tournament = await getTournamentById(ctx, args.tournamentId);

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();

    const groups = await Promise.all(
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

    return groups
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

// Level 4: admin-only write mutations

/** Admin-only mutation that creates a tournament and returns the hydrated tournament response. */
export const createTournament = mutation({
  args: tournamentsValidators.args.createTournament,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await createTournamentRecord(ctx, args.data);
  },
});

/** Admin-only mutation that updates a tournament and returns the hydrated tournament response. */
export const updateTournament = mutation({
  args: tournamentsValidators.args.updateTournament,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await updateTournamentRecord(ctx, args.tournamentId, args.data);
  },
});

/** Admin-only mutation that deletes a tournament and returns the hydrated deleted tournament plus cascade counts. */
export const deleteTournament = mutation({
  args: tournamentsValidators.args.deleteTournament,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await deleteTournamentRecord(ctx, args.tournamentId);
  },
});
