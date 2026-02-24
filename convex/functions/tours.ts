import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

/**
 * Returns tours with optional filtering, sorting, pagination, and enhancement.
 */
export const getTours = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("tours")),
        ids: v.optional(v.array(v.id("tours"))),
        filter: v.optional(
          v.object({
            seasonId: v.optional(v.id("seasons")),
            shortForm: v.optional(v.string()),
            minBuyIn: v.optional(v.number()),
            maxBuyIn: v.optional(v.number()),
            minParticipants: v.optional(v.number()),
            maxParticipants: v.optional(v.number()),
            searchTerm: v.optional(v.string()),
            playoffSpotsMin: v.optional(v.number()),
            playoffSpotsMax: v.optional(v.number()),
            createdAfter: v.optional(v.number()),
            createdBefore: v.optional(v.number()),
            updatedAfter: v.optional(v.number()),
            updatedBefore: v.optional(v.number()),
          }),
        ),
        sort: v.optional(
          v.object({
            sortBy: v.optional(
              v.union(
                v.literal("name"),
                v.literal("shortForm"),
                v.literal("buyIn"),
                v.literal("maxParticipants"),
                v.literal("createdAt"),
                v.literal("updatedAt"),
                v.literal("playoffSpots"),
              ),
            ),
            sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
          }),
        ),
        pagination: v.optional(
          v.object({
            limit: v.optional(v.number()),
            offset: v.optional(v.number()),
          }),
        ),
        enhance: v.optional(
          v.object({
            includeSeason: v.optional(v.boolean()),
            includeTournaments: v.optional(v.boolean()),
            includeParticipants: v.optional(v.boolean()),
            includeStatistics: v.optional(v.boolean()),
            includeTourCards: v.optional(v.boolean()),
          }),
        ),
        includeAnalytics: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options ?? {};
    const filter = options.filter ?? {};
    const sort = options.sort ?? {};
    const pagination = options.pagination ?? {};
    const enhance = options.enhance ?? {};

    let tours: Doc<"tours">[];

    if (options.id) {
      const single = await ctx.db.get(options.id);
      tours = single ? [single] : [];
    } else if (options.ids && options.ids.length > 0) {
      const docs = await Promise.all(options.ids.map((id) => ctx.db.get(id)));
      tours = docs.filter((tour): tour is Doc<"tours"> => tour !== null);
    } else if (filter.seasonId) {
      tours = await ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", filter.seasonId!))
        .collect();
    } else {
      tours = await ctx.db.query("tours").collect();
    }

    const filtered = tours.filter((tour) => {
      if (filter.shortForm && tour.shortForm !== filter.shortForm) return false;
      if (filter.minBuyIn !== undefined && tour.buyIn < filter.minBuyIn)
        return false;
      if (filter.maxBuyIn !== undefined && tour.buyIn > filter.maxBuyIn)
        return false;
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

    const sortOrder = sort.sortOrder === "asc" ? 1 : -1;
    const sortBy = sort.sortBy ?? "name";

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "shortForm")
        return a.shortForm.localeCompare(b.shortForm) * sortOrder;
      if (sortBy === "buyIn") return (a.buyIn - b.buyIn) * sortOrder;
      if (sortBy === "maxParticipants") {
        return (
          ((a.maxParticipants ?? 0) - (b.maxParticipants ?? 0)) * sortOrder
        );
      }
      if (sortBy === "createdAt")
        return (a._creationTime - b._creationTime) * sortOrder;
      if (sortBy === "updatedAt")
        return ((a.updatedAt ?? 0) - (b.updatedAt ?? 0)) * sortOrder;
      if (sortBy === "playoffSpots") {
        return (a.playoffSpots.length - b.playoffSpots.length) * sortOrder;
      }
      return a.name.localeCompare(b.name) * sortOrder;
    });

    const offset = Math.max(0, pagination.offset ?? 0);
    const limit =
      pagination.limit && pagination.limit > 0
        ? pagination.limit
        : sorted.length;
    const paginated = sorted.slice(offset, offset + limit);

    if (!enhance.includeSeason) {
      return paginated;
    }

    return await Promise.all(
      paginated.map(async (tour) => ({
        ...tour,
        season: (await ctx.db.get(tour.seasonId)) ?? undefined,
      })),
    );
  },
});
