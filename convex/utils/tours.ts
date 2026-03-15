import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { formatCents } from "./misc";
import type {
  TourEnhanceOptions,
  TourFilterOptions,
  TourPaginationOptions,
  TourSortOptions,
} from "../types/tours";

/**
 * Loads tours based on id, ids, season, or full-table fallback.
 *
 * @param ctx Convex query context.
 * @param options Tour selectors.
 * @returns Matching tour documents.
 */
export async function listTours(
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

/**
 * Applies logical filters to a tour collection.
 *
 * @param tours Tour documents to filter.
 * @param filter Requested filter settings.
 * @returns Filtered tours.
 */
export function filterTours(
  tours: Doc<"tours">[],
  filter: TourFilterOptions = {},
) {
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
export function sortTours(tours: Doc<"tours">[], sort: TourSortOptions = {}) {
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
export function paginateTours(
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
export async function enhanceTours(
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
