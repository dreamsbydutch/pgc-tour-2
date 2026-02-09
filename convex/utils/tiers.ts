import { sumArray } from "./sumArray";
import type {
  TierDoc,
  TierFilterOptions,
  TierSortOptions,
} from "../types/types";

/**
 * Apply comprehensive filters to tiers
 */
export function applyFilters(
  tiers: TierDoc[],
  filter: TierFilterOptions,
): TierDoc[] {
  return tiers.filter((tier) => {
    if (filter.name && tier.name !== filter.name) {
      return false;
    }
    if (filter.seasonId && tier.seasonId !== filter.seasonId) {
      return false;
    }

    const totalPayouts = sumArray(tier.payouts);
    if (filter.minPayouts !== undefined && totalPayouts < filter.minPayouts) {
      return false;
    }
    if (filter.maxPayouts !== undefined && totalPayouts > filter.maxPayouts) {
      return false;
    }

    const totalPoints = sumArray(tier.points);
    if (filter.minPoints !== undefined && totalPoints < filter.minPoints) {
      return false;
    }
    if (filter.maxPoints !== undefined && totalPoints > filter.maxPoints) {
      return false;
    }

    if (filter.hasDescription !== undefined) {
      const hasDescription = false;
      if (hasDescription !== filter.hasDescription) {
        return false;
      }
    }

    if (filter.searchTerm) {
      const searchTerm = filter.searchTerm.toLowerCase();
      const searchableText = [tier.name].join(" ").toLowerCase();

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    if (
      filter.payoutLevelsMin !== undefined &&
      tier.payouts.length < filter.payoutLevelsMin
    ) {
      return false;
    }
    if (
      filter.payoutLevelsMax !== undefined &&
      tier.payouts.length > filter.payoutLevelsMax
    ) {
      return false;
    }

    if (
      filter.pointLevelsMin !== undefined &&
      tier.points.length < filter.pointLevelsMin
    ) {
      return false;
    }
    if (
      filter.pointLevelsMax !== undefined &&
      tier.points.length > filter.pointLevelsMax
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
      (tier.updatedAt || 0) < filter.updatedAfter
    ) {
      return false;
    }
    if (
      filter.updatedBefore !== undefined &&
      (tier.updatedAt || 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Get sorting function based on sort options
 */
export function getSortFunction(sort: TierSortOptions) {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "name":
      return (a: TierDoc, b: TierDoc) =>
        a.name.localeCompare(b.name) * sortOrder;
    case "totalPayouts":
      return (a: TierDoc, b: TierDoc) =>
        (sumArray(a.payouts) - sumArray(b.payouts)) * sortOrder;
    case "totalPoints":
      return (a: TierDoc, b: TierDoc) =>
        (sumArray(a.points) - sumArray(b.points)) * sortOrder;
    case "createdAt":
      return (a: TierDoc, b: TierDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: TierDoc, b: TierDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    default:
      return undefined;
  }
}
