import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { SeasonSortOptions } from "../types/seasons";

/**
 * Loads all seasons from the database.
 *
 * @param ctx Convex query context.
 * @returns All season documents.
 */
export async function listSeasons(ctx: QueryCtx) {
  return await ctx.db.query("seasons").collect();
}

/**
 * Sorts seasons by year/number using the module's supported query options.
 *
 * @param seasons Season documents to sort.
 * @param sort Requested sort settings.
 * @returns A sorted season array.
 */
export function sortSeasons(
  seasons: Doc<"seasons">[],
  sort: SeasonSortOptions = {},
) {
  const sortBy = sort.sortBy ?? "year";
  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  return [...seasons].sort((a, b) => {
    if (sortBy === "number") {
      if (a.number !== b.number) {
        return (a.number - b.number) * sortOrder;
      }

      return (a.year - b.year) * sortOrder;
    }

    if (a.year !== b.year) {
      return (a.year - b.year) * sortOrder;
    }

    return (a.number - b.number) * sortOrder;
  });
}

/**
 * Resolves the current season by preferring the current calendar year and then
 * falling back to the latest season overall.
 *
 * @param seasons Candidate seasons.
 * @param currentYear Calendar year used for current-season selection.
 * @returns The current season, or null when none exist.
 */
export function findCurrentSeason(
  seasons: Doc<"seasons">[],
  currentYear: number = new Date().getFullYear(),
) {
  const currentYearSeasons = seasons.filter(
    (season) => season.year === currentYear,
  );

  if (currentYearSeasons.length > 0) {
    return sortSeasons(currentYearSeasons, {
      sortBy: "number",
      sortOrder: "desc",
    })[0];
  }

  return (
    sortSeasons(seasons, {
      sortBy: "year",
      sortOrder: "desc",
    })[0] ?? null
  );
}

/**
 * Loads the season-scoped standings view dependencies in one place.
 *
 * @param ctx Convex query context.
 * @param seasonId Season document id.
 * @returns Tours, tiers, tournaments, tour cards, and teams for the season.
 */
export async function getStandingsViewDataForSeason(
  ctx: QueryCtx,
  seasonId: Id<"seasons">,
) {
  const [tours, tiers, tournaments, tourCards, transactions] =
    await Promise.all([
      ctx.db
        .query("tours")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
      ctx.db
        .query("tiers")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
      ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
      ctx.db
        .query("transactions")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
    ]);

  const teamsByTournament = await Promise.all(
    tournaments.map((tournament) =>
      ctx.db
        .query("teams")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
        .collect(),
    ),
  );

  return {
    tours,
    tiers,
    tournaments,
    tourCards,
    teams: teamsByTournament.flat(),
    transactions,
  };
}
