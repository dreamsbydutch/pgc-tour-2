import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { TournamentScopeFilter } from "../types/golfers";

export async function getTournamentIdsForFilter(
  ctx: QueryCtx,
  filter: TournamentScopeFilter,
) {
  if (filter.tournamentId) {
    const tournament = await ctx.db.get(filter.tournamentId);
    if (!tournament) {
      return [];
    }

    if (!filter.activeOnly) {
      return [tournament._id];
    }

    const now = Date.now();
    const isActive =
      tournament.status === "active" ||
      (tournament.startDate <= now && tournament.endDate >= now);

    return isActive ? [tournament._id] : [];
  }

  let tournaments = filter.seasonId
    ? await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", filter.seasonId!))
        .collect()
    : await ctx.db.query("tournaments").collect();

  if (filter.activeOnly) {
    const now = Date.now();
    tournaments = tournaments.filter(
      (tournament) =>
        tournament.status === "active" ||
        (tournament.startDate <= now && tournament.endDate >= now),
    );
  }

  return tournaments.map((tournament) => tournament._id);
}

export async function listTournamentGolfersByTournamentIds(
  ctx: QueryCtx,
  tournamentIds: Id<"tournaments">[],
) {
  const tournamentGolfers = await Promise.all(
    tournamentIds.map((tournamentId) =>
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
        .collect(),
    ),
  );

  return tournamentGolfers.flat();
}

export function normalizeCountry(country?: string): string | undefined {
  const trimmed = country?.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "unknown") return undefined;
  return trimmed;
}

