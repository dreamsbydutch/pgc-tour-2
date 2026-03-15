import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type {
  TourCreatePayload,
  TourEnhanceOptions,
  TourFilterOptions,
  TourPaginationOptions,
  TourQueryOptions,
  TourSortOptions,
  TourUpdatePayload,
  TourWithSeason,
} from "../types/tours";
import { omitUndefined } from "../utils/_shared/object";
import { requireAdmin } from "../utils/auth";
import { toursValidators } from "../validators/tours";
import { getCurrentSeasonId } from "../utils/seasons";
import { formatCents } from "../utils/tours";

// Level 0: shared context types

type TourFunctionContext = MutationCtx | QueryCtx;

/**
 * Loads tours based on id, ids, season, or full-table fallback.
 *
 * @param ctx Convex query context.
 * @param options Tour selectors.
 * @returns Matching tour documents.
 */
async function listTours(
  ctx: QueryCtx,
  options: {
    id?: Id<"tours">;
    ids?: Id<"tours">[];
    seasonId?: Id<"seasons">;
  },
) {
  if (options.id) {
    const tour = await ctx.db.get(options.id);
    return tour ? [tour] : [];
  }

  if (options.ids && options.ids.length > 0) {
    const docs = await Promise.all(options.ids.map((id) => ctx.db.get(id)));
    return docs.filter((tour): tour is Doc<"tours"> => tour !== null);
  }

  if (options.seasonId) {
    return await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", options.seasonId!))
      .collect();
  }

  return await ctx.db.query("tours").collect();
}

/** Attaches the required season document to each tour result. */
async function hydrateToursWithSeason(
  ctx: QueryCtx,
  tours: Doc<"tours">[],
): Promise<TourWithSeason[]> {
  const hydrated = await Promise.all(
    tours.map(async (tour) => {
      const season = await ctx.db.get(tour.seasonId);

      if (!season) {
        throw new Error("Season not found");
      }

      return {
        ...tour,
        season,
      };
    }),
  );

  return hydrated;
}

/**
 * Applies logical filters to a tour collection.
 *
 * @param tours Tour documents to filter.
 * @param filter Requested filter settings.
 * @returns Filtered tours.
 */
function filterTours(tours: Doc<"tours">[], filter: TourFilterOptions = {}) {
  return tours.filter((tour) => {
    if (filter.shortForm && tour.shortForm !== filter.shortForm) {
      return false;
    }

    if (filter.minBuyIn !== undefined && tour.buyIn < filter.minBuyIn) {
      return false;
    }

    if (filter.maxBuyIn !== undefined && tour.buyIn > filter.maxBuyIn) {
      return false;
    }

    if (
      filter.minParticipants !== undefined &&
      (tour.maxParticipants ?? 0) < filter.minParticipants
    ) {
      return false;
    }

    if (
      filter.maxParticipants !== undefined &&
      (tour.maxParticipants ?? 0) > filter.maxParticipants
    ) {
      return false;
    }

    if (
      filter.searchTerm &&
      !`${tour.name} ${tour.shortForm}`
        .toLowerCase()
        .includes(filter.searchTerm.toLowerCase())
    ) {
      return false;
    }

    if (
      filter.playoffSpotsMin !== undefined &&
      tour.playoffSpots.length < filter.playoffSpotsMin
    ) {
      return false;
    }

    if (
      filter.playoffSpotsMax !== undefined &&
      tour.playoffSpots.length > filter.playoffSpotsMax
    ) {
      return false;
    }

    if (
      filter.createdAfter !== undefined &&
      tour._creationTime < filter.createdAfter
    ) {
      return false;
    }

    if (
      filter.createdBefore !== undefined &&
      tour._creationTime > filter.createdBefore
    ) {
      return false;
    }

    if (
      filter.updatedAfter !== undefined &&
      (tour.updatedAt ?? 0) < filter.updatedAfter
    ) {
      return false;
    }

    if (
      filter.updatedBefore !== undefined &&
      (tour.updatedAt ?? 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Sorts tours by supported read options.
 *
 * @param tours Tour documents to sort.
 * @param sort Requested sort settings.
 * @returns Sorted tours.
 */
function sortTours(tours: Doc<"tours">[], sort: TourSortOptions = {}) {
  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;
  const sortBy = sort.sortBy ?? "name";

  return [...tours].sort((a, b) => {
    if (sortBy === "shortForm") {
      return a.shortForm.localeCompare(b.shortForm) * sortOrder;
    }

    if (sortBy === "buyIn") {
      return (a.buyIn - b.buyIn) * sortOrder;
    }

    if (sortBy === "maxParticipants") {
      return ((a.maxParticipants ?? 0) - (b.maxParticipants ?? 0)) * sortOrder;
    }

    if (sortBy === "createdAt") {
      return (a._creationTime - b._creationTime) * sortOrder;
    }

    if (sortBy === "updatedAt") {
      return ((a.updatedAt ?? 0) - (b.updatedAt ?? 0)) * sortOrder;
    }

    if (sortBy === "playoffSpots") {
      return (a.playoffSpots.length - b.playoffSpots.length) * sortOrder;
    }

    return a.name.localeCompare(b.name) * sortOrder;
  });
}

/**
 * Applies offset/limit pagination to a tour collection.
 *
 * @param tours Tour documents to paginate.
 * @param pagination Requested pagination settings.
 * @returns Paginated tours.
 */
function paginateTours(
  tours: Doc<"tours">[],
  pagination: TourPaginationOptions = {},
) {
  const offset = Math.max(0, pagination.offset ?? 0);
  const limit =
    pagination.limit && pagination.limit > 0 ? pagination.limit : tours.length;

  return tours.slice(offset, offset + limit);
}

/**
 * Optionally enriches tours with season, tour-card, participant, and season
 * tournament data plus lightweight computed analytics.
 *
 * @param ctx Convex query context.
 * @param tours Tour documents to enhance.
 * @param enhance Requested related entities.
 * @param includeAnalytics Whether computed analytics should be attached.
 * @returns Tour rows with requested related docs and computed fields attached.
 */
async function enhanceTours(
  ctx: QueryCtx,
  tours: Doc<"tours">[],
  enhance: TourEnhanceOptions = {},
  includeAnalytics?: boolean,
) {
  const shouldEnhance =
    enhance.includeSeason ||
    enhance.includeTournaments ||
    enhance.includeParticipants ||
    enhance.includeStatistics ||
    enhance.includeTourCards ||
    includeAnalytics;

  if (!shouldEnhance) {
    return tours;
  }

  return await Promise.all(
    tours.map(async (tour) => {
      const [season, seasonTournaments, tourCards] = await Promise.all([
        enhance.includeSeason
          ? ctx.db.get(tour.seasonId)
          : Promise.resolve(null),
        enhance.includeTournaments || enhance.includeStatistics
          ? ctx.db
              .query("tournaments")
              .withIndex("by_season", (q) => q.eq("seasonId", tour.seasonId))
              .collect()
          : Promise.resolve([]),
        enhance.includeTourCards ||
        enhance.includeParticipants ||
        enhance.includeStatistics
          ? ctx.db
              .query("tourCards")
              .withIndex("by_tour", (q) => q.eq("tourId", tour._id))
              .collect()
          : Promise.resolve([]),
      ]);

      const participants = enhance.includeParticipants
        ? await Promise.all(
            tourCards.map(async (tourCard) => ({
              ...tourCard,
              member: await ctx.db.get(tourCard.memberId),
            })),
          )
        : undefined;

      return {
        ...tour,
        season: enhance.includeSeason ? (season ?? undefined) : undefined,
        tournaments: enhance.includeTournaments ? seasonTournaments : undefined,
        tournamentCount:
          enhance.includeStatistics || includeAnalytics
            ? seasonTournaments.length
            : undefined,
        participants,
        tourCards: enhance.includeTourCards ? tourCards : undefined,
        buyInFormatted:
          enhance.includeStatistics || includeAnalytics
            ? formatCents(tour.buyIn)
            : undefined,
        totalPlayoffSpots:
          enhance.includeStatistics || includeAnalytics
            ? tour.playoffSpots.length
            : undefined,
      };
    }),
  );
}

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

/** Returns whether the current caller is authenticated. */
async function isSignedIn(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return Boolean(identity?.subject);
}

/** Hydrates one tour with its required season payload. */
async function hydrateTourResponse(
  ctx: TourFunctionContext,
  tourId: Id<"tours">,
): Promise<TourWithSeason> {
  const tour = await ctx.db.get(tourId);

  if (!tour) {
    throw new Error("Tour not found");
  }

  const season = await ctx.db.get(tour.seasonId);

  if (!season) {
    throw new Error("Season not found");
  }

  return {
    ...tour,
    season,
  };
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

  return await hydrateTourResponse(ctx, tourId);
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

  return await hydrateTourResponse(ctx, tourId);
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

  const deletedTour = await hydrateTourResponse(ctx, tourId);

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
    tour: deletedTour,
    tourId,
    deletedTourCards: tourCards.length,
    deletedTeams: teams.length,
  } as const;
}

/** Returns whether a hydrated tour is readable by the current caller. */
async function canReadTour(ctx: QueryCtx, tourId: Id<"tours">) {
  if (await isSignedIn(ctx)) {
    return true;
  }

  const currentSeasonId = await getCurrentSeasonId(ctx);
  if (!currentSeasonId) {
    return false;
  }

  const tour = await ctx.db.get(tourId);
  return tour?.seasonId === currentSeasonId;
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
  const signedIn = await isSignedIn(ctx);
  const requestedSeasonId = filter.seasonId;
  const currentSeasonId = signedIn ? null : await getCurrentSeasonId(ctx);

  if (!signedIn && !currentSeasonId) {
    return [];
  }

  if (!signedIn && requestedSeasonId && requestedSeasonId !== currentSeasonId) {
    return [];
  }

  const effectiveSeasonId = signedIn
    ? requestedSeasonId
    : (currentSeasonId ?? undefined);

  const tours = await listTours(ctx, {
    id: options.id,
    ids: options.ids,
    seasonId: options.id || options.ids?.length ? undefined : effectiveSeasonId,
  });

  const gatedTours = signedIn
    ? tours
    : tours.filter((tour) => tour.seasonId === currentSeasonId);

  const filtered = filterTours(gatedTours, filter);
  const sorted = sortTours(filtered, sort);
  const paginated = paginateTours(sorted, pagination);
  const hydratedTours = await hydrateToursWithSeason(ctx, paginated);

  const shouldEnhanceBeyondSeason =
    enhance.includeTournaments ||
    enhance.includeParticipants ||
    enhance.includeStatistics ||
    enhance.includeTourCards ||
    options.includeAnalytics;

  if (!shouldEnhanceBeyondSeason) {
    return hydratedTours;
  }

  const enhancedTours = await enhanceTours(
    ctx,
    paginated,
    {
      ...enhance,
      includeSeason: false,
    },
    options.includeAnalytics,
  );

  const seasonByTourId = new Map(
    hydratedTours.map((tour) => [tour._id, tour.season] as const),
  );

  return enhancedTours.map((tour) => {
    const season = seasonByTourId.get(tour._id);

    if (!season) {
      throw new Error("Season not found");
    }

    return {
      ...tour,
      season,
    };
  });
}

/**
 * Returns a hydrated tour by its document id when the caller can read it.
 */
export const getTour = query({
  args: toursValidators.args.getTour,
  handler: async (ctx, args) => {
    if (!(await canReadTour(ctx, args.tourId))) {
      return null;
    }

    return await hydrateTourResponse(ctx, args.tourId);
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
