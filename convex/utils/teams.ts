import { sumArray } from "./sumArray";
import type {
  AnalyticsResult,
  DatabaseContext,
  EnhancedTeamDoc,
  TeamDoc,
  TeamEnhancementOptions,
  TeamFilterOptions,
  TeamOptimizedQueryOptions,
  TeamSortFunction,
  TeamSortOptions,
} from "../types/types";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { TeamGolferWithTournamentFields } from "../types/teams";
import { formatCents } from "./misc";

export function calculateTeamScore(rounds: (number | undefined)[]): number {
  const validRounds = rounds.filter(
    (round): round is number => round !== undefined && !isNaN(round),
  );
  return sumArray(validRounds);
}

export function calculatePosition(_score: number, position?: string): number {
  if (position && position !== "CUT") {
    const pos = parseInt(position);
    if (!isNaN(pos)) return pos;
  }
  return 999;
}

export async function getOptimizedTeams(
  ctx: DatabaseContext,
  options: TeamOptimizedQueryOptions,
): Promise<TeamDoc[]> {
  const filter = options.filter || {};

  if (filter.tournamentId && filter.tourCardId) {
    return await ctx.db
      .query("teams")
      .withIndex("by_tournament_tour_card", (q) =>
        q
          .eq("tournamentId", filter.tournamentId!)
          .eq("tourCardId", filter.tourCardId!),
      )
      .collect();
  }

  if (filter.tournamentId) {
    return await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", filter.tournamentId!),
      )
      .collect();
  }

  if (filter.tourCardId) {
    return await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", filter.tourCardId!))
      .collect();
  }

  return await ctx.db.query("teams").collect();
}

export function applyFilters(
  teams: TeamDoc[],
  filter: TeamFilterOptions,
): TeamDoc[] {
  const {
    minEarnings,
    maxEarnings,
    minPoints,
    maxPoints,
    minScore,
    maxScore,
    position,
    round,
    makeCut,
    hasTopTen,
    hasWin,
    golferCount,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
  } = filter;

  return teams.filter((team) => {
    if (minEarnings !== undefined && (team.earnings || 0) < minEarnings) {
      return false;
    }
    if (maxEarnings !== undefined && (team.earnings || 0) > maxEarnings) {
      return false;
    }

    if (minPoints !== undefined && (team.points || 0) < minPoints) {
      return false;
    }
    if (maxPoints !== undefined && (team.points || 0) > maxPoints) {
      return false;
    }

    if (minScore !== undefined && (team.score || 999) < minScore) {
      return false;
    }
    if (maxScore !== undefined && (team.score || 999) > maxScore) {
      return false;
    }

    if (position && team.position !== position) {
      return false;
    }

    if (round !== undefined && team.round !== round) {
      return false;
    }

    if (makeCut !== undefined && team.makeCut !== makeCut) {
      return false;
    }

    if (hasTopTen !== undefined) {
      const teamHasTopTen = (team.topTen ?? 0) > 0;
      if (teamHasTopTen !== hasTopTen) {
        return false;
      }
    }

    if (hasWin !== undefined) {
      const teamHasWin = (team.win ?? 0) > 0;
      if (teamHasWin !== hasWin) {
        return false;
      }
    }

    if (golferCount !== undefined && team.golferIds.length !== golferCount) {
      return false;
    }

    if (createdAfter !== undefined && team._creationTime < createdAfter) {
      return false;
    }
    if (createdBefore !== undefined && team._creationTime > createdBefore) {
      return false;
    }
    if (updatedAfter !== undefined && (team.updatedAt || 0) < updatedAfter) {
      return false;
    }
    if (updatedBefore !== undefined && (team.updatedAt || 0) > updatedBefore) {
      return false;
    }

    return true;
  });
}

export function getSortFunction(sort: TeamSortOptions): TeamSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "earnings":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.earnings || 0) - (b.earnings || 0)) * sortOrder;
    case "points":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.points || 0) - (b.points || 0)) * sortOrder;
    case "score":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.score || 999) - (b.score || 999)) * sortOrder;
    case "position":
      return (a: TeamDoc, b: TeamDoc) => {
        const posA = calculatePosition(a.score || 999, a.position);
        const posB = calculatePosition(b.score || 999, b.position);
        return (posA - posB) * sortOrder;
      };
    case "today":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.today || 0) - (b.today || 0)) * sortOrder;
    case "round":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.round || 0) - (b.round || 0)) * sortOrder;
    case "createdAt":
      return (a: TeamDoc, b: TeamDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: TeamDoc, b: TeamDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    default:
      return undefined;
  }
}

export async function enhanceTeam(
  ctx: DatabaseContext,
  team: TeamDoc,
  enhance: TeamEnhancementOptions,
): Promise<EnhancedTeamDoc> {
  const enhanced: EnhancedTeamDoc = {
    ...team,
    totalScore: calculateTeamScore([
      team.roundOne,
      team.roundTwo,
      team.roundThree,
      team.roundFour,
    ]),
    finalPosition: calculatePosition(team.score || 0, team.position),
    earningsFormatted: formatCents(team.earnings || 0),
  };

  if (enhance.includeTournament) {
    const tournament = await ctx.db.get(team.tournamentId);
    enhanced.tournament = tournament || undefined;
  }

  if (enhance.includeTourCard || enhance.includeMember) {
    const tourCard = await ctx.db.get(team.tourCardId);
    if (tourCard) {
      enhanced.tourCard = tourCard;

      if (enhance.includeMember) {
        const member = await ctx.db.get(tourCard.memberId);
        enhanced.member = member || undefined;
      }
    }
  }

  if (enhance.includeGolfers) {
    const golfers: Array<TeamGolferWithTournamentFields | null> =
      await Promise.all(
        team.golferIds.map(async (golferApiId) => {
          const golfer = await ctx.db
            .query("golfers")
            .withIndex("by_api_id", (q) => q.eq("apiId", golferApiId))
            .first();

          if (!golfer) return null;

          const tg = await ctx.db
            .query("tournamentGolfers")
            .withIndex("by_golfer_tournament", (q) =>
              q
                .eq("golferId", golfer._id)
                .eq("tournamentId", team.tournamentId),
            )
            .first();

          return {
            ...golfer,
            group: tg?.group ?? null,
            rating: tg?.rating ?? null,
            worldRank: tg?.worldRank ?? golfer.worldRank ?? null,
          };
        }),
      );

    enhanced.golfers = golfers.filter(
      (g): g is TeamGolferWithTournamentFields => g !== null,
    );
  }

  if (enhance.includeStatistics) {
    const teamHistory = await ctx.db
      .query("teams")
      .withIndex("by_tour_card", (q) => q.eq("tourCardId", team.tourCardId))
      .collect();

    const validScores = teamHistory
      .map((t) => t.score)
      .filter(
        (score): score is number => score !== undefined && score !== null,
      );

    enhanced.statistics = {
      averageScore:
        validScores.length > 0
          ? validScores.reduce((sum, score) => sum + score, 0) /
            validScores.length
          : 0,
      bestRound:
        Math.min(
          ...[
            team.roundOne,
            team.roundTwo,
            team.roundThree,
            team.roundFour,
          ].filter((r): r is number => r !== undefined),
        ) || 0,
      worstRound:
        Math.max(
          ...[
            team.roundOne,
            team.roundTwo,
            team.roundThree,
            team.roundFour,
          ].filter((r): r is number => r !== undefined),
        ) || 0,
      cutsMade: teamHistory.filter((t) => t.makeCut === 1).length,
      totalTournaments: teamHistory.length,
      totalEarnings: teamHistory.reduce((sum, t) => sum + (t.earnings || 0), 0),
      totalPoints: teamHistory.reduce((sum, t) => sum + (t.points || 0), 0),
      averagePosition:
        teamHistory.length > 0
          ? teamHistory.reduce((sum, t) => {
              const pos = calculatePosition(t.score || 999, t.position);
              return sum + pos;
            }, 0) / teamHistory.length
          : 999,
    };
  }

  return enhanced;
}

export async function resolveTournamentForSeeding(
  ctx: MutationCtx,
  args: {
    tournamentId?: Id<"tournaments">;
    tournamentName?: string;
    seasonId?: Id<"seasons">;
  },
) {
  if (args.tournamentId) {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) throw new Error("Tournament not found");
    return tournament;
  }

  const name = args.tournamentName?.trim();
  if (!name) {
    throw new Error(
      "Provide tournamentId or tournamentName (optionally seasonId to disambiguate)",
    );
  }

  const candidates = args.seasonId
    ? await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId!))
        .collect()
    : await ctx.db.query("tournaments").collect();

  const target = name.toLowerCase();
  const exact = candidates.filter(
    (t) => t.name.trim().toLowerCase() === target,
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new Error(
      `Multiple tournaments match name "${name}". Provide tournamentId or seasonId.`,
    );
  }

  const partial = candidates.filter((t) =>
    t.name.trim().toLowerCase().includes(target),
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(
      `Multiple tournaments match search "${name}". Provide tournamentId or seasonId.`,
    );
  }

  throw new Error(`Tournament not found for name "${name}"`);
}

export async function resolveTourForTournamentSeason(
  ctx: MutationCtx,
  args: {
    seasonId: Id<"seasons">;
    tourId?: Id<"tours">;
  },
) {
  const tours = await ctx.db
    .query("tours")
    .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
    .collect();

  if (args.tourId) {
    const tour = await ctx.db.get(args.tourId);
    if (!tour) throw new Error("Tour not found");
    if (tour.seasonId !== args.seasonId) {
      throw new Error("Provided tourId is not in the tournament’s season");
    }
    return tour;
  }

  if (tours.length === 1) return tours[0];

  throw new Error(
    "Multiple tours exist for this season; provide tourId to select which tour cards to seed from",
  );
}

export function hashStringToUint32(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createLcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function pickUniqueRandomNumbers(
  pool: number[],
  count: number,
  seed: number,
): number[] {
  if (count > pool.length) {
    throw new Error("Cannot pick more unique items than pool size");
  }

  const rand = createLcg(seed);
  const pickedIndices = new Set<number>();
  const out: number[] = [];
  let attempts = 0;

  while (out.length < count) {
    const idx = Math.floor(rand() * pool.length);
    if (!pickedIndices.has(idx)) {
      pickedIndices.add(idx);
      out.push(pool[idx]);
    }

    attempts++;
    if (attempts > pool.length * 50) {
      throw new Error("Failed to pick unique random golfers");
    }
  }

  return out;
}

export async function generateAnalytics(
  _ctx: DatabaseContext,
  teams: TeamDoc[],
): Promise<AnalyticsResult> {
  const activeTeams = teams;
  const totalEarnings = teams.reduce(
    (sum, team) => sum + (team.earnings || 0),
    0,
  );
  const totalPoints = teams.reduce((sum, team) => sum + (team.points || 0), 0);

  return {
    total: teams.length,
    active: activeTeams.length,
    inactive: 0,
    statistics: {
      averageEarnings: teams.length > 0 ? totalEarnings / teams.length : 0,
      totalEarnings,
      averagePoints: teams.length > 0 ? totalPoints / teams.length : 0,
      totalPoints,
      cutsMade: teams.filter((team) => team.makeCut === 1).length,
      averageScore:
        teams.length > 0
          ? teams.reduce((sum, team) => sum + (team.score || 999), 0) /
            teams.length
          : 0,
    },
    breakdown: teams.reduce(
      (acc, team) => {
        const key = team.position || "No Position";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
}
