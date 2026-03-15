import { v } from "convex/values";

const seasonOptionalFields = {
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  registrationDeadline: v.optional(v.number()),
};

const seasonCreateData = v.object({
  year: v.number(),
  number: v.number(),
  ...seasonOptionalFields,
});

const seasonUpdateData = v.object({
  year: v.optional(v.number()),
  number: v.optional(v.number()),
  ...seasonOptionalFields,
});

const getSeasonsOptions = v.optional(
  v.object({
    sort: v.optional(
      v.object({
        sortBy: v.optional(v.union(v.literal("year"), v.literal("number"))),
        sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
      }),
    ),
  }),
);

export const seasonsValidators = {
  data: {
    seasonCreateData,
    seasonUpdateData,
  },
  args: {
    getSeason: {
      seasonId: v.id("seasons"),
    },
    getCurrentSeason: {},
    getSeasons: {
      options: getSeasonsOptions,
    },
    getStandingsViewData: {
      seasonId: v.id("seasons"),
    },
    createSeason: {
      data: seasonCreateData,
    },
    updateSeason: {
      seasonId: v.id("seasons"),
      data: seasonUpdateData,
    },
    deleteSeason: {
      seasonId: v.id("seasons"),
    },
  },
} as const;
