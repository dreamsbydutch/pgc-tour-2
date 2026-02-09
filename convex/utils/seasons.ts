import { dateUtils } from "./dateUtils";
import type {
  SeasonDoc,
  SeasonFilterOptions,
  SeasonSortFunction,
  SeasonSortOptions,
} from "../types/types";

/**
 * Calculate season duration in days
 */
export function calculateSeasonDuration(
  startDate?: number,
  endDate?: number,
): number {
  if (!startDate || !endDate) return 0;
  return dateUtils.daysBetween(startDate, endDate);
}

/**
 * Calculate days remaining in season
 */
export function calculateDaysRemaining(endDate?: number): number {
  if (!endDate) return 0;
  const now = Date.now();
  if (endDate < now) return 0;
  return dateUtils.daysUntil(endDate);
}

/**
 * Determine season status
 */
export function getSeasonStatus(
  startDate?: number,
  endDate?: number,
): {
  isUpcoming: boolean;
  isInProgress: boolean;
  isCompleted: boolean;
} {
  const now = Date.now();

  if (!startDate || !endDate) {
    return { isUpcoming: false, isInProgress: false, isCompleted: false };
  }

  if (now < startDate) {
    return { isUpcoming: true, isInProgress: false, isCompleted: false };
  } else if (now >= startDate && now <= endDate) {
    return { isUpcoming: false, isInProgress: true, isCompleted: false };
  } else {
    return { isUpcoming: false, isInProgress: false, isCompleted: true };
  }
}


/**
 * Apply comprehensive filters to seasons
 */
export function applyFilters(
  seasons: SeasonDoc[],
  filter: SeasonFilterOptions,
): SeasonDoc[] {
  return seasons.filter((season) => {
    if (filter.minYear !== undefined && season.year < filter.minYear) {
      return false;
    }
    if (filter.maxYear !== undefined && season.year > filter.maxYear) {
      return false;
    }

    if (filter.number !== undefined && season.number !== filter.number) {
      return false;
    }

    if (
      filter.startAfter !== undefined &&
      (!season.startDate || season.startDate < filter.startAfter)
    ) {
      return false;
    }
    if (
      filter.startBefore !== undefined &&
      (!season.startDate || season.startDate > filter.startBefore)
    ) {
      return false;
    }
    if (
      filter.endAfter !== undefined &&
      (!season.endDate || season.endDate < filter.endAfter)
    ) {
      return false;
    }
    if (
      filter.endBefore !== undefined &&
      (!season.endDate || season.endDate > filter.endBefore)
    ) {
      return false;
    }

    if (filter.isUpcoming !== undefined || filter.isCompleted !== undefined) {
      const status = getSeasonStatus(season.startDate, season.endDate);
      if (
        filter.isUpcoming !== undefined &&
        status.isUpcoming !== filter.isUpcoming
      ) {
        return false;
      }
      if (
        filter.isCompleted !== undefined &&
        status.isCompleted !== filter.isCompleted
      ) {
        return false;
      }
    }

    if (
      filter.createdAfter !== undefined &&
      season._creationTime < filter.createdAfter
    ) {
      return false;
    }
    if (
      filter.createdBefore !== undefined &&
      season._creationTime > filter.createdBefore
    ) {
      return false;
    }
    if (
      filter.updatedAfter !== undefined &&
      (season.updatedAt || 0) < filter.updatedAfter
    ) {
      return false;
    }
    if (
      filter.updatedBefore !== undefined &&
      (season.updatedAt || 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Get sorting function based on sort options
 */
export function getSortFunction(sort: SeasonSortOptions): SeasonSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "desc" ? -1 : 1;

  switch (sort.sortBy) {
    case "year":
      return (a: SeasonDoc, b: SeasonDoc) => (a.year - b.year) * sortOrder;
    case "startDate":
      return (a: SeasonDoc, b: SeasonDoc) =>
        ((a.startDate || 0) - (b.startDate || 0)) * sortOrder;
    case "endDate":
      return (a: SeasonDoc, b: SeasonDoc) =>
        ((a.endDate || 0) - (b.endDate || 0)) * sortOrder;
    case "createdAt":
      return (a: SeasonDoc, b: SeasonDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: SeasonDoc, b: SeasonDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    default:
      return undefined;
  }
}
