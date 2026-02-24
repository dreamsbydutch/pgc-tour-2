import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export const getTiers = query({
  args: {
    options: v.optional(
      v.object({
        id: v.optional(v.id("tiers")),
        ids: v.optional(v.array(v.id("tiers"))),
        filter: v.optional(
          v.object({
            seasonId: v.optional(v.id("seasons")),
            name: v.optional(v.string()),
            searchTerm: v.optional(v.string()),
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
                v.literal("createdAt"),
                v.literal("updatedAt"),
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
      }),
    ),
  },
  handler: async (ctx, args) => {
    const options = args.options ?? {};
    const filter = options.filter ?? {};
    const sort = options.sort ?? {};
    const pagination = options.pagination ?? {};

    let tiers: Doc<"tiers">[];

    if (options.id) {
      const single = await ctx.db.get(options.id);
      tiers = single ? [single] : [];
    } else if (options.ids && options.ids.length > 0) {
      const docs = await Promise.all(options.ids.map((id) => ctx.db.get(id)));
      tiers = docs.filter((tier): tier is Doc<"tiers"> => tier !== null);
    } else if (filter.seasonId) {
      tiers = await ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", filter.seasonId!))
        .collect();
    } else {
      tiers = await ctx.db.query("tiers").collect();
    }

    const filtered = tiers.filter((tier) => {
      if (filter.name && tier.name !== filter.name) return false;
      if (
        filter.searchTerm &&
        !tier.name.toLowerCase().includes(filter.searchTerm.toLowerCase())
      ) {
        return false;
      }
      if (
        filter.createdAfter !== undefined &&
        tier._creationTime < filter.createdAfter
      ) {
        return false;
      }
      if (
        filter.createdBefore !== undefined &&
        tier._creationTime > filter.createdBefore
      ) {
        return false;
      }
      if (
        filter.updatedAfter !== undefined &&
        (tier.updatedAt ?? 0) < filter.updatedAfter
      ) {
        return false;
      }
      if (
        filter.updatedBefore !== undefined &&
        (tier.updatedAt ?? 0) > filter.updatedBefore
      ) {
        return false;
      }
      return true;
    });

    const sortOrder = sort.sortOrder === "asc" ? 1 : -1;
    const sortBy = sort.sortBy ?? "name";

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "createdAt")
        return (a._creationTime - b._creationTime) * sortOrder;
      if (sortBy === "updatedAt")
        return ((a.updatedAt ?? 0) - (b.updatedAt ?? 0)) * sortOrder;
      return a.name.localeCompare(b.name) * sortOrder;
    });

    const offset = Math.max(0, pagination.offset ?? 0);
    const limit =
      pagination.limit && pagination.limit > 0
        ? pagination.limit
        : sorted.length;

    return sorted.slice(offset, offset + limit);
  },
});
