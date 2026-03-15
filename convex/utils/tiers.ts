import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type {
  TierFilterOptions,
  TierPaginationOptions,
  TierSortOptions,
  TierWithSeason,
} from "../types/tiers";

/** Applies logical filters to a tier collection. */
export function filterTiers(
  tiers: Doc<"tiers">[],
  filter: TierFilterOptions = {},
) {
  return tiers.filter((tier) => {
    if (
      filter.searchTerm &&
      !tier.name.toLowerCase().includes(filter.searchTerm.toLowerCase())
    ) {
      return false;
    }

    if (
      filter.payoutsMin !== undefined &&
      tier.payouts.length < filter.payoutsMin
    ) {
      return false;
    }

    if (
      filter.payoutsMax !== undefined &&
      tier.payouts.length > filter.payoutsMax
    ) {
      return false;
    }

    if (
      filter.pointsMin !== undefined &&
      tier.points.length < filter.pointsMin
    ) {
      return false;
    }

    if (
      filter.pointsMax !== undefined &&
      tier.points.length > filter.pointsMax
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

/** Sorts tiers by supported read options. */
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

    if (sortBy === "payouts") {
      return (a.payouts.length - b.payouts.length) * sortOrder;
    }

    if (sortBy === "points") {
      return (a.points.length - b.points.length) * sortOrder;
    }

    return a.name.localeCompare(b.name) * sortOrder;
  });
}

/** Applies offset/limit pagination to a tier collection. */
export function paginateTiers(
  tiers: Doc<"tiers">[],
  pagination: TierPaginationOptions = {},
) {
  const offset = Math.max(0, pagination.offset ?? 0);
  const limit =
    pagination.limit && pagination.limit > 0 ? pagination.limit : tiers.length;

  return tiers.slice(offset, offset + limit);
}

/** Attaches the required season document to each tier result. */
export async function hydrateTiersWithSeason(
  ctx: QueryCtx,
  tiers: Doc<"tiers">[],
): Promise<TierWithSeason[]> {
  return await Promise.all(
    tiers.map(async (tier) => {
      const season = await ctx.db.get(tier.seasonId);

      if (!season) {
        throw new Error("Season not found");
      }

      return {
        ...tier,
        season,
      };
    }),
  );
}
