import type { TournamentStatus } from "../types/tournaments";
import type {
  AnalyticsResult,
  DatabaseContext,
  EnhancedTournamentDoc,
  GolferDoc,
  TournamentDoc,
  TournamentEnhancementOptions,
  TournamentFilterOptions,
  TournamentGolferDoc,
  TournamentSortFunction,
  TournamentSortOptions,
} from "../types/types";
import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx } from "../_generated/server";
import { isPlayoffTier } from "./validation";

/**
 * Calculate tournament duration in days.
 */
export function calculateTournamentDuration(
  startDate: number,
  endDate: number,
): number {
  return (endDate - startDate) / (1000 * 60 * 60 * 24);
}

/**
 * Format tournament date range for display.
 */
export function formatDateRange(startDate: number, endDate: number): string {
  const start = new Date(startDate).toLocaleDateString();
  const end = new Date(endDate).toLocaleDateString();
  return `${start} - ${end}`;
}

/**
 * Get tournament status based on dates.
 */
export function getCalculatedStatus(
  startDate: number,
  endDate: number,
  currentStatus?: string,
): TournamentStatus {
  if (currentStatus === "cancelled") return "cancelled";

  const now = Date.now();

  if (now < startDate) return "upcoming";
  if (now >= startDate && now <= endDate) return "active";
  return "completed";
}

/**
 * Get optimized tournaments based on query options using indexes.
 */
export async function getOptimizedTournaments(
  ctx: DatabaseContext,
  options: {
    filter?: TournamentFilterOptions;
    activeOnly?: boolean;
    upcomingOnly?: boolean;
    liveOnly?: boolean;
  },
): Promise<TournamentDoc[]> {
  const filter = options.filter || {};

  if (filter.seasonId && filter.status) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_season_status", (q) =>
        q.eq("seasonId", filter.seasonId!).eq("status", filter.status!),
      )
      .collect();
  }

  if (filter.seasonId) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", filter.seasonId!))
      .collect();
  }

  if (filter.tierId) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_tier", (q) => q.eq("tierId", filter.tierId!))
      .collect();
  }

  if (filter.courseId) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_course", (q) => q.eq("courseId", filter.courseId!))
      .collect();
  }

  if (filter.status) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", filter.status!))
      .collect();
  }

  if (options.activeOnly) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  }

  if (options.upcomingOnly) {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_status", (q) => q.eq("status", "upcoming"))
      .collect();
  }

  if (options.liveOnly) {
    return await ctx.db
      .query("tournaments")
      .filter((q) => q.eq(q.field("livePlay"), true))
      .collect();
  }

  return await ctx.db.query("tournaments").collect();
}

/**
 * Apply comprehensive filters to tournaments.
 */
export function applyTournamentFilters(
  tournaments: TournamentDoc[],
  filter: TournamentFilterOptions,
): TournamentDoc[] {
  return tournaments.filter((tournament) => {
    if (
      filter.startAfter !== undefined &&
      tournament.startDate <= filter.startAfter
    ) {
      return false;
    }
    if (
      filter.startBefore !== undefined &&
      tournament.startDate >= filter.startBefore
    ) {
      return false;
    }
    if (
      filter.endAfter !== undefined &&
      tournament.endDate <= filter.endAfter
    ) {
      return false;
    }
    if (
      filter.endBefore !== undefined &&
      tournament.endDate >= filter.endBefore
    ) {
      return false;
    }

    if (
      filter.livePlay !== undefined &&
      tournament.livePlay !== filter.livePlay
    ) {
      return false;
    }

    if (
      filter.currentRound !== undefined &&
      tournament.currentRound !== filter.currentRound
    ) {
      return false;
    }

    if (filter.searchTerm) {
      const searchTerm = filter.searchTerm.toLowerCase();
      const searchableText = [tournament.name].join(" ").toLowerCase();

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    if (
      filter.createdAfter !== undefined &&
      tournament._creationTime < filter.createdAfter
    ) {
      return false;
    }
    if (
      filter.createdBefore !== undefined &&
      tournament._creationTime > filter.createdBefore
    ) {
      return false;
    }
    if (
      filter.updatedAfter !== undefined &&
      (tournament.updatedAt || 0) < filter.updatedAfter
    ) {
      return false;
    }
    if (
      filter.updatedBefore !== undefined &&
      (tournament.updatedAt || 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Get sorting function based on sort options.
 */
export function getTournamentSortFunction(
  sort: TournamentSortOptions,
): TournamentSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "name":
      return (a: TournamentDoc, b: TournamentDoc) =>
        a.name.localeCompare(b.name) * sortOrder;
    case "startDate":
      return (a: TournamentDoc, b: TournamentDoc) =>
        (a.startDate - b.startDate) * sortOrder;
    case "endDate":
      return (a: TournamentDoc, b: TournamentDoc) =>
        (a.endDate - b.endDate) * sortOrder;
    case "status":
      return (a: TournamentDoc, b: TournamentDoc) =>
        (a.status || "").localeCompare(b.status || "") * sortOrder;
    case "createdAt":
      return (a: TournamentDoc, b: TournamentDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: TournamentDoc, b: TournamentDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    default:
      return undefined;
  }
}

/**
 * Enhance a single tournament with related data.
 */
export async function enhanceTournament(
  ctx: DatabaseContext,
  tournament: TournamentDoc,
  enhance: TournamentEnhancementOptions,
): Promise<EnhancedTournamentDoc> {
  const enhanced: EnhancedTournamentDoc = {
    ...tournament,
    dateRange: formatDateRange(tournament.startDate, tournament.endDate),
    duration: calculateTournamentDuration(
      tournament.startDate,
      tournament.endDate,
    ),
    calculatedStatus: getCalculatedStatus(
      tournament.startDate,
      tournament.endDate,
      tournament.status,
    ),
  };

  if (enhance.includeSeason) {
    const season = await ctx.db.get(tournament.seasonId);
    enhanced.season = season || undefined;
  }

  if (enhance.includeTier) {
    const tier = await ctx.db.get(tournament.tierId);
    enhanced.tier = tier || undefined;
  }

  if (enhance.includeCourse) {
    const course = await ctx.db.get(tournament.courseId);
    enhanced.course = course || undefined;
  }

  if (enhance.includeTeams) {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();
    enhanced.teams = teams;
    enhanced.teamCount = teams.length;
  }

  if (enhance.includeTourCards) {
    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();
    enhanced.tourCards = tourCards;
  }

  if (enhance.includeTours) {
    const tours = await ctx.db
      .query("tours")
      .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
      .collect();
    enhanced.tours = tours;
  }

  if (enhance.includeGolfers) {
    const tournamentGolfers = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();

    const golfers = await Promise.all(
      tournamentGolfers.map(async (tg) => {
        const golfer = await ctx.db.get(tg.golferId);
        return golfer ? { ...tg, ...golfer } : null;
      }),
    );
    enhanced.golfers = golfers.filter(Boolean) as Array<
      TournamentGolferDoc & GolferDoc
    >;
  }

  if (enhance.includeStatistics) {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();

    enhanced.statistics = {
      totalTeams: teams.length,
      activeTeams: teams.length,
      averageScore:
        teams.length > 0
          ? teams.reduce((sum, team) => sum + (team.points || 0), 0) /
            teams.length
          : 0,
      lowestScore:
        teams.length > 0
          ? Math.min(...teams.map((team) => team.points || Infinity))
          : 0,
      highestScore:
        teams.length > 0
          ? Math.max(...teams.map((team) => team.points || 0))
          : 0,
    };
  }

  if (enhance.includePlayoffs) {
    const tier = await ctx.db.get(tournament.tierId);
    const isPlayoff = isPlayoffTier((tier?.name as string | undefined) ?? null);

    let eventIndex: 1 | 2 | 3 = 1;
    let firstPlayoffTournamentId: Id<"tournaments"> | null = null;

    if (isPlayoff) {
      const tournaments: Doc<"tournaments">[] = await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", tournament.seasonId))
        .collect();

      const withTier = await Promise.all(
        tournaments.map(async (t) => {
          const tier = await ctx.db.get(t.tierId);
          return {
            tournament: t,
            tierName: (tier?.name as string | undefined) ?? null,
          };
        }),
      );

      const playoffEvents = withTier
        .filter(({ tierName }) => isPlayoffTier(tierName))
        .map(({ tournament }) => tournament)
        .sort((a, b) => a.startDate - b.startDate);
      const idx = playoffEvents.findIndex((t) => t._id === tournament._id);
      eventIndex = idx === -1 ? 1 : (Math.min(3, idx + 1) as 1 | 2 | 3);
      firstPlayoffTournamentId = playoffEvents[0]?._id ?? null;
    }
    enhanced.isPlayoff = isPlayoff;
    enhanced.eventIndex = eventIndex;
    enhanced.firstPlayoffTournamentId = firstPlayoffTournamentId;
  }

  return enhanced;
}

/**
 * Generate analytics for tournaments.
 */
export async function generateTournamentAnalytics(
  _ctx: DatabaseContext,
  tournaments: TournamentDoc[],
): Promise<AnalyticsResult> {
  return {
    total: tournaments.length,
    active: tournaments.filter((t) => t.status === "active").length,
    inactive: tournaments.filter((t) => t.status !== "active").length,
    statistics: {
      upcoming: tournaments.filter((t) => t.status === "upcoming").length,
      completed: tournaments.filter((t) => t.status === "completed").length,
      cancelled: tournaments.filter((t) => t.status === "cancelled").length,
      withLivePlay: tournaments.filter((t) => t.livePlay === true).length,
      averageDuration:
        tournaments.length > 0
          ? tournaments.reduce(
              (sum, t) =>
                sum + calculateTournamentDuration(t.startDate, t.endDate),
              0,
            ) / tournaments.length
          : 0,
    },
    breakdown: tournaments.reduce(
      (acc, tournament) => {
        const status = tournament.status || "unknown";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
}

export async function getPlayoffTournamentsBySeason(
  ctx: QueryCtx,
  seasonId: Id<"seasons">,
) {
  const tournaments: Doc<"tournaments">[] = await ctx.db
    .query("tournaments")
    .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
    .collect();

  const withTier = await Promise.all(
    tournaments.map(async (t) => {
      const tier = await ctx.db.get(t.tierId);
      return {
        tournament: t,
        tierName: (tier?.name as string | undefined) ?? null,
      };
    }),
  );

  return withTier
    .filter(({ tierName }) => isPlayoffTier(tierName))
    .map(({ tournament }) => tournament)
    .sort((a, b) => a.startDate - b.startDate);
}
