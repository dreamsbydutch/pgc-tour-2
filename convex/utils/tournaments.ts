import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type {
  TournamentEnhanceOptions,
  TournamentPlayoffState,
  TournamentSortOptions,
} from "../types/tournaments";

const LAST_TOURNAMENT_LOOKBACK_MS = 4 * 24 * 60 * 60 * 1000;
const NEXT_TOURNAMENT_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;

function isPlayoffTierName(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized === "playoff" || normalized === "playoffs";
}

/**
 * Loads tournaments globally or for a single season.
 *
 * @param ctx Convex query context.
 * @param seasonId Optional season scope.
 * @returns Matching tournament documents.
 */
export async function listTournaments(ctx: QueryCtx, seasonId?: Id<"seasons">) {
  if (seasonId) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
      .collect();
  }

  return await ctx.db.query("tournaments").collect();
}

/**
 * Sorts tournaments using the query module's supported sort options.
 *
 * @param tournaments Tournament documents to sort.
 * @param sort Requested sort settings.
 * @returns A sorted tournament array.
 */
export function sortTournaments(
  tournaments: Doc<"tournaments">[],
  sort: TournamentSortOptions = {},
) {
  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  return [...tournaments].sort((a, b) => {
    const sortBy = sort.sortBy ?? "startDate";

    if (sortBy === "name") {
      return a.name.localeCompare(b.name) * sortOrder;
    }

    if (sortBy === "endDate") {
      return (a.endDate - b.endDate) * sortOrder;
    }

    if (sortBy === "status") {
      return (a.status ?? "").localeCompare(b.status ?? "") * sortOrder;
    }

    return (a.startDate - b.startDate) * sortOrder;
  });
}

/**
 * Determines whether a tournament should be considered current based on either
 * explicit active status or its start/end date window.
 *
 * @param tournament Tournament document to inspect.
 * @param now Timestamp used for comparisons.
 * @returns True when the tournament is current.
 */
export function isCurrentTournament(
  tournament: Doc<"tournaments">,
  now: number = Date.now(),
) {
  return (
    tournament.status === "active" ||
    (tournament.startDate <= now && tournament.endDate >= now)
  );
}

/**
 * Picks the current tournament from a list.
 *
 * @param tournaments Candidate tournaments.
 * @param now Timestamp used for comparisons.
 * @returns The current tournament, or null when none qualifies.
 */
export function findCurrentTournament(
  tournaments: Doc<"tournaments">[],
  now: number = Date.now(),
) {
  const current = tournaments.filter((tournament) =>
    isCurrentTournament(tournament, now),
  );

  return current.sort((a, b) => b.startDate - a.startDate)[0] ?? null;
}

/**
 * Picks the most recently ended tournament when it finished within the recent
 * lookback window.
 *
 * @param tournaments Candidate tournaments.
 * @param now Timestamp used for comparisons.
 * @returns The most recent eligible tournament, or null.
 */
export function findLastTournament(
  tournaments: Doc<"tournaments">[],
  now: number = Date.now(),
) {
  return (
    tournaments
      .filter(
        (tournament) =>
          tournament.endDate < now &&
          now - tournament.endDate <= LAST_TOURNAMENT_LOOKBACK_MS,
      )
      .sort((a, b) => b.endDate - a.endDate)[0] ?? null
  );
}

/**
 * Picks the next upcoming tournament by earliest start date.
 *
 * @param tournaments Candidate tournaments.
 * @param now Timestamp used for comparisons.
 * @returns The next upcoming tournament, or null.
 */
export function findNextTournament(
  tournaments: Doc<"tournaments">[],
  now: number = Date.now(),
) {
  return (
    tournaments
      .filter((tournament) => tournament.startDate > now)
      .sort((a, b) => a.startDate - b.startDate)[0] ?? null
  );
}

/**
 * Indicates whether a tournament starts within the six-day pre-cron window.
 *
 * @param tournament Tournament to inspect.
 * @param now Timestamp used for comparisons.
 * @returns True when the tournament starts within six days.
 */
export function isWithinNextTournamentWindow(
  tournament: Doc<"tournaments"> | null,
  now: number = Date.now(),
) {
  if (!tournament) {
    return false;
  }

  return tournament.startDate - now <= NEXT_TOURNAMENT_WINDOW_MS;
}

/**
 * Resolves playoff metadata for a tournament within its season, including
 * whether it is a playoff event and whether it occurs after the first playoff
 * tournament.
 *
 * @param ctx Convex query context.
 * @param tournament Tournament to inspect.
 * @returns Playoff state flags and the 1-based playoff event index.
 */
export async function getTournamentPlayoffState(
  ctx: QueryCtx,
  tournament: Doc<"tournaments"> | null,
): Promise<TournamentPlayoffState> {
  if (!tournament) {
    return {
      isPlayoff: false,
      playoffEventIndex: 0,
      isNonFirstPlayoffTournament: false,
      firstPlayoffEventId: null,
      previousPlayoffEventId: null,
    };
  }

  const [seasonTournaments, seasonTiers] = await Promise.all([
    ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect(),
    ctx.db
      .query("tiers")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect(),
  ]);

  const playoffTierIds = new Set(
    seasonTiers
      .filter((tier) => isPlayoffTierName(tier.name))
      .map((tier) => tier._id),
  );

  const playoffTournaments = seasonTournaments
    .filter((seasonTournament) => playoffTierIds.has(seasonTournament.tierId))
    .sort((a, b) => a.startDate - b.startDate);

  const playoffIndex = playoffTournaments.findIndex(
    (playoffTournament) => playoffTournament._id === tournament._id,
  );
  const playoffEventIndex = playoffIndex === -1 ? 0 : playoffIndex + 1;

  return {
    isPlayoff: playoffIndex !== -1,
    playoffEventIndex,
    isNonFirstPlayoffTournament: playoffEventIndex > 1,
    firstPlayoffEventId: playoffTournaments[0]?._id,
    previousPlayoffEventId:
      playoffIndex > 0
        ? (playoffTournaments[playoffIndex - 1]?._id ?? null)
        : null,
  };
}

/**
 * Optionally enriches tournament rows with related course, tier, and season
 * records for UI-facing queries.
 *
 * @param ctx Convex query context.
 * @param tournaments Tournament documents to enhance.
 * @param enhance Requested related entities.
 * @returns Tournament rows with requested related docs attached.
 */
export async function enhanceTournaments(
  ctx: QueryCtx,
  tournaments: Doc<"tournaments">[],
  enhance: TournamentEnhanceOptions = {},
) {
  if (
    !enhance.includeCourse &&
    !enhance.includeTier &&
    !enhance.includeSeason
  ) {
    return tournaments;
  }

  return await Promise.all(
    tournaments.map(async (tournament) => ({
      ...tournament,
      course: enhance.includeCourse
        ? ((await ctx.db.get(tournament.courseId)) ?? undefined)
        : undefined,
      tier: enhance.includeTier
        ? ((await ctx.db.get(tournament.tierId)) ?? undefined)
        : undefined,
      season: enhance.includeSeason
        ? ((await ctx.db.get(tournament.seasonId)) ?? undefined)
        : undefined,
    })),
  );
}
