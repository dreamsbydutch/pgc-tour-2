import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import {
  normalizeDgSkillEstimateToPgcRating,
  normalizePlayerNameFromDataGolf,
} from "../utils/datagolf";
import { requireAdmin } from "../utils/auth";

const golferCreateData = v.object({
  apiId: v.number(),
  playerName: v.string(),
  country: v.optional(v.string()),
  worldRank: v.optional(v.number()),
});

const golferUpdateData = v.object({
  apiId: v.optional(v.number()),
  playerName: v.optional(v.string()),
  country: v.optional(v.string()),
  worldRank: v.optional(v.number()),
});

const tournamentGolferCreateData = v.object({
  golferId: v.id("golfers"),
  tournamentId: v.id("tournaments"),
  position: v.optional(v.string()),
  posChange: v.optional(v.number()),
  score: v.optional(v.number()),
  makeCut: v.optional(v.number()),
  topTen: v.optional(v.number()),
  win: v.optional(v.number()),
  earnings: v.optional(v.number()),
  today: v.optional(v.number()),
  thru: v.optional(v.number()),
  round: v.optional(v.number()),
  endHole: v.optional(v.number()),
  group: v.optional(v.number()),
  roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
  roundOne: v.optional(v.number()),
  roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
  roundTwo: v.optional(v.number()),
  roundThreeTeeTime: v.optional(v.union(v.number(), v.string())),
  roundThree: v.optional(v.number()),
  roundFourTeeTime: v.optional(v.union(v.number(), v.string())),
  roundFour: v.optional(v.number()),
  rating: v.optional(v.number()),
  worldRank: v.optional(v.number()),
  usage: v.optional(v.number()),
});

const tournamentGolferUpdateData = v.object({
  golferId: v.optional(v.id("golfers")),
  tournamentId: v.optional(v.id("tournaments")),
  position: v.optional(v.string()),
  posChange: v.optional(v.number()),
  score: v.optional(v.number()),
  makeCut: v.optional(v.number()),
  topTen: v.optional(v.number()),
  win: v.optional(v.number()),
  earnings: v.optional(v.number()),
  today: v.optional(v.number()),
  thru: v.optional(v.number()),
  round: v.optional(v.number()),
  endHole: v.optional(v.number()),
  group: v.optional(v.number()),
  roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
  roundOne: v.optional(v.number()),
  roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
  roundTwo: v.optional(v.number()),
  roundThreeTeeTime: v.optional(v.union(v.number(), v.string())),
  roundThree: v.optional(v.number()),
  roundFourTeeTime: v.optional(v.union(v.number(), v.string())),
  roundFour: v.optional(v.number()),
  rating: v.optional(v.number()),
  worldRank: v.optional(v.number()),
  usage: v.optional(v.number()),
});

function omitUndefined<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

async function getTournamentIdsForFilter(
  ctx: QueryCtx,
  filter: {
    tournamentId?: Id<"tournaments">;
    seasonId?: Id<"seasons">;
    activeOnly?: boolean;
  },
) {
  if (filter.tournamentId) {
    const tournament = await ctx.db.get(filter.tournamentId);
    if (!tournament) {
      return [];
    }

    if (!filter.activeOnly) {
      return [tournament._id];
    }

    const now = Date.now();
    const isActive =
      tournament.status === "active" ||
      (tournament.startDate <= now && tournament.endDate >= now);

    return isActive ? [tournament._id] : [];
  }

  let tournaments = filter.seasonId
    ? await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", filter.seasonId!))
        .collect()
    : await ctx.db.query("tournaments").collect();

  if (filter.activeOnly) {
    const now = Date.now();
    tournaments = tournaments.filter(
      (tournament) =>
        tournament.status === "active" ||
        (tournament.startDate <= now && tournament.endDate >= now),
    );
  }

  return tournaments.map((tournament) => tournament._id);
}

async function listTournamentGolfersByTournamentIds(
  ctx: QueryCtx,
  tournamentIds: Id<"tournaments">[],
) {
  const tournamentGolfers = await Promise.all(
    tournamentIds.map((tournamentId) =>
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
        .collect(),
    ),
  );

  return tournamentGolfers.flat();
}

async function getGolfersForTournamentScope(
  ctx: QueryCtx,
  filter: {
    tournamentId?: Id<"tournaments">;
    seasonId?: Id<"seasons">;
    activeOnly?: boolean;
  },
) {
  const tournamentIds = await getTournamentIdsForFilter(ctx, filter);
  if (tournamentIds.length === 0) {
    return [];
  }

  const tournamentGolfers = await listTournamentGolfersByTournamentIds(
    ctx,
    tournamentIds,
  );

  const uniqueGolferIds = [...new Set(tournamentGolfers.map((item) => item.golferId))];
  const golfers = await Promise.all(
    uniqueGolferIds.map((golferId) => ctx.db.get(golferId)),
  );

  return golfers.filter((golfer): golfer is NonNullable<typeof golfer> => golfer !== null);
}

async function createGolferRecord(
  ctx: MutationCtx,
  data: {
    apiId: number;
    playerName: string;
    country?: string;
    worldRank?: number;
  },
) {
  const existing = await ctx.db
    .query("golfers")
    .withIndex("by_api_id", (q) => q.eq("apiId", data.apiId))
    .first();

  if (existing) {
    throw new Error("Golfer already exists for apiId");
  }

  const golferId = await ctx.db.insert("golfers", {
    apiId: data.apiId,
    playerName: normalizePlayerNameFromDataGolf(data.playerName),
    ...omitUndefined({
      country: data.country,
      worldRank: data.worldRank,
    }),
    updatedAt: Date.now(),
  });

  return await ctx.db.get(golferId);
}

async function updateGolferRecord(
  ctx: MutationCtx,
  golferId: Id<"golfers">,
  data: {
    apiId?: number;
    playerName?: string;
    country?: string;
    worldRank?: number;
  },
) {
  const existing = await ctx.db.get(golferId);
  if (!existing) {
    throw new Error("Golfer not found");
  }

  if (data.apiId !== undefined && data.apiId !== existing.apiId) {
    const apiId = data.apiId;
    const duplicate = await ctx.db
      .query("golfers")
      .withIndex("by_api_id", (q) => q.eq("apiId", apiId))
      .first();

    if (duplicate && duplicate._id !== golferId) {
      throw new Error("Golfer already exists for apiId");
    }
  }

  await ctx.db.patch(
    golferId,
    omitUndefined({
      ...data,
      ...(data.playerName
        ? { playerName: normalizePlayerNameFromDataGolf(data.playerName) }
        : {}),
      updatedAt: Date.now(),
    }),
  );

  return await ctx.db.get(golferId);
}

async function deleteGolferRecord(ctx: MutationCtx, golferId: Id<"golfers">) {
  const existing = await ctx.db.get(golferId);
  if (!existing) {
    throw new Error("Golfer not found");
  }

  const tournamentGolfers = await ctx.db
    .query("tournamentGolfers")
    .withIndex("by_golfer", (q) => q.eq("golferId", golferId))
    .collect();

  await Promise.all(
    tournamentGolfers.map((tournamentGolfer) => ctx.db.delete(tournamentGolfer._id)),
  );
  await ctx.db.delete(golferId);

  return {
    ok: true,
    golferId,
    deletedTournamentGolfers: tournamentGolfers.length,
  } as const;
}

async function createTournamentGolferRecord(
  ctx: MutationCtx,
  data: {
    golferId: Id<"golfers">;
    tournamentId: Id<"tournaments">;
    position?: string;
    posChange?: number;
    score?: number;
    makeCut?: number;
    topTen?: number;
    win?: number;
    earnings?: number;
    today?: number;
    thru?: number;
    round?: number;
    endHole?: number;
    group?: number;
    roundOneTeeTime?: number | string;
    roundOne?: number;
    roundTwoTeeTime?: number | string;
    roundTwo?: number;
    roundThreeTeeTime?: number | string;
    roundThree?: number;
    roundFourTeeTime?: number | string;
    roundFour?: number;
    rating?: number;
    worldRank?: number;
    usage?: number;
  },
) {
  const [golfer, tournament] = await Promise.all([
    ctx.db.get(data.golferId),
    ctx.db.get(data.tournamentId),
  ]);

  if (!golfer) {
    throw new Error("Golfer not found");
  }

  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const existing = await ctx.db
    .query("tournamentGolfers")
    .withIndex("by_golfer_tournament", (q) =>
      q.eq("golferId", data.golferId).eq("tournamentId", data.tournamentId),
    )
    .first();

  if (existing) {
    throw new Error("Tournament golfer already exists for golfer and tournament");
  }

  const { golferId, tournamentId, ...optionalData } = data;

  const tournamentGolferId = await ctx.db.insert("tournamentGolfers", {
    golferId,
    tournamentId,
    ...omitUndefined(optionalData),
    updatedAt: Date.now(),
  });

  return await ctx.db.get(tournamentGolferId);
}

async function updateTournamentGolferRecord(
  ctx: MutationCtx,
  tournamentGolferId: Id<"tournamentGolfers">,
  data: {
    golferId?: Id<"golfers">;
    tournamentId?: Id<"tournaments">;
    position?: string;
    posChange?: number;
    score?: number;
    makeCut?: number;
    topTen?: number;
    win?: number;
    earnings?: number;
    today?: number;
    thru?: number;
    round?: number;
    endHole?: number;
    group?: number;
    roundOneTeeTime?: number | string;
    roundOne?: number;
    roundTwoTeeTime?: number | string;
    roundTwo?: number;
    roundThreeTeeTime?: number | string;
    roundThree?: number;
    roundFourTeeTime?: number | string;
    roundFour?: number;
    rating?: number;
    worldRank?: number;
    usage?: number;
  },
) {
  const existing = await ctx.db.get(tournamentGolferId);
  if (!existing) {
    throw new Error("Tournament golfer not found");
  }

  const nextGolferId = data.golferId ?? existing.golferId;
  const nextTournamentId = data.tournamentId ?? existing.tournamentId;

  const [golfer, tournament] = await Promise.all([
    ctx.db.get(nextGolferId),
    ctx.db.get(nextTournamentId),
  ]);

  if (!golfer) {
    throw new Error("Golfer not found");
  }

  if (!tournament) {
    throw new Error("Tournament not found");
  }

  if (
    nextGolferId !== existing.golferId ||
    nextTournamentId !== existing.tournamentId
  ) {
    const duplicate = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_golfer_tournament", (q) =>
        q.eq("golferId", nextGolferId).eq("tournamentId", nextTournamentId),
      )
      .first();

    if (duplicate && duplicate._id !== tournamentGolferId) {
      throw new Error(
        "Tournament golfer already exists for golfer and tournament",
      );
    }
  }

  await ctx.db.patch(
    tournamentGolferId,
    omitUndefined({
      ...data,
      updatedAt: Date.now(),
    }),
  );

  return await ctx.db.get(tournamentGolferId);
}

async function deleteTournamentGolferRecord(
  ctx: MutationCtx,
  tournamentGolferId: Id<"tournamentGolfers">,
) {
  const existing = await ctx.db.get(tournamentGolferId);
  if (!existing) {
    throw new Error("Tournament golfer not found");
  }

  await ctx.db.delete(tournamentGolferId);

  return {
    ok: true,
    tournamentGolferId,
  } as const;
}

export const getGolfer = query({
  args: {
    golferId: v.id("golfers"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.golferId);
  },
});

export const getGolferByApiId = query({
  args: {
    apiId: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("golfers")
      .withIndex("by_api_id", (q) => q.eq("apiId", args.apiId))
      .first();
  },
});

export const getGolfers = query({
  args: {
    options: v.optional(
      v.object({
        filter: v.optional(
          v.object({
            apiId: v.optional(v.number()),
            tournamentId: v.optional(v.id("tournaments")),
            seasonId: v.optional(v.id("seasons")),
            activeOnly: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const filter = args.options?.filter ?? {};

    if (filter.apiId !== undefined) {
      const apiId = filter.apiId;
      const golfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", apiId))
        .first();

      return golfer ? [golfer] : [];
    }

    if (filter.tournamentId || filter.seasonId || filter.activeOnly) {
      return await getGolfersForTournamentScope(ctx, filter);
    }

    return await ctx.db.query("golfers").collect();
  },
});

export const getTournamentGolfer = query({
  args: {
    tournamentGolferId: v.id("tournamentGolfers"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tournamentGolferId);
  },
});

export const getTournamentGolfers = query({
  args: {
    options: v.optional(
      v.object({
        filter: v.optional(
          v.object({
            golferId: v.optional(v.id("golfers")),
            tournamentId: v.optional(v.id("tournaments")),
            seasonId: v.optional(v.id("seasons")),
            activeOnly: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const filter = args.options?.filter ?? {};

    if (filter.tournamentId) {
      const tournamentId = filter.tournamentId;
      let tournamentGolfers = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
        .collect();

      if (filter.golferId) {
        tournamentGolfers = tournamentGolfers.filter(
          (tournamentGolfer) => tournamentGolfer.golferId === filter.golferId,
        );
      }

      return tournamentGolfers;
    }

    if (filter.golferId && !filter.seasonId && !filter.activeOnly) {
      const golferId = filter.golferId;
      return await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer", (q) => q.eq("golferId", golferId))
        .collect();
    }

    if (filter.seasonId || filter.activeOnly) {
      const tournamentIds = await getTournamentIdsForFilter(ctx, {
        seasonId: filter.seasonId,
        activeOnly: filter.activeOnly,
      });

      let tournamentGolfers = await listTournamentGolfersByTournamentIds(
        ctx,
        tournamentIds,
      );

      if (filter.golferId) {
        tournamentGolfers = tournamentGolfers.filter(
          (tournamentGolfer) => tournamentGolfer.golferId === filter.golferId,
        );
      }

      return tournamentGolfers;
    }

    if (filter.golferId) {
      const golferId = filter.golferId;
      return await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer", (q) => q.eq("golferId", golferId))
        .collect();
    }

    return await ctx.db.query("tournamentGolfers").collect();
  },
});

export const createGolfer = mutation({
  args: {
    data: golferCreateData,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await createGolferRecord(ctx, args.data);
  },
});

export const createGolferInternal = internalMutation({
  args: {
    data: golferCreateData,
  },
  handler: async (ctx, args) => {
    return await createGolferRecord(ctx, args.data);
  },
});

export const updateGolfer = mutation({
  args: {
    golferId: v.id("golfers"),
    data: golferUpdateData,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await updateGolferRecord(ctx, args.golferId, args.data);
  },
});

export const updateGolferInternal = internalMutation({
  args: {
    golferId: v.id("golfers"),
    data: golferUpdateData,
  },
  handler: async (ctx, args) => {
    return await updateGolferRecord(ctx, args.golferId, args.data);
  },
});

export const deleteGolfer = mutation({
  args: {
    golferId: v.id("golfers"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await deleteGolferRecord(ctx, args.golferId);
  },
});

export const deleteGolferInternal = internalMutation({
  args: {
    golferId: v.id("golfers"),
  },
  handler: async (ctx, args) => {
    return await deleteGolferRecord(ctx, args.golferId);
  },
});

export const createTournamentGolfer = mutation({
  args: {
    data: tournamentGolferCreateData,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await createTournamentGolferRecord(ctx, args.data);
  },
});

export const createTournamentGolferInternal = internalMutation({
  args: {
    data: tournamentGolferCreateData,
  },
  handler: async (ctx, args) => {
    return await createTournamentGolferRecord(ctx, args.data);
  },
});

export const updateTournamentGolferAdmin = mutation({
  args: {
    tournamentGolferId: v.id("tournamentGolfers"),
    data: tournamentGolferUpdateData,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await updateTournamentGolferRecord(
      ctx,
      args.tournamentGolferId,
      args.data,
    );
  },
});

export const updateTournamentGolfer = internalMutation({
  args: {
    tournamentGolfer: v.object({
      _id: v.id("tournamentGolfers"),
      golferId: v.optional(v.id("golfers")),
      tournamentId: v.optional(v.id("tournaments")),
      position: v.optional(v.string()),
      posChange: v.optional(v.number()),
      score: v.optional(v.number()),
      makeCut: v.optional(v.number()),
      topTen: v.optional(v.number()),
      win: v.optional(v.number()),
      earnings: v.optional(v.number()),
      today: v.optional(v.number()),
      thru: v.optional(v.number()),
      round: v.optional(v.number()),
      endHole: v.optional(v.number()),
      group: v.optional(v.number()),
      roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
      roundOne: v.optional(v.number()),
      roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
      roundTwo: v.optional(v.number()),
      roundThreeTeeTime: v.optional(v.union(v.number(), v.string())),
      roundThree: v.optional(v.number()),
      roundFourTeeTime: v.optional(v.union(v.number(), v.string())),
      roundFour: v.optional(v.number()),
      rating: v.optional(v.number()),
      worldRank: v.optional(v.number()),
      usage: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const { _id, ...data } = args.tournamentGolfer;
    return await updateTournamentGolferRecord(ctx, _id, data);
  },
});

export const deleteTournamentGolfer = mutation({
  args: {
    tournamentGolferId: v.id("tournamentGolfers"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await deleteTournamentGolferRecord(ctx, args.tournamentGolferId);
  },
});

export const deleteTournamentGolferInternal = internalMutation({
  args: {
    tournamentGolferId: v.id("tournamentGolfers"),
  },
  handler: async (ctx, args) => {
    return await deleteTournamentGolferRecord(ctx, args.tournamentGolferId);
  },
});

export const createMissingTournamentGolfers = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    golfers: v.array(
      v.object({
        dg_id: v.number(),
        player_name: v.string(),
        country: v.optional(v.string()),
        worldRank: v.optional(v.number()),
        dg_skill_estimate: v.optional(v.number()),
        r1_teetime: v.optional(v.union(v.number(), v.string())),
        r2_teetime: v.optional(v.union(v.number(), v.string())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;

    for (const golferInput of args.golfers) {
      const existingGolfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", golferInput.dg_id))
        .first();

      const golfer =
        existingGolfer ??
        (await createGolferRecord(ctx, {
          apiId: golferInput.dg_id,
          playerName: golferInput.player_name,
          country: golferInput.country,
          worldRank: golferInput.worldRank,
        }));

      if (!golfer) {
        throw new Error("Golfer not found after create");
      }

      const existingTournamentGolfer = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", golfer._id).eq("tournamentId", args.tournamentId),
        )
        .first();

      if (existingTournamentGolfer) {
        continue;
      }

      await createTournamentGolferRecord(ctx, {
        golferId: golfer._id,
        tournamentId: args.tournamentId,
        worldRank: golferInput.worldRank ?? 501,
        group: 0,
        usage: 0,
        round: 0,
        rating: normalizeDgSkillEstimateToPgcRating(
          golferInput.dg_skill_estimate ?? -1.875,
        ),
        roundOneTeeTime: golferInput.r1_teetime,
        roundTwoTeeTime: golferInput.r2_teetime,
      });
      inserted += 1;
    }

    return {
      ok: true,
      skipped: false,
      tournamentId: args.tournamentId,
      golfersProcessed: inserted,
    } as const;
  },
});
