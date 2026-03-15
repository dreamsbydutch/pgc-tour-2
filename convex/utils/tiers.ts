import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type {
  TierFilterOptions,
  TierPaginationOptions,
  TierSortOptions,
} from "../types/tiers";

function getTierTotal(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Loads tiers based on id, ids, season, or full-table fallback.
 *
 * @param ctx Convex query context.
 * @param options Tier id selectors.
 * @returns Matching tier documents.
 */
export async function listTiers(
  ctx: QueryCtx,
  options: {
    id?: Id<"tiers">;
    ids?: Id<"tiers">[];
    seasonId?: Id<"seasons">;
  },
) {
  if (options.id) {
    const tier = await ctx.db.get(options.id);
    return tier ? [tier] : [];
  }

  if (options.ids && options.ids.length > 0) {
    const docs = await Promise.all(options.ids.map((id) => ctx.db.get(id)));
    return docs.filter((tier): tier is Doc<"tiers"> => tier !== null);
  }

  if (options.seasonId) {
    return await ctx.db
      .query("tiers")
      .withIndex("by_season", (q) => q.eq("seasonId", options.seasonId!))
      .collect();
  }

  return await ctx.db.query("tiers").collect();
}

/**
 * Applies logical filters to a tier collection.
 *
 * @param tiers Tier documents to filter.
 * @param filter Requested filter settings.
 * @returns Filtered tiers.
 */
export function filterTiers(
  tiers: Doc<"tiers">[],
  filter: TierFilterOptions = {},
) {
  return tiers.filter((tier) => {
    if (filter.name && tier.name !== filter.name) {
      return false;
    }

    if (
      filter.searchTerm &&
      !tier.name.toLowerCase().includes(filter.searchTerm.toLowerCase())
    ) {
      return false;
    }

    const totalPayouts = getTierTotal(tier.payouts);
    const totalPoints = getTierTotal(tier.points);
    const payoutCount = tier.payouts.length;
    const pointCount = tier.points.length;

    if (
      filter.minTotalPayouts !== undefined &&
      totalPayouts < filter.minTotalPayouts
    ) {
      return false;
    }

    if (
      filter.maxTotalPayouts !== undefined &&
      totalPayouts > filter.maxTotalPayouts
    ) {
      return false;
    }

    if (
      filter.minTotalPoints !== undefined &&
      totalPoints < filter.minTotalPoints
    ) {
      return false;
    }

    if (
      filter.maxTotalPoints !== undefined &&
      totalPoints > filter.maxTotalPoints
    ) {
      return false;
    }

    if (
      filter.minPayoutCount !== undefined &&
      payoutCount < filter.minPayoutCount
    ) {
      return false;
    }

    if (
      filter.maxPayoutCount !== undefined &&
      payoutCount > filter.maxPayoutCount
    ) {
      return false;
    }

    if (
      filter.minPointCount !== undefined &&
      pointCount < filter.minPointCount
    ) {
      return false;
    }

    if (
      filter.maxPointCount !== undefined &&
      pointCount > filter.maxPointCount
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
}

/**
 * Sorts tiers by name, timestamps, or aggregate payouts/points.
 *
 * @param tiers Tier documents to sort.
 * @param sort Requested sort settings.
 * @returns Sorted tiers.
 */
export function sortTiers(tiers: Doc<"tiers">[], sort: TierSortOptions = {}) {
  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;
  const sortBy = sort.sortBy ?? "name";

  return [...tiers].sort((a, b) => {
    if (sortBy === "createdAt") {
      return (a._creationTime - b._creationTime) * sortOrder;
    }

    if (sortBy === "updatedAt") {
      return ((a.updatedAt ?? 0) - (b.updatedAt ?? 0)) * sortOrder;
    }

    if (sortBy === "totalPayouts") {
      return (getTierTotal(a.payouts) - getTierTotal(b.payouts)) * sortOrder;
    }

    if (sortBy === "totalPoints") {
      return (getTierTotal(a.points) - getTierTotal(b.points)) * sortOrder;
    }

    if (sortBy === "payoutCount") {
      return (a.payouts.length - b.payouts.length) * sortOrder;
    }

    if (sortBy === "pointCount") {
      return (a.points.length - b.points.length) * sortOrder;
    }

    return a.name.localeCompare(b.name) * sortOrder;
  });
}

/**
 * Applies offset/limit pagination to a tier collection.
 *
 * @param tiers Tier documents to paginate.
 * @param pagination Requested pagination settings.
 * @returns Paginated tiers.
 */
export function paginateTiers(
  tiers: Doc<"tiers">[],
  pagination: TierPaginationOptions = {},
) {
  const offset = Math.max(0, pagination.offset ?? 0);
  const limit =
    pagination.limit && pagination.limit > 0 ? pagination.limit : tiers.length;

  return tiers.slice(offset, offset + limit);
}
