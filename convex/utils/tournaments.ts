import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type {
  TournamentFetchResult,
  TournamentPlayoffState,
  TournamentSortOptions,
} from "../types/tournaments";
import { getCurrentMember } from "./auth";

// Level 0: tournament utility constants

const LAST_TOURNAMENT_LOOKBACK_MS = 4 * 24 * 60 * 60 * 1000;
const NEXT_TOURNAMENT_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;

// Level 1: local classification helpers

/** Normalizes a tier name and returns whether it represents a playoff tier. */
function isPlayoffTierName(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized === "playoff" || normalized === "playoffs";
}

// Level 2: access and hydration helpers

/** Loads a season by id and throws when the linked season record does not exist. */
async function getSeasonOrThrow(ctx: QueryCtx, seasonId: Id<"seasons">) {
  const season = await ctx.db.get(seasonId);

  if (!season) {
    throw new Error("Season not found");
  }

  return season;
}

/** Allows current-year access publicly and requires an authenticated member for other seasons. */
async function assertTournamentSeasonAccess(
  ctx: QueryCtx,
  season: Doc<"seasons">,
  currentYear: number = new Date().getFullYear(),
) {
  if (season.year === currentYear) {
    return;
  }

  await getCurrentMember(ctx);
}

/** Returns whether the current viewer resolves to an authenticated member record. */
async function isAuthenticatedMember(ctx: QueryCtx) {
  try {
    await getCurrentMember(ctx);
    return true;
  } catch {
    return false;
  }
}

/** Attaches required course and tier records plus an optional season record to each tournament row. */
async function hydrateTournamentRelations(
  ctx: QueryCtx,
  tournaments: Doc<"tournaments">[],
): Promise<TournamentFetchResult[]> {
  if (tournaments.length === 0) {
    return [];
  }

  const courseIds = Array.from(
    new Set(tournaments.map((tournament) => tournament.courseId)),
  );
  const tierIds = Array.from(
    new Set(tournaments.map((tournament) => tournament.tierId)),
  );
  const seasonIds = Array.from(
    new Set(tournaments.map((tournament) => tournament.seasonId)),
  );

  const [courseDocs, tierDocs, seasonDocs] = await Promise.all([
    Promise.all(courseIds.map((courseId) => ctx.db.get(courseId))),
    Promise.all(tierIds.map((tierId) => ctx.db.get(tierId))),
    Promise.all(seasonIds.map((seasonId) => ctx.db.get(seasonId))),
  ]);

  const courseById = new Map<Id<"courses">, Doc<"courses">>();
  courseIds.forEach((courseId, index) => {
    const course = courseDocs[index];

    if (!course) {
      throw new Error("Course not found");
    }

    courseById.set(courseId, course);
  });

  const tierById = new Map<Id<"tiers">, Doc<"tiers">>();
  tierIds.forEach((tierId, index) => {
    const tier = tierDocs[index];

    if (!tier) {
      throw new Error("Tier not found");
    }

    tierById.set(tierId, tier);
  });

  const seasonById = new Map<Id<"seasons">, Doc<"seasons">>();
  seasonIds.forEach((seasonId, index) => {
    const season = seasonDocs[index];

    if (!season) {
      throw new Error("Season not found");
    }

    seasonById.set(seasonId, season);
  });

  return tournaments.map((tournament) => {
    const course = courseById.get(tournament.courseId);
    const tier = tierById.get(tournament.tierId);
    const season = seasonById.get(tournament.seasonId);

    if (!course) {
      throw new Error("Course not found");
    }

    if (!tier) {
      throw new Error("Tier not found");
    }
    if (!season) {
      throw new Error("Season not found");
    }

    return {
      ...tournament,
      course,
      tier,
      season,
    };
  });
}

// Level 3: frontend fetch and rehydration helpers

/** Fetches one tournament with season access checks and the default course and tier payload. */
export async function getTournamentById(
  ctx: QueryCtx,
  tournamentId: Id<"tournaments">,
): Promise<TournamentFetchResult | null> {
  const tournament = await ctx.db.get(tournamentId);

  if (!tournament) {
    return null;
  }

  const season = await getSeasonOrThrow(ctx, tournament.seasonId);
  await assertTournamentSeasonAccess(ctx, season);

  const [hydratedTournament] = await hydrateTournamentRelations(
    ctx,
    [tournament],
  );

  return hydratedTournament ?? null;
}

/** Fetches tournament collections with season access checks and the default course and tier payload. */
export async function listTournaments(
  ctx: QueryCtx,
  seasonId?: Id<"seasons">,
) {
  const currentYear = new Date().getFullYear();

  if (seasonId) {
    const season = await getSeasonOrThrow(ctx, seasonId);
    await assertTournamentSeasonAccess(ctx, season, currentYear);

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
      .collect();

    return await hydrateTournamentRelations(ctx, tournaments);
  }

  const currentYearSeasons = await ctx.db
    .query("seasons")
    .withIndex("by_year", (q) => q.eq("year", currentYear))
    .collect();

  if (await isAuthenticatedMember(ctx)) {
    const tournaments = await ctx.db.query("tournaments").collect();
    return await hydrateTournamentRelations(ctx, tournaments);
  }

  const tournamentsBySeason = await Promise.all(
    currentYearSeasons.map((season) =>
      ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .collect(),
    ),
  );

  return await hydrateTournamentRelations(
    ctx,
    tournamentsBySeason.flat(),
  );
}

// Level 4: pure sorting and time-window helpers

/** Sorts tournament rows using the supported query sort options without reading the database. */
export function sortTournaments<TTournament extends Doc<"tournaments">>(
  tournaments: TTournament[],
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

/** Returns whether a tournament should be treated as current from status or schedule. */
function isCurrentTournament(
  tournament: Doc<"tournaments">,
  now: number = Date.now(),
) {
  return (
    tournament.status === "active" ||
    (tournament.startDate <= now && tournament.endDate >= now)
  );
}

/** Returns whether a tournament begins within the short pre-cron upcoming window. */
export function isWithinNextTournamentWindow(
  tournament: Doc<"tournaments"> | null,
  now: number = Date.now(),
) {
  if (!tournament) {
    return false;
  }

  return tournament.startDate - now <= NEXT_TOURNAMENT_WINDOW_MS;
}

// Level 5: collection selectors and derived tournament metadata

/** Picks the most relevant current tournament by filtering current candidates and preferring the latest. */
export function findCurrentTournament<TTournament extends Doc<"tournaments">>(
  tournaments: TTournament[],
  now: number = Date.now(),
) {
  const current = tournaments.filter((tournament) =>
    isCurrentTournament(tournament, now),
  );

  return current.sort((a, b) => b.startDate - a.startDate)[0] ?? null;
}

/** Picks the most recently completed tournament when it falls inside the recent lookback window. */
export function findLastTournament<TTournament extends Doc<"tournaments">>(
  tournaments: TTournament[],
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

/** Picks the next upcoming tournament by earliest future start date. */
export function findNextTournament<TTournament extends Doc<"tournaments">>(
  tournaments: TTournament[],
  now: number = Date.now(),
) {
  return (
    tournaments
      .filter((tournament) => tournament.startDate > now)
      .sort((a, b) => a.startDate - b.startDate)[0] ?? null
  );
}

/** Computes playoff metadata for a tournament, including its playoff sequence position within the season. */
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
