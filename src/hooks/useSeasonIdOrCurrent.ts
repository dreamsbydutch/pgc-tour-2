import { useQuery } from "convex/react";

import { api } from "@/convex";
import type { Id } from "@/convex";

/**
 * useSeasonIdOrCurrent Hook
 *
 * Resolves a season id for screens that accept an optional `seasonId` prop.
 * Prefers the passed `seasonId`, then the current season (if available), and
 * finally falls back to the most recent season by year/number.
 *
 * @param seasonId - Optional season id to use when provided.
 * @returns A resolved season id or `undefined` if no season can be determined.
 */
export function useSeasonIdOrCurrent(seasonId?: Id<"seasons">) {
  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason);

  const fallbackSeasonsResult = useQuery(
    api.functions.seasons.getSeasons,
    !seasonId && currentSeason === null
      ? {
          options: {
            pagination: { limit: 50 },
            sort: { sortBy: "year", sortOrder: "desc" },
          },
        }
      : "skip",
  );

  const fallbackSeasons = Array.isArray(fallbackSeasonsResult)
    ? fallbackSeasonsResult.filter((season) => season !== null)
    : fallbackSeasonsResult &&
        typeof fallbackSeasonsResult === "object" &&
        "seasons" in fallbackSeasonsResult
      ? (
          fallbackSeasonsResult as {
            seasons: Array<{
              year: number;
              number: number;
              _id: Id<"seasons">;
            } | null>;
          }
        ).seasons.filter(
          (
            season,
          ): season is { year: number; number: number; _id: Id<"seasons"> } =>
            season !== null,
        )
      : [];

  const fallbackSeasonId = fallbackSeasons.reduce<Id<"seasons"> | undefined>(
    (bestId, season) => {
      if (!bestId) return season._id;
      const best = fallbackSeasons.find((s) => s._id === bestId);
      if (!best) return season._id;
      if (season.year > best.year) return season._id;
      if (season.year < best.year) return bestId;
      if (season.number > best.number) return season._id;
      return bestId;
    },
    undefined,
  );

  return seasonId ?? currentSeason?._id ?? fallbackSeasonId;
}
