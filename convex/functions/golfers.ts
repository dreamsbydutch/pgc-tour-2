import type { Doc, Id } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { normalizePlayerNameFromDataGolf } from "../utils/datagolf";
import {
  getTournamentIdsForFilter,
  listTournamentGolfersByTournamentIds,
} from "../utils/golfers";
import { omitUndefined } from "../utils/_shared/object";
import { requireAdmin } from "../utils/auth";
import {
  findCurrentSeason,
  getCurrentSeasonId,
  listSeasons,
} from "../utils/seasons";
import type {
  GolferCreatePayload,
  GolferQueryOptions,
  GolferUpdatePayload,
  HydratedGolfer,
  HydratedTournamentGolfer,
  TournamentGolferCreatePayload,
  TournamentGolferQueryFilter,
  TournamentGolferUpdatePayload,
} from "../types/golfers";
import { golfersValidators } from "../validators/golfers";

// Level 0: shared context types

type GolferFunctionContext = MutationCtx | QueryCtx;

// Level 1: access and hydration helpers

/** Returns whether the current caller is authenticated. */
async function isSignedIn(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return Boolean(identity?.subject);
}

/** Resolves the read scope allowed for the current caller. */
async function getReadableTournamentScope(
  ctx: QueryCtx,
  filter: {
    tournamentId?: Id<"tournaments">;
    seasonId?: Id<"seasons">;
    activeOnly?: boolean;
  },
) {
  if (await isSignedIn(ctx)) {
    return filter;
  }

  const currentSeasonId = await getCurrentSeasonId(ctx);
  if (!currentSeasonId) {
    return null;
  }

  if (filter.seasonId && filter.seasonId !== currentSeasonId) {
    return null;
  }

  if (filter.tournamentId) {
    const tournament = await ctx.db.get(filter.tournamentId);
    if (!tournament || tournament.seasonId !== currentSeasonId) {
      return null;
    }
  }

  return {
    ...filter,
    seasonId: currentSeasonId,
  };
}

/** Hydrates tournament golfer docs with golfer, tournament, and season data. */
async function hydrateTournamentGolferDocs(
  ctx: GolferFunctionContext,
  tournamentGolfers: Doc<"tournamentGolfers">[],
): Promise<HydratedTournamentGolfer[]> {
  return await Promise.all(
    tournamentGolfers.map(async (tournamentGolfer) => {
      const [golfer, tournament] = await Promise.all([
        ctx.db.get(tournamentGolfer.golferId),
        ctx.db.get(tournamentGolfer.tournamentId),
      ]);

      if (!golfer) {
        throw new Error("Golfer not found");
      }

      if (!tournament) {
        throw new Error("Tournament not found");
      }

      const season = await ctx.db.get(tournament.seasonId);

      if (!season) {
        throw new Error("Season not found");
      }

      return {
        ...tournamentGolfer,
        golfer,
        tournament,
        season,
      };
    }),
  );
}

/** Hydrates one tournament golfer doc by id. */
async function hydrateTournamentGolferResponse(
  ctx: GolferFunctionContext,
  tournamentGolferId: Id<"tournamentGolfers">,
): Promise<HydratedTournamentGolfer> {
  const tournamentGolfer = await ctx.db.get(tournamentGolferId);

  if (!tournamentGolfer) {
    throw new Error("Tournament golfer not found");
  }

  return (await hydrateTournamentGolferDocs(ctx, [tournamentGolfer]))[0];
}

/** Builds hydrated golfer responses from golfer and tournament golfer rows. */
async function buildHydratedGolfers(
  ctx: GolferFunctionContext,
  golfers: Doc<"golfers">[],
  tournamentGolfers: Doc<"tournamentGolfers">[],
): Promise<HydratedGolfer[]> {
  const hydratedTournamentGolfers = await hydrateTournamentGolferDocs(
    ctx,
    tournamentGolfers,
  );

  const tournamentGolfersByGolferId = new Map<
    Id<"golfers">,
    HydratedTournamentGolfer[]
  >();

  for (const tournamentGolfer of hydratedTournamentGolfers) {
    const existingTournamentGolfers =
      tournamentGolfersByGolferId.get(tournamentGolfer.golferId) ?? [];
    existingTournamentGolfers.push(tournamentGolfer);
    tournamentGolfersByGolferId.set(
      tournamentGolfer.golferId,
      existingTournamentGolfers,
    );
  }

  return golfers.map((golfer) => {
    const golferTournamentGolfers =
      tournamentGolfersByGolferId.get(golfer._id) ?? [];
    const tournaments = [
      ...new Map(
        golferTournamentGolfers.map((tournamentGolfer) => [
          tournamentGolfer.tournament._id,
          tournamentGolfer.tournament,
        ]),
      ).values(),
    ];
    const seasons = [
      ...new Map(
        golferTournamentGolfers.map((tournamentGolfer) => [
          tournamentGolfer.season._id,
          tournamentGolfer.season,
        ]),
      ).values(),
    ];

    return {
      ...golfer,
      tournamentGolfers: golferTournamentGolfers,
      tournaments,
      seasons,
    };
  });
}

/** Hydrates one golfer doc by id with its accessible tournament context. */
async function hydrateGolferResponse(
  ctx: GolferFunctionContext,
  golferId: Id<"golfers">,
  tournamentGolfers: Doc<"tournamentGolfers">[],
): Promise<HydratedGolfer> {
  const golfer = await ctx.db.get(golferId);

  if (!golfer) {
    throw new Error("Golfer not found");
  }

  return (await buildHydratedGolfers(ctx, [golfer], tournamentGolfers))[0];
}

/** Returns tournament golfers filtered to the current caller's allowed scope. */
async function getTournamentGolfersForRead(
  ctx: QueryCtx,
  filter: TournamentGolferQueryFilter = {},
) {
  const signedIn = await isSignedIn(ctx);
  const readableScope = await getReadableTournamentScope(ctx, {
    tournamentId: filter.tournamentId,
    seasonId: filter.seasonId,
    activeOnly: filter.activeOnly,
  });

  if (!signedIn && !readableScope) {
    return [];
  }

  if (readableScope?.tournamentId) {
    let tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", readableScope.tournamentId!),
      )
      .collect();

    if (filter.golferId) {
      tournamentGolfers = tournamentGolfers.filter(
        (tournamentGolfer) => tournamentGolfer.golferId === filter.golferId,
      );
    }

    return tournamentGolfers;
  }

  if (
    filter.golferId &&
    signedIn &&
    !readableScope?.seasonId &&
    !readableScope?.activeOnly
  ) {
    return await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_golfer", (q) => q.eq("golferId", filter.golferId!))
      .collect();
  }

  if (readableScope?.seasonId || readableScope?.activeOnly || !signedIn) {
    const tournamentIds = await getTournamentIdsForFilter(ctx, {
      seasonId: readableScope?.seasonId,
      activeOnly: readableScope?.activeOnly,
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
}

/** Returns golfers filtered to the current caller's allowed scope. */
async function getGolfersForRead(
  ctx: QueryCtx,
  options: GolferQueryOptions = {},
) {
  const filter = options.filter ?? {};
  const signedIn = await isSignedIn(ctx);

  if (filter.apiId !== undefined) {
    const golfer = await ctx.db
      .query("golfers")
      .withIndex("by_api_id", (q) => q.eq("apiId", filter.apiId!))
      .first();

    if (!golfer) {
      return [];
    }

    const tournamentGolfers = await getTournamentGolfersForRead(ctx, {
      tournamentId: filter.tournamentId,
      seasonId: filter.seasonId,
      activeOnly: filter.activeOnly,
      golferId: golfer._id,
    });

    if (!signedIn && tournamentGolfers.length === 0) {
      return [];
    }

    return await buildHydratedGolfers(ctx, [golfer], tournamentGolfers);
  }

  if (
    filter.tournamentId ||
    filter.seasonId ||
    filter.activeOnly ||
    !signedIn
  ) {
    const tournamentGolfers = await getTournamentGolfersForRead(ctx, {
      tournamentId: filter.tournamentId,
      seasonId: filter.seasonId,
      activeOnly: filter.activeOnly,
    });

    const uniqueGolferIds = [
      ...new Set(tournamentGolfers.map((item) => item.golferId)),
    ];
    const golfers = await Promise.all(
      uniqueGolferIds.map((golferId) => ctx.db.get(golferId)),
    );

    return await buildHydratedGolfers(
      ctx,
      golfers.filter(
        (golfer): golfer is NonNullable<typeof golfer> => golfer !== null,
      ),
      tournamentGolfers,
    );
  }

  const [golfers, tournamentGolfers] = await Promise.all([
    ctx.db.query("golfers").collect(),
    ctx.db.query("tournamentGolfers").collect(),
  ]);

  return await buildHydratedGolfers(ctx, golfers, tournamentGolfers);
}

// Level 2: mutation record helpers

/**
 * Creates a golfer record after enforcing apiId uniqueness and normalizing the
 * stored player name.
 *
 * @param ctx Convex mutation context.
 * @param data New golfer payload.
 * @returns The inserted golfer document.
 */
async function createGolferRecord(ctx: MutationCtx, data: GolferCreatePayload) {
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

  return await hydrateGolferResponse(ctx, golferId, []);
}

/**
 * Updates a golfer record, preserving apiId uniqueness and re-normalizing the
 * player name when it changes.
 *
 * @param ctx Convex mutation context.
 * @param golferId Golfer document id.
 * @param data Partial golfer fields to update.
 * @returns The updated golfer document.
 */
async function updateGolferRecord(
  ctx: MutationCtx,
  golferId: Id<"golfers">,
  data: GolferUpdatePayload,
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

  const tournamentGolfers = await ctx.db
    .query("tournamentGolfers")
    .withIndex("by_golfer", (q) => q.eq("golferId", golferId))
    .collect();

  return await hydrateGolferResponse(ctx, golferId, tournamentGolfers);
}

/**
 * Deletes a golfer and removes all linked tournamentGolfer rows so the module
 * does not leave orphaned tournament associations behind.
 *
 * @param ctx Convex mutation context.
 * @param golferId Golfer document id.
 * @returns Confirmation with the number of linked rows removed.
 */
async function deleteGolferRecord(ctx: MutationCtx, golferId: Id<"golfers">) {
  const existing = await ctx.db.get(golferId);
  if (!existing) {
    throw new Error("Golfer not found");
  }

  const tournamentGolfers = await ctx.db
    .query("tournamentGolfers")
    .withIndex("by_golfer", (q) => q.eq("golferId", golferId))
    .collect();

  const deletedGolfer = await hydrateGolferResponse(
    ctx,
    golferId,
    tournamentGolfers,
  );

  await Promise.all(
    tournamentGolfers.map((tournamentGolfer) =>
      ctx.db.delete(tournamentGolfer._id),
    ),
  );
  await ctx.db.delete(golferId);

  return {
    ok: true,
    golfer: deletedGolfer,
    golferId,
    deletedTournamentGolfers: tournamentGolfers.length,
  } as const;
}

/**
 * Creates a tournamentGolfer row after validating both parent records and the
 * golfer/tournament uniqueness constraint.
 *
 * @param ctx Convex mutation context.
 * @param data New tournamentGolfer payload.
 * @returns The inserted tournamentGolfer document.
 */
async function createTournamentGolferRecord(
  ctx: MutationCtx,
  data: TournamentGolferCreatePayload,
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
    throw new Error(
      "Tournament golfer already exists for golfer and tournament",
    );
  }

  const { golferId, tournamentId, ...optionalData } = data;

  const tournamentGolferId = await ctx.db.insert("tournamentGolfers", {
    golferId,
    tournamentId,
    ...omitUndefined(optionalData),
    updatedAt: Date.now(),
  });

  return await hydrateTournamentGolferResponse(ctx, tournamentGolferId);
}

/**
 * Updates a tournamentGolfer row, validating any changed parent ids and
 * preserving the unique golfer/tournament pairing.
 *
 * @param ctx Convex mutation context.
 * @param tournamentGolferId Tournament golfer document id.
 * @param data Partial tournamentGolfer fields to update.
 * @returns The updated tournamentGolfer document.
 */
async function updateTournamentGolferRecord(
  ctx: MutationCtx,
  tournamentGolferId: Id<"tournamentGolfers">,
  data: TournamentGolferUpdatePayload,
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

  const changedData = omitUndefined(data);
  const hasChanges = Object.entries(changedData).some(
    ([key, value]) => existing[key as keyof typeof existing] !== value,
  );

  if (!hasChanges) {
    return await hydrateTournamentGolferResponse(ctx, tournamentGolferId);
  }

  await ctx.db.patch(
    tournamentGolferId,
    omitUndefined({
      ...data,
      updatedAt: Date.now(),
    }),
  );

  return await hydrateTournamentGolferResponse(ctx, tournamentGolferId);
}

/**
 * Deletes a single tournamentGolfer row after confirming it exists.
 *
 * @param ctx Convex mutation context.
 * @param tournamentGolferId Tournament golfer document id.
 * @returns Confirmation of the deleted id.
 */
async function deleteTournamentGolferRecord(
  ctx: MutationCtx,
  tournamentGolferId: Id<"tournamentGolfers">,
) {
  const existing = await ctx.db.get(tournamentGolferId);
  if (!existing) {
    throw new Error("Tournament golfer not found");
  }

  const deletedTournamentGolfer = await hydrateTournamentGolferResponse(
    ctx,
    tournamentGolferId,
  );

  await ctx.db.delete(tournamentGolferId);

  return {
    ok: true,
    tournamentGolfer: deletedTournamentGolfer,
    tournamentGolferId,
  } as const;
}

// Level 3: public read queries

/** Returns a hydrated golfer by its document id when the caller can read it. */
export const getGolfer = query({
  args: golfersValidators.args.getGolfer,
  handler: async (ctx, args) => {
    const golfer = await ctx.db.get(args.golferId);

    if (!golfer) {
      return null;
    }

    const tournamentGolfers = await getTournamentGolfersForRead(ctx, {
      golferId: args.golferId,
    });

    if (!(await isSignedIn(ctx)) && tournamentGolfers.length === 0) {
      return null;
    }

    return await hydrateGolferResponse(ctx, golfer._id, tournamentGolfers);
  },
});

/** Returns a hydrated golfer by its upstream DataGolf api id. */
export const getGolferByApiId = query({
  args: golfersValidators.args.getGolferByApiId,
  handler: async (ctx, args) => {
    const golfer = await ctx.db
      .query("golfers")
      .withIndex("by_api_id", (q) => q.eq("apiId", args.apiId))
      .first();

    if (!golfer) {
      return null;
    }

    const tournamentGolfers = await getTournamentGolfersForRead(ctx, {
      golferId: golfer._id,
    });

    if (!(await isSignedIn(ctx)) && tournamentGolfers.length === 0) {
      return null;
    }

    return await hydrateGolferResponse(ctx, golfer._id, tournamentGolfers);
  },
});

/** Returns hydrated golfers filtered by api id, tournament scope, or full collection. */
export const getGolfers = query({
  args: golfersValidators.args.getGolfers,
  handler: async (ctx, args) => {
    return await getGolfersForRead(ctx, args.options ?? {});
  },
});

/** Returns a hydrated tournamentGolfer row by id when the caller can read it. */
export const getTournamentGolfer = query({
  args: golfersValidators.args.getTournamentGolfer,
  handler: async (ctx, args) => {
    const tournamentGolfer = await ctx.db.get(args.tournamentGolferId);

    if (!tournamentGolfer) {
      return null;
    }

    const readableScope = await getReadableTournamentScope(ctx, {
      tournamentId: tournamentGolfer.tournamentId,
    });

    if (!(await isSignedIn(ctx)) && !readableScope) {
      return null;
    }

    return await hydrateTournamentGolferResponse(ctx, args.tournamentGolferId);
  },
});

/** Returns hydrated tournamentGolfer rows with caller-aware season scoping. */
export const getTournamentGolfers = query({
  args: golfersValidators.args.getTournamentGolfers,
  handler: async (ctx, args) => {
    const tournamentGolfers = await getTournamentGolfersForRead(
      ctx,
      args.options?.filter ?? {},
    );

    return await hydrateTournamentGolferDocs(ctx, tournamentGolfers);
  },
});

// Level 4: admin write mutations

/**
 * Admin-only mutation that creates a golfer record.
 *
 * @param data New golfer payload.
 * @returns The inserted golfer document.
 */
export const createGolfer = mutation({
  args: golfersValidators.args.createGolfer,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await createGolferRecord(ctx, args.data);
  },
});

/**
 * Admin-only mutation that updates a golfer record.
 *
 * @param golferId Golfer document id.
 * @param data Partial golfer fields to update.
 * @returns The updated golfer document.
 */
export const updateGolfer = mutation({
  args: golfersValidators.args.updateGolfer,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await updateGolferRecord(ctx, args.golferId, args.data);
  },
});

/**
 * Admin-only mutation that deletes a golfer and its linked tournament rows.
 *
 * @param golferId Golfer document id.
 * @returns Confirmation with cascade delete counts.
 */
export const deleteGolfer = mutation({
  args: golfersValidators.args.deleteGolfer,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await deleteGolferRecord(ctx, args.golferId);
  },
});

/**
 * Admin-only mutation that creates a tournamentGolfer row.
 *
 * @param data New tournamentGolfer payload.
 * @returns The inserted tournamentGolfer document.
 */
export const createTournamentGolfer = mutation({
  args: golfersValidators.args.createTournamentGolfer,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await createTournamentGolferRecord(ctx, args.data);
  },
});

/**
 * Admin-only mutation that updates a tournamentGolfer row.
 *
 * @param tournamentGolferId Tournament golfer document id.
 * @param data Partial tournamentGolfer fields to update.
 * @returns The updated tournamentGolfer document.
 */
export const updateTournamentGolferAdmin = mutation({
  args: golfersValidators.args.updateTournamentGolferAdmin,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await updateTournamentGolferRecord(
      ctx,
      args.tournamentGolferId,
      args.data,
    );
  },
});

/**
 * Admin-only mutation that deletes a tournamentGolfer row.
 *
 * @param tournamentGolferId Tournament golfer document id.
 * @returns Confirmation of the deleted id.
 */
export const deleteTournamentGolfer = mutation({
  args: golfersValidators.args.deleteTournamentGolfer,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await deleteTournamentGolferRecord(ctx, args.tournamentGolferId);
  },
});
