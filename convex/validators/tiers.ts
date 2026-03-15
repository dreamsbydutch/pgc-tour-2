import { v } from "convex/values";
import { paginationValidator, sortOrderValidator } from "./_shared";

const tierSortBy = v.union(
  v.literal("name"),
  v.literal("createdAt"),
  v.literal("updatedAt"),
  v.literal("payouts"),
  v.literal("points"),
);

const tierCreateData = v.object({
  name: v.string(),
  seasonId: v.id("seasons"),
  payouts: v.array(v.number()),
  points: v.array(v.number()),
});

const tierUpdateData = v.object({
  name: v.optional(v.string()),
  seasonId: v.optional(v.id("seasons")),
  payouts: v.optional(v.array(v.number())),
  points: v.optional(v.array(v.number())),
});

const getTiersOptions = v.optional(
  v.object({
    id: v.optional(v.id("tiers")),
    ids: v.optional(v.array(v.id("tiers"))),
    filter: v.optional(
      v.object({
        seasonId: v.optional(v.id("seasons")),
        searchTerm: v.optional(v.string()),
        payoutsMin: v.optional(v.number()),
        payoutsMax: v.optional(v.number()),
        pointsMin: v.optional(v.number()),
        pointsMax: v.optional(v.number()),
        createdAfter: v.optional(v.number()),
        createdBefore: v.optional(v.number()),
        updatedAfter: v.optional(v.number()),
        updatedBefore: v.optional(v.number()),
      }),
    ),
    sort: v.optional(
      v.object({
        sortBy: v.optional(tierSortBy),
        sortOrder: v.optional(sortOrderValidator),
      }),
    ),
    pagination: v.optional(paginationValidator),
  }),
);

export const tiersValidators = {
  data: {
    tierCreateData,
    tierUpdateData,
  },
  args: {
    getTier: {
      tierId: v.id("tiers"),
    },
    getTiers: {
      options: getTiersOptions,
    },
    createTier: {
      data: tierCreateData,
    },
    updateTier: {
      tierId: v.id("tiers"),
      data: tierUpdateData,
    },
    deleteTier: {
      tierId: v.id("tiers"),
    },
  },
} as const;
