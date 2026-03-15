import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type {
  TierCreatePayload,
  TierQueryOptions,
  TierUpdatePayload,
} from "../types/tiers";
import { omitUndefined } from "../utils/misc";
import {
  filterTiers,
  listTiers,
  paginateTiers,
  sortTiers,
} from "../utils/tiers";
import { requireAdmin } from "../utils/auth";
import { tiersValidators } from "../validators/tiers";

/**
 * Validates tier arrays before create or update writes.
 *
 * @param data Tier payload to validate.
 */
function validateTierData(data: { payouts?: number[]; points?: number[] }) {
  if (data.payouts && data.payouts.some((value) => value < 0)) {
    throw new Error("Tier payouts cannot contain negative values");
  }

  if (data.points && data.points.some((value) => value < 0)) {
    throw new Error("Tier points cannot contain negative values");
  }
}

/**
 * Ensures there is not already another tier with the same season and name.
 *
 * @param ctx Convex mutation context.
 * @param seasonId Season document id.
 * @param name Tier name.
 * @param excludeTierId Optional tier id to exclude during updates.
 */
async function assertUniqueTierNameWithinSeason(
  ctx: MutationCtx,
  seasonId: Id<"seasons">,
  name: string,
  excludeTierId?: Id<"tiers">,
) {
  const seasonTiers = await ctx.db
    .query("tiers")
    .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
    .collect();

  const normalizedName = name.trim().toLowerCase();
  const duplicate = seasonTiers.find(
    (tier) =>
      tier._id !== excludeTierId &&
      tier.name.trim().toLowerCase() === normalizedName,
  );

  if (duplicate) {
    throw new Error("Tier already exists for season and name");
  }
}

/**
 * Creates a tier after validating its season and uniqueness constraints.
 *
 * @param ctx Convex mutation context.
 * @param data New tier payload.
 * @returns The inserted tier document.
 */
async function createTierRecord(ctx: MutationCtx, data: TierCreatePayload) {
  validateTierData(data);

  const season = await ctx.db.get(data.seasonId);
  if (!season) {
    throw new Error("Season not found");
  }

  await assertUniqueTierNameWithinSeason(ctx, data.seasonId, data.name);

  const tierId = await ctx.db.insert("tiers", {
    ...data,
    updatedAt: Date.now(),
  });

  return await ctx.db.get(tierId);
}

/**
 * Updates a tier after validating season existence and uniqueness constraints.
 *
 * @param ctx Convex mutation context.
 * @param tierId Tier document id.
 * @param data Partial tier fields to update.
 * @returns The updated tier document.
 */
async function updateTierRecord(
  ctx: MutationCtx,
  tierId: Id<"tiers">,
  data: TierUpdatePayload,
) {
  const existing = await ctx.db.get(tierId);
  if (!existing) {
    throw new Error("Tier not found");
  }

  const nextSeasonId = data.seasonId ?? existing.seasonId;
  const nextName = data.name ?? existing.name;

  validateTierData({
    payouts: data.payouts ?? existing.payouts,
    points: data.points ?? existing.points,
  });

  const season = await ctx.db.get(nextSeasonId);
  if (!season) {
    throw new Error("Season not found");
  }

  await assertUniqueTierNameWithinSeason(ctx, nextSeasonId, nextName, tierId);

  await ctx.db.patch(
    tierId,
    omitUndefined({
      ...data,
      updatedAt: Date.now(),
    }),
  );

  return await ctx.db.get(tierId);
}

/**
 * Deletes a tier and cascades the removal to tournaments that reference it and
 * their direct child rows.
 *
 * @param ctx Convex mutation context.
 * @param tierId Tier document id.
 * @returns Confirmation with cascade delete counts.
 */
async function deleteTierRecord(ctx: MutationCtx, tierId: Id<"tiers">) {
  const existing = await ctx.db.get(tierId);
  if (!existing) {
    throw new Error("Tier not found");
  }

  const tournaments = await ctx.db
    .query("tournaments")
    .withIndex("by_tier", (q) => q.eq("tierId", tierId))
    .collect();

  const teamsByTournament = await Promise.all(
    tournaments.map((tournament) =>
      ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect(),
    ),
  );

  const tournamentGolfersByTournament = await Promise.all(
    tournaments.map((tournament) =>
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect(),
    ),
  );

  const teams = teamsByTournament.flat();
  const tournamentGolfers = tournamentGolfersByTournament.flat();

  await Promise.all([
    ...teams.map((team) => ctx.db.delete(team._id)),
    ...tournamentGolfers.map((tournamentGolfer) =>
      ctx.db.delete(tournamentGolfer._id),
    ),
    ...tournaments.map((tournament) => ctx.db.delete(tournament._id)),
  ]);

  await ctx.db.delete(tierId);

  return {
    ok: true,
    tierId,
    deletedTournaments: tournaments.length,
    deletedTeams: teams.length,
    deletedTournamentGolfers: tournamentGolfers.length,
  } as const;
}

/**
 * Resolves tier lists from query options using logical filtering, sorting, and
 * pagination.
 *
 * @param ctx Convex query context.
 * @param options Tier query options.
 * @returns Matching tier rows.
 */
async function getTiersForOptions(ctx: QueryCtx, options: TierQueryOptions) {
  const filter = options.filter ?? {};
  const sort = options.sort ?? {};
  const pagination = options.pagination ?? {};

  const tiers = await listTiers(ctx, {
    id: options.id,
    ids: options.ids,
    seasonId: filter.seasonId,
  });

  const filtered = filterTiers(tiers, filter);
  const sorted = sortTiers(filtered, sort);
  return paginateTiers(sorted, pagination);
}

/**
 * Returns a tier by its document id.
 *
 * @param tierId Tier document id.
 * @returns The matching tier document, or null when missing.
 */
export const getTier = query({
  args: tiersValidators.args.getTier,
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tierId);
  },
});

export const getTiers = query({
  args: tiersValidators.args.getTiers,
  handler: async (ctx, args) => {
    return await getTiersForOptions(ctx, args.options ?? {});
  },
});

/**
 * Admin-only mutation that creates a tier.
 *
 * @param data New tier payload.
 * @returns The inserted tier document.
 */
export const createTier = mutation({
  args: tiersValidators.args.createTier,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await createTierRecord(ctx, args.data);
  },
});

/**
 * Admin-only mutation that updates a tier.
 *
 * @param tierId Tier document id.
 * @param data Partial tier fields to update.
 * @returns The updated tier document.
 */
export const updateTier = mutation({
  args: tiersValidators.args.updateTier,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await updateTierRecord(ctx, args.tierId, args.data);
  },
});

/**
 * Admin-only mutation that deletes a tier and any tournaments directly linked
 * to it.
 *
 * @param tierId Tier document id.
 * @returns Confirmation with cascade delete counts.
 */
export const deleteTier = mutation({
  args: tiersValidators.args.deleteTier,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await deleteTierRecord(ctx, args.tierId);
  },
});
