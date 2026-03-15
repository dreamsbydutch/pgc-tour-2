import type { Id } from "../_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import {
  normalizeDgSkillEstimateToPgcRating,
  normalizePlayerNameFromDataGolf,
} from "../utils/datagolf";
import {
  getGolfersForTournamentScope,
  getTournamentIdsForFilter,
  listTournamentGolfersByTournamentIds,
} from "../utils/golfers";
import { omitUndefined } from "../utils/misc";
import { requireAdmin } from "../utils/auth";
import type {
  GolferCreatePayload,
  GolferUpdatePayload,
  TournamentGolferCreatePayload,
  TournamentGolferUpdatePayload,
} from "../types/golfers";
import { golfersValidators } from "../validators/golfers";

/**
 * Removes keys whose values are undefined so Convex patches only include fields
 * that should be persisted.
 *
 * @param data Source object that may contain undefined values.
 * @returns A shallow copy containing only defined entries.
 */

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

  return await ctx.db.get(golferId);
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

  return await ctx.db.get(golferId);
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

  await Promise.all(
    tournamentGolfers.map((tournamentGolfer) =>
      ctx.db.delete(tournamentGolfer._id),
    ),
  );
  await ctx.db.delete(golferId);

  return {
    ok: true,
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

  return await ctx.db.get(tournamentGolferId);
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

  await ctx.db.patch(
    tournamentGolferId,
    omitUndefined({
      ...data,
      updatedAt: Date.now(),
    }),
  );

  return await ctx.db.get(tournamentGolferId);
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

  await ctx.db.delete(tournamentGolferId);

  return {
    ok: true,
    tournamentGolferId,
  } as const;
}

/**
 * Returns a golfer by its document id.
 *
 * @param golferId Golfer document id.
 * @returns The matching golfer document, or null when missing.
 */
export const getGolfer = query({
  args: golfersValidators.args.getGolfer,
  handler: async (ctx, args) => {
    return await ctx.db.get(args.golferId);
  },
});

/**
 * Returns a golfer by its upstream DataGolf api id.
 *
 * @param apiId DataGolf golfer id.
 * @returns The matching golfer document, or null when missing.
 */
export const getGolferByApiId = query({
  args: golfersValidators.args.getGolferByApiId,
  handler: async (ctx, args) => {
    return await ctx.db
      .query("golfers")
      .withIndex("by_api_id", (q) => q.eq("apiId", args.apiId))
      .first();
  },
});

/**
 * Lists golfers, optionally narrowed by api id or tournament scope.
 *
 * @param options Optional filter object.
 * @returns Matching golfer documents.
 */
export const getGolfers = query({
  args: golfersValidators.args.getGolfers,
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

/**
 * Returns a tournamentGolfer row by its document id.
 *
 * @param tournamentGolferId Tournament golfer document id.
 * @returns The matching tournamentGolfer document, or null when missing.
 */
export const getTournamentGolfer = query({
  args: golfersValidators.args.getTournamentGolfer,
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tournamentGolferId);
  },
});

/**
 * Lists tournamentGolfer rows with optional golfer, tournament, season, and
 * active-tournament filtering.
 *
 * @param options Optional filter object.
 * @returns Matching tournamentGolfer documents.
 */
export const getTournamentGolfers = query({
  args: golfersValidators.args.getTournamentGolfers,
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
 * Internal mutation that creates a golfer without the admin gate for trusted
 * backend jobs.
 *
 * @param data New golfer payload.
 * @returns The inserted golfer document.
 */
export const createGolferInternal = internalMutation({
  args: golfersValidators.args.createGolfer,
  handler: async (ctx, args) => {
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
 * Internal mutation that updates a golfer for trusted backend workflows.
 *
 * @param golferId Golfer document id.
 * @param data Partial golfer fields to update.
 * @returns The updated golfer document.
 */
export const updateGolferInternal = internalMutation({
  args: golfersValidators.args.updateGolfer,
  handler: async (ctx, args) => {
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
 * Internal mutation that deletes a golfer for trusted backend workflows.
 *
 * @param golferId Golfer document id.
 * @returns Confirmation with cascade delete counts.
 */
export const deleteGolferInternal = internalMutation({
  args: golfersValidators.args.deleteGolfer,
  handler: async (ctx, args) => {
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
 * Internal mutation that creates a tournamentGolfer row for trusted backend
 * workflows.
 *
 * @param data New tournamentGolfer payload.
 * @returns The inserted tournamentGolfer document.
 */
export const createTournamentGolferInternal = internalMutation({
  args: golfersValidators.args.createTournamentGolfer,
  handler: async (ctx, args) => {
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
 * Internal mutation used by cron jobs and other trusted backend flows to update
 * a tournamentGolfer row from a payload that includes the document id.
 *
 * @param tournamentGolfer Tournament golfer payload including its document id.
 * @returns The updated tournamentGolfer document.
 */
export const updateTournamentGolfer = internalMutation({
  args: golfersValidators.args.updateTournamentGolfer,
  handler: async (ctx, args) => {
    const { _id, ...data } = args.tournamentGolfer;
    return await updateTournamentGolferRecord(ctx, _id, data);
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

/**
 * Internal mutation that deletes a tournamentGolfer row for trusted backend
 * workflows.
 *
 * @param tournamentGolferId Tournament golfer document id.
 * @returns Confirmation of the deleted id.
 */
export const deleteTournamentGolferInternal = internalMutation({
  args: golfersValidators.args.deleteTournamentGolfer,
  handler: async (ctx, args) => {
    return await deleteTournamentGolferRecord(ctx, args.tournamentGolferId);
  },
});

/**
 * Internal compatibility mutation used by cron ingestion to ensure each incoming
 * DataGolf player exists as both a golfer and tournamentGolfer for a tournament.
 *
 * @param tournamentId Tournament document id.
 * @param golfers Incoming DataGolf golfer payloads.
 * @returns Summary of how many missing tournament golfers were inserted.
 */
export const createMissingTournamentGolfers = internalMutation({
  args: golfersValidators.args.createMissingTournamentGolfers,
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
