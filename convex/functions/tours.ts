import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type {
  TourCreatePayload,
  TourQueryOptions,
  TourUpdatePayload,
} from "../types/tours";
import { omitUndefined } from "../utils/misc";
import {
  enhanceTours,
  filterTours,
  listTours,
  paginateTours,
  sortTours,
} from "../utils/tours";
import { requireAdmin } from "../utils/auth";
import { toursValidators } from "../validators/tours";

/**
 * Validates tour data before create or update writes.
 *
 * @param data Tour payload to validate.
 */
function validateTourData(data: {
  buyIn?: number;
  playoffSpots?: number[];
  maxParticipants?: number;
}) {
  if (data.buyIn !== undefined && data.buyIn < 0) {
    throw new Error("Tour buyIn cannot be negative");
  }

  if (data.maxParticipants !== undefined && data.maxParticipants < 0) {
    throw new Error("Tour maxParticipants cannot be negative");
  }

  if (data.playoffSpots && data.playoffSpots.some((value) => value < 0)) {
    throw new Error("Tour playoffSpots cannot contain negative values");
  }
}

/**
 * Ensures there is not already another tour with the same season and name or
 * short form.
 *
 * @param ctx Convex mutation context.
 * @param seasonId Season document id.
 * @param name Tour name.
 * @param shortForm Tour short form.
 * @param excludeTourId Optional tour id to exclude during updates.
 */
async function assertUniqueTourWithinSeason(
  ctx: MutationCtx,
  seasonId: Id<"seasons">,
  name: string,
  shortForm: string,
  excludeTourId?: Id<"tours">,
) {
  const seasonTours = await ctx.db
    .query("tours")
    .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
    .collect();

  const normalizedName = name.trim().toLowerCase();
  const normalizedShortForm = shortForm.trim().toLowerCase();
  const duplicate = seasonTours.find(
    (tour) =>
      tour._id !== excludeTourId &&
      (tour.name.trim().toLowerCase() === normalizedName ||
        tour.shortForm.trim().toLowerCase() === normalizedShortForm),
  );

  if (duplicate) {
    throw new Error(
      "Tour already exists for season with this name or shortForm",
    );
  }
}

/**
 * Creates a tour after validating season existence and uniqueness constraints.
 *
 * @param ctx Convex mutation context.
 * @param data New tour payload.
 * @returns The inserted tour document.
 */
async function createTourRecord(ctx: MutationCtx, data: TourCreatePayload) {
  validateTourData(data);

  const season = await ctx.db.get(data.seasonId);
  if (!season) {
    throw new Error("Season not found");
  }

  await assertUniqueTourWithinSeason(
    ctx,
    data.seasonId,
    data.name,
    data.shortForm,
  );

  const tourId = await ctx.db.insert("tours", {
    ...data,
    updatedAt: Date.now(),
  });

  return await ctx.db.get(tourId);
}

/**
 * Updates a tour after validating season existence and uniqueness constraints.
 *
 * @param ctx Convex mutation context.
 * @param tourId Tour document id.
 * @param data Partial tour fields to update.
 * @returns The updated tour document.
 */
async function updateTourRecord(
  ctx: MutationCtx,
  tourId: Id<"tours">,
  data: TourUpdatePayload,
) {
  const existing = await ctx.db.get(tourId);
  if (!existing) {
    throw new Error("Tour not found");
  }

  const nextSeasonId = data.seasonId ?? existing.seasonId;
  const nextName = data.name ?? existing.name;
  const nextShortForm = data.shortForm ?? existing.shortForm;

  validateTourData({
    buyIn: data.buyIn ?? existing.buyIn,
    playoffSpots: data.playoffSpots ?? existing.playoffSpots,
    maxParticipants: data.maxParticipants ?? existing.maxParticipants,
  });

  const season = await ctx.db.get(nextSeasonId);
  if (!season) {
    throw new Error("Season not found");
  }

  await assertUniqueTourWithinSeason(
    ctx,
    nextSeasonId,
    nextName,
    nextShortForm,
    tourId,
  );

  await ctx.db.patch(
    tourId,
    omitUndefined({
      ...data,
      updatedAt: Date.now(),
    }),
  );

  return await ctx.db.get(tourId);
}

/**
 * Deletes a tour and cascades the removal to tour cards and their linked team
 * rows.
 *
 * @param ctx Convex mutation context.
 * @param tourId Tour document id.
 * @returns Confirmation with cascade delete counts.
 */
async function deleteTourRecord(ctx: MutationCtx, tourId: Id<"tours">) {
  const existing = await ctx.db.get(tourId);
  if (!existing) {
    throw new Error("Tour not found");
  }

  const tourCards = await ctx.db
    .query("tourCards")
    .withIndex("by_tour", (q) => q.eq("tourId", tourId))
    .collect();

  const teamsByTourCard = await Promise.all(
    tourCards.map((tourCard) =>
      ctx.db
        .query("teams")
        .withIndex("by_tour_card", (q) => q.eq("tourCardId", tourCard._id))
        .collect(),
    ),
  );

  const teams = teamsByTourCard.flat();

  await Promise.all([
    ...teams.map((team) => ctx.db.delete(team._id)),
    ...tourCards.map((tourCard) => ctx.db.delete(tourCard._id)),
  ]);

  await ctx.db.delete(tourId);

  return {
    ok: true,
    tourId,
    deletedTourCards: tourCards.length,
    deletedTeams: teams.length,
  } as const;
}

/**
 * Resolves tour lists from query options using logical filtering, sorting,
 * pagination, and optional enhancement.
 *
 * @param ctx Convex query context.
 * @param options Tour query options.
 * @returns Matching tour rows.
 */
async function getToursForOptions(ctx: QueryCtx, options: TourQueryOptions) {
  const filter = options.filter ?? {};
  const sort = options.sort ?? {};
  const pagination = options.pagination ?? {};
  const enhance = options.enhance ?? {};

  const tours = await listTours(ctx, {
    id: options.id,
    ids: options.ids,
    seasonId: filter.seasonId,
  });

  const filtered = filterTours(tours, filter);
  const sorted = sortTours(filtered, sort);
  const paginated = paginateTours(sorted, pagination);
  return await enhanceTours(ctx, paginated, enhance, options.includeAnalytics);
}

/**
 * Returns a tour by its document id.
 *
 * @param tourId Tour document id.
 * @returns The matching tour document, or null when missing.
 */
export const getTour = query({
  args: toursValidators.args.getTour,
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tourId);
  },
});

/**
 * Returns tours with optional filtering, sorting, pagination, and enhancement.
 */
export const getTours = query({
  args: toursValidators.args.getTours,
  handler: async (ctx, args) => {
    return await getToursForOptions(ctx, args.options ?? {});
  },
});

/**
 * Admin-only mutation that creates a tour.
 *
 * @param data New tour payload.
 * @returns The inserted tour document.
 */
export const createTour = mutation({
  args: toursValidators.args.createTour,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await createTourRecord(ctx, args.data);
  },
});

/**
 * Admin-only mutation that updates a tour.
 *
 * @param tourId Tour document id.
 * @param data Partial tour fields to update.
 * @returns The updated tour document.
 */
export const updateTour = mutation({
  args: toursValidators.args.updateTour,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await updateTourRecord(ctx, args.tourId, args.data);
  },
});

/**
 * Admin-only mutation that deletes a tour and its directly attached tour cards
 * and teams.
 *
 * @param tourId Tour document id.
 * @returns Confirmation with cascade delete counts.
 */
export const deleteTour = mutation({
  args: toursValidators.args.deleteTour,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await deleteTourRecord(ctx, args.tourId);
  },
});
