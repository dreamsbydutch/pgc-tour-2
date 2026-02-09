import { sumArray } from "./sumArray";
import type {
  TourDoc,
  TourFilterOptions,
  TourSortOptions,
} from "../types/types";

/**
 * Apply comprehensive filters to tours
 */
export function applyFilters(
  tours: TourDoc[],
  filter: TourFilterOptions,
): TourDoc[] {
  return tours.filter((tour) => {
    if (filter.shortForm && tour.shortForm !== filter.shortForm) {
      return false;
    }

    if (filter.minBuyIn !== undefined && tour.buyIn < filter.minBuyIn) {
      return false;
    }
    if (filter.maxBuyIn !== undefined && tour.buyIn > filter.maxBuyIn) {
      return false;
    }

    if (
      filter.minParticipants !== undefined &&
      (!tour.maxParticipants || tour.maxParticipants < filter.minParticipants)
    ) {
      return false;
    }
    if (
      filter.maxParticipants !== undefined &&
      (!tour.maxParticipants || tour.maxParticipants > filter.maxParticipants)
    ) {
      return false;
    }

    if (filter.searchTerm) {
      const searchTerm = filter.searchTerm.toLowerCase();
      const searchableText = [tour.name, tour.shortForm]
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    const totalPlayoffSpots = sumArray(tour.playoffSpots);
    if (
      filter.playoffSpotsMin !== undefined &&
      totalPlayoffSpots < filter.playoffSpotsMin
    ) {
      return false;
    }
    if (
      filter.playoffSpotsMax !== undefined &&
      totalPlayoffSpots > filter.playoffSpotsMax
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
      (tour.updatedAt || 0) < filter.updatedAfter
    ) {
      return false;
    }
    if (
      filter.updatedBefore !== undefined &&
      (tour.updatedAt || 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Get sorting function based on sort options
 */
export function getSortFunction(sort: TourSortOptions) {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "name":
      return (a: TourDoc, b: TourDoc) =>
        a.name.localeCompare(b.name) * sortOrder;
    case "shortForm":
      return (a: TourDoc, b: TourDoc) =>
        a.shortForm.localeCompare(b.shortForm) * sortOrder;
    case "buyIn":
      return (a: TourDoc, b: TourDoc) => (a.buyIn - b.buyIn) * sortOrder;
    case "maxParticipants":
      return (a: TourDoc, b: TourDoc) =>
        ((a.maxParticipants || 0) - (b.maxParticipants || 0)) * sortOrder;
    case "createdAt":
      return (a: TourDoc, b: TourDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: TourDoc, b: TourDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    case "playoffSpots":
      return (a: TourDoc, b: TourDoc) =>
        (sumArray(a.playoffSpots) - sumArray(b.playoffSpots)) * sortOrder;
    default:
      return undefined;
  }
}
