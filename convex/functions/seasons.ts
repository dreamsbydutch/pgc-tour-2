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
import { requireAdmin } from "../utils/auth";
import { omitUndefined } from "../utils/_shared/object";
import { findCurrentSeason, listSeasons, sortSeasons } from "../utils/seasons";
import { seasonsValidators } from "../validators/seasons";

// Level 0: shared context types

type SeasonFunctionContext = MutationCtx | QueryCtx;

// Level 1: mutation validation and record helpers

/** Validates season date relationships before create or update writes. */
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

/** Ensures there is not already another season with the same year and number. */
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

/** Creates a season after validating date relationships and year/number uniqueness. */
async function createSeasonRecord(ctx: MutationCtx, data: SeasonCreatePayload) {
  validateSeasonDates(data);
  await assertUniqueSeasonYearAndNumber(ctx, data.year, data.number);

  const seasonId = await ctx.db.insert("seasons", {
    ...data,
    updatedAt: Date.now(),
  });

  return await ctx.db.get(seasonId);
}

/** Updates a season after validating date relationships and year/number uniqueness. */
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

/** Deletes a season and cascades the removal to season-scoped child records. */
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

// Level 2: query composition helpers

/** Returns one season by id or null when it does not exist. */
async function getSeasonById(
  ctx: SeasonFunctionContext,
  seasonId: Id<"seasons">,
) {
  return await ctx.db.get(seasonId);
}

/** Resolves season lists from query options into a sorted collection. */
async function getSeasonsForOptions(
  ctx: QueryCtx,
  options: SeasonQueryOptions,
) {
  const seasons = await listSeasons(ctx);
  return sortSeasons(seasons, options.sort);
}

// Level 3: public and authenticated read queries

/** Returns a season by its document id. */
export const getSeason = query({
  args: seasonsValidators.args.getSeason,
  handler: async (ctx, args) => {
    return await getSeasonById(ctx, args.seasonId);
  },
});

/** Returns the current season using the current calendar year fallback rules. */
export const getCurrentSeason = query({
  args: seasonsValidators.args.getCurrentSeason,
  handler: async (ctx) => {
    const seasons = await listSeasons(ctx);
    return findCurrentSeason(seasons);
  },
});

/** Returns seasons with optional sort settings. */
export const getSeasons = query({
  args: seasonsValidators.args.getSeasons,
  handler: async (ctx, args) => {
    return await getSeasonsForOptions(ctx, args.options ?? {});
  },
});

// Level 4: admin write mutations

/** Admin-only mutation that creates a season. */
export const createSeason = mutation({
  args: seasonsValidators.args.createSeason,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await createSeasonRecord(ctx, args.data);
  },
});

/** Admin-only mutation that updates a season. */
export const updateSeason = mutation({
  args: seasonsValidators.args.updateSeason,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await updateSeasonRecord(ctx, args.seasonId, args.data);
  },
});

/** Admin-only mutation that deletes a season and its season-scoped child data. */
export const deleteSeason = mutation({
  args: seasonsValidators.args.deleteSeason,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await deleteSeasonRecord(ctx, args.seasonId);
  },
});
