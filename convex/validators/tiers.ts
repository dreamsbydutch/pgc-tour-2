import { v } from "convex/values";

const tierSortBy = v.union(
  v.literal("name"),
  v.literal("createdAt"),
  v.literal("updatedAt"),
  v.literal("totalPayouts"),
  v.literal("totalPoints"),
  v.literal("payoutCount"),
  v.literal("pointCount"),
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
        name: v.optional(v.string()),
        searchTerm: v.optional(v.string()),
        minTotalPayouts: v.optional(v.number()),
        maxTotalPayouts: v.optional(v.number()),
        minTotalPoints: v.optional(v.number()),
        maxTotalPoints: v.optional(v.number()),
        minPayoutCount: v.optional(v.number()),
        maxPayoutCount: v.optional(v.number()),
        minPointCount: v.optional(v.number()),
        maxPointCount: v.optional(v.number()),
        createdAfter: v.optional(v.number()),
        createdBefore: v.optional(v.number()),
        updatedAfter: v.optional(v.number()),
        updatedBefore: v.optional(v.number()),
      }),
    ),
    sort: v.optional(
      v.object({
        sortBy: v.optional(tierSortBy),
        sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
      }),
    ),
    pagination: v.optional(
      v.object({
        limit: v.optional(v.number()),
        offset: v.optional(v.number()),
      }),
    ),
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
