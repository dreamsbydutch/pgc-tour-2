import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export type GroupLimits = {
  GROUP_1: { percentage: number; maxCount: number };
  GROUP_2: { percentage: number; maxCount: number };
  GROUP_3: { percentage: number; maxCount: number };
  GROUP_4: { percentage: number; maxCount: number };
};

export function isPlayoffTierName(tierName?: string | null): boolean {
  return (tierName ?? "").toLowerCase().includes("playoff");
}

export async function listPlayoffTournamentsForSeason(
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
    .filter(({ tierName }) => isPlayoffTierName(tierName))
    .map(({ tournament }) => tournament)
    .sort((a, b) => a.startDate - b.startDate);
}

export function normalizeDgSkillEstimateToPgcRating(
  dgSkillEstimate: number,
): number {
  const x = dgSkillEstimate;

  if (!Number.isFinite(x)) return 0;

  if (x < -1.5) {
    const raw = 5 + ((x + 1.5) / 1.5) * 5;
    return Math.max(0, Math.min(5, Math.round(raw * 100) / 100));
  }

  if (x <= 2) {
    const raw = 5 + ((x + 1.5) / 3.5) * 95;
    return Math.max(0, Math.round(raw * 100) / 100);
  }

  const extra = 20 * Math.sqrt((x - 2) / 1.5);
  const raw = 100 + extra;
  return Math.min(150, Math.round(raw * 100) / 100);
}

export function normalizeEventTokens(name: string): string[] {
  const STOP = new Set([
    "the",
    "a",
    "an",
    "and",
    "of",
    "at",
    "in",
    "on",
    "for",
    "to",
    "by",
    "presented",
    "championship",
    "tournament",
    "cup",
    "classic",
  ]);

  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => (w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w))
    .filter((w) => w.length > 1)
    .filter((w) => !/^\d+$/.test(w))
    .filter((w) => !STOP.has(w));
}

export function eventNameLooksCompatible(
  expectedTournamentName: string,
  dataGolfEventName: string,
): {
  ok: boolean;
  score: number;
  intersection: string[];
  expectedTokens: string[];
  actualTokens: string[];
} {
  const expectedTokens = normalizeEventTokens(expectedTournamentName);
  const actualTokens = normalizeEventTokens(dataGolfEventName);

  const expectedNorm = expectedTournamentName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const actualNorm = dataGolfEventName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (expectedNorm && actualNorm) {
    if (
      expectedNorm.includes(actualNorm) ||
      actualNorm.includes(expectedNorm)
    ) {
      return {
        ok: true,
        score: 1,
        intersection: [],
        expectedTokens,
        actualTokens,
      };
    }
  }

  const expectedSet = new Set(expectedTokens);
  const actualSet = new Set(actualTokens);
  const intersection = [...expectedSet].filter((t) => actualSet.has(t));
  const denom = Math.max(expectedSet.size, actualSet.size, 1);
  const score = intersection.length / denom;
  const ok = score >= 0.6 || (intersection.length >= 2 && score >= 0.5);

  return { ok, score, intersection, expectedTokens, actualTokens };
}

export function determineGroupIndex<T>(
  currentIndex: number,
  totalGolfers: number,
  groups: T[][],
  groupLimits: GroupLimits,
): number {
  const remainingGolfers = totalGolfers - currentIndex;

  if (
    groups[0].length < totalGolfers * groupLimits.GROUP_1.percentage &&
    groups[0].length < groupLimits.GROUP_1.maxCount
  ) {
    return 0;
  }

  if (
    groups[1].length < totalGolfers * groupLimits.GROUP_2.percentage &&
    groups[1].length < groupLimits.GROUP_2.maxCount
  ) {
    return 1;
  }

  if (
    groups[2].length < totalGolfers * groupLimits.GROUP_3.percentage &&
    groups[2].length < groupLimits.GROUP_3.maxCount
  ) {
    return 2;
  }

  if (
    groups[3].length < totalGolfers * groupLimits.GROUP_4.percentage &&
    groups[3].length < groupLimits.GROUP_4.maxCount
  ) {
    return 3;
  }

  if (
    remainingGolfers <= groups[3].length + groups[4].length * 0.5 ||
    remainingGolfers === 1
  ) {
    return 4;
  }

  return currentIndex % 2 ? 3 : 4;
}
