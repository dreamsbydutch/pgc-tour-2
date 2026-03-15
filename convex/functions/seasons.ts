import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type {
  SeasonCreatePayload,
  SeasonQueryOptions,
  SeasonUpdatePayload,
} from "../types/seasons";
import { omitUndefined } from "../utils/misc";
import {
  findCurrentSeason,
  getStandingsViewDataForSeason,
  listSeasons,
  sortSeasons,
} from "../utils/seasons";
import { requireAdmin } from "../utils/auth";
import { seasonsValidators } from "../validators/seasons";

/**
 * Validates season date relationships before create or update writes.
 *
 * @param data Season payload to validate.
 */
function validateSeasonDates(data: {
  startDate?: number;
  endDate?: number;
  registrationDeadline?: number;
}) {
  if (
    data.startDate !== undefined &&
    data.endDate !== undefined &&
    data.startDate > data.endDate
  ) {
    throw new Error("Season startDate must be before or equal to endDate");
  }

  if (
    data.registrationDeadline !== undefined &&
    data.startDate !== undefined &&
    data.registrationDeadline > data.startDate
  ) {
    throw new Error(
      "Season registrationDeadline must be before or equal to startDate",
    );
  }
}

/**
 * Ensures there is not already another season with the same year and number.
 *
 * @param ctx Convex mutation context.
 * @param year Season year.
 * @param number Season number.
 * @param excludeSeasonId Optional season id to exclude during updates.
 */
async function assertUniqueSeasonYearAndNumber(
  ctx: MutationCtx,
  year: number,
  number: number,
  excludeSeasonId?: Id<"seasons">,
) {
  const sameYearSeasons = await ctx.db
    .query("seasons")
    .withIndex("by_year", (q) => q.eq("year", year))
    .collect();

  const duplicate = sameYearSeasons.find(
    (season) => season.number === number && season._id !== excludeSeasonId,
  );

  if (duplicate) {
    throw new Error("Season already exists for year and number");
  }
}

/**
 * Creates a season after validating date relationships and year/number
 * uniqueness.
 *
 * @param ctx Convex mutation context.
 * @param data New season payload.
 * @returns The inserted season document.
 */
async function createSeasonRecord(ctx: MutationCtx, data: SeasonCreatePayload) {
  validateSeasonDates(data);
  await assertUniqueSeasonYearAndNumber(ctx, data.year, data.number);

  const seasonId = await ctx.db.insert("seasons", {
    ...data,
    updatedAt: Date.now(),
  });

  return await ctx.db.get(seasonId);
}

/**
 * Updates a season after validating date relationships and year/number
 * uniqueness.
 *
 * @param ctx Convex mutation context.
 * @param seasonId Season document id.
 * @param data Partial season fields to update.
 * @returns The updated season document.
 */
async function updateSeasonRecord(
  ctx: MutationCtx,
  seasonId: Id<"seasons">,
  data: SeasonUpdatePayload,
) {
  const existing = await ctx.db.get(seasonId);
  if (!existing) {
    throw new Error("Season not found");
  }

  const nextYear = data.year ?? existing.year;
  const nextNumber = data.number ?? existing.number;

  validateSeasonDates({
    startDate: data.startDate ?? existing.startDate,
    endDate: data.endDate ?? existing.endDate,
    registrationDeadline:
      data.registrationDeadline ?? existing.registrationDeadline,
  });

  await assertUniqueSeasonYearAndNumber(ctx, nextYear, nextNumber, seasonId);

  await ctx.db.patch(
    seasonId,
    omitUndefined({
      ...data,
      updatedAt: Date.now(),
    }),
  );

  return await ctx.db.get(seasonId);
}

/**
 * Deletes a season and cascades the removal to season-scoped child records.
 *
 * @param ctx Convex mutation context.
 * @param seasonId Season document id.
 * @returns Confirmation with cascade delete counts.
 */
async function deleteSeasonRecord(ctx: MutationCtx, seasonId: Id<"seasons">) {
  const existing = await ctx.db.get(seasonId);
  if (!existing) {
    throw new Error("Season not found");
  }

  const [tours, tiers, tournaments, tourCards, transactions] =
    await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
      ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
      ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
      ctx.db
        .query("transactions")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
    ]);

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
    ...tourCards.map((tourCard) => ctx.db.delete(tourCard._id)),
    ...tours.map((tour) => ctx.db.delete(tour._id)),
    ...tiers.map((tier) => ctx.db.delete(tier._id)),
    ...transactions.map((transaction) => ctx.db.delete(transaction._id)),
  ]);

  await ctx.db.delete(seasonId);

  return {
    ok: true,
    seasonId,
    deletedTours: tours.length,
    deletedTiers: tiers.length,
    deletedTournaments: tournaments.length,
    deletedTourCards: tourCards.length,
    deletedTeams: teams.length,
    deletedTournamentGolfers: tournamentGolfers.length,
    deletedTransactions: transactions.length,
  } as const;
}

/**
 * Resolves season lists from query options.
 *
 * @param options Season query options.
 * @returns Matching season rows.
 */
async function getSeasonsForOptions(
  ctx: QueryCtx,
  options: SeasonQueryOptions,
) {
  const seasons = await listSeasons(ctx);
  return sortSeasons(seasons, options.sort);
}

/**
 * Returns a season by its document id.
 *
 * @param seasonId Season document id.
 * @returns The matching season document, or null when missing.
 */
export const getSeason = query({
  args: seasonsValidators.args.getSeason,
  handler: async (ctx, args) => {
    return await ctx.db.get(args.seasonId);
  },
});

export const getCurrentSeason = query({
  args: seasonsValidators.args.getCurrentSeason,
  handler: async (ctx) => {
    const seasons = await listSeasons(ctx);
    return findCurrentSeason(seasons);
  },
});

/**
 * Returns seasons with optional sort settings.
 *
 * @param options Season query options.
 * @returns Matching season rows.
 */
export const getSeasons = query({
  args: seasonsValidators.args.getSeasons,
  handler: async (ctx, args) => {
    return await getSeasonsForOptions(ctx, args.options ?? {});
  },
});

/**
 * Returns the season-scoped data needed by the standings view.
 *
 * @param seasonId Season document id.
 * @returns Tours, tiers, tournaments, tour cards, teams, and transactions.
 */
export const getStandingsViewData = query({
  args: seasonsValidators.args.getStandingsViewData,
  handler: async (ctx, args) => {
    return await getStandingsViewDataForSeason(ctx, args.seasonId);
  },
});

/**
 * Admin-only mutation that creates a season.
 *
 * @param data New season payload.
 * @returns The inserted season document.
 */
export const createSeason = mutation({
  args: seasonsValidators.args.createSeason,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await createSeasonRecord(ctx, args.data);
  },
});

/**
 * Admin-only mutation that updates a season.
 *
 * @param seasonId Season document id.
 * @param data Partial season fields to update.
 * @returns The updated season document.
 */
export const updateSeason = mutation({
  args: seasonsValidators.args.updateSeason,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await updateSeasonRecord(ctx, args.seasonId, args.data);
  },
});

/**
 * Admin-only mutation that deletes a season and its season-scoped child data.
 *
 * @param seasonId Season document id.
 * @returns Confirmation with cascade delete counts.
 */
export const deleteSeason = mutation({
  args: seasonsValidators.args.deleteSeason,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await deleteSeasonRecord(ctx, args.seasonId);
  },
});
