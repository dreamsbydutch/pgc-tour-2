import { v } from "convex/values";
import { paginationValidator, sortOrderValidator } from "./_shared";

const tourSortBy = v.union(
  v.literal("name"),
  v.literal("shortForm"),
  v.literal("buyIn"),
  v.literal("maxParticipants"),
  v.literal("createdAt"),
  v.literal("updatedAt"),
  v.literal("playoffSpots"),
);

const tourOptionalFields = {
  maxParticipants: v.optional(v.number()),
};

const tourCreateData = v.object({
  name: v.string(),
  shortForm: v.string(),
  logoUrl: v.string(),
  seasonId: v.id("seasons"),
  buyIn: v.number(),
  playoffSpots: v.array(v.number()),
  ...tourOptionalFields,
});

const tourUpdateData = v.object({
  name: v.optional(v.string()),
  shortForm: v.optional(v.string()),
  logoUrl: v.optional(v.string()),
  seasonId: v.optional(v.id("seasons")),
  buyIn: v.optional(v.number()),
  playoffSpots: v.optional(v.array(v.number())),
  ...tourOptionalFields,
});

const getToursOptions = v.optional(
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
        sortBy: v.optional(tourSortBy),
        sortOrder: v.optional(sortOrderValidator),
      }),
    ),
    pagination: v.optional(paginationValidator),
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
);

export const toursValidators = {
  data: {
    tourCreateData,
    tourUpdateData,
  },
  args: {
    getTour: {
      tourId: v.id("tours"),
    },
    getTours: {
      options: getToursOptions,
    },
    createTour: {
      data: tourCreateData,
    },
    updateTour: {
      tourId: v.id("tours"),
      data: tourUpdateData,
    },
    deleteTour: {
      tourId: v.id("tours"),
    },
  },
} as const;
