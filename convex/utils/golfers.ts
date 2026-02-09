import { fetchWithRetry } from "./externalFetch";
import type { DataGolfPlayer } from "../types/datagolf";
import type {
  DatabaseContext,
  GolferDoc,
  GolferFilterOptions,
  GolferOptimizedQueryOptions,
  GolferSortFunction,
  GolferSortOptions,
  TournamentGolferDoc,
} from "../types/types";
import type { GroupLimits } from "../types/golfers";
import { normalize } from "./misc";

export function normalizeCountry(country?: string): string | undefined {
  const trimmed = country?.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "unknown") return undefined;
  return trimmed;
}

export function normalizeStoredCountry(
  country: string | null | undefined,
): string | null {
  const trimmed = country?.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "unknown") return null;
  return trimmed;
}

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}

export function normalizeSuffixToken(token: string): string {
  const raw = token.trim();
  if (!raw) return "";

  const stripped = raw.replace(/\./g, "").trim();
  const lower = stripped.toLowerCase();

  if (lower === "jr") return "Jr.";
  if (lower === "sr") return "Sr.";
  if (/^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(stripped)) {
    return stripped.toUpperCase();
  }

  return raw;
}

export function normalizePlayerName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed.includes(",")) return trimmed;

  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 2) {
    const [last, first] = parts;
    if (!last || !first) return trimmed;
    return `${first} ${last}`.replace(/\s+/g, " ").trim();
  }

  if (parts.length >= 3) {
    const last = parts[0];
    const first = parts[parts.length - 1];
    const suffixTokens = parts.slice(1, parts.length - 1);
    const suffix = suffixTokens
      .map(normalizeSuffixToken)
      .filter(Boolean)
      .join(" ");

    if (!last || !first) return trimmed;
    return (suffix ? `${first} ${last} ${suffix}` : `${first} ${last}`)
      .replace(/\s+/g, " ")
      .trim();
  }

  return trimmed;
}

export function countCommas(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ",") count++;
  }
  return count;
}

export async function fetchDataGolfPlayerList(): Promise<DataGolfPlayer[]> {
  const apiKey = process.env.DATAGOLF_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DataGolf API key not found. Please set DATAGOLF_API_KEY in Convex environment variables.",
    );
  }

  const url = `https://feeds.datagolf.com/get-player-list?file_format=json&key=${apiKey}`;

  const result = await fetchWithRetry<DataGolfPlayer[]>(
    url,
    {},
    {
      timeout: 30000,
      retries: 3,
      validateResponse: (json): json is DataGolfPlayer[] =>
        Array.isArray(json) &&
        (json.length === 0 ||
          json.every(
            (p) =>
              p && typeof p === "object" && "player_name" in p && "dg_id" in p,
          )),
      logPrefix: "DataGolf Sync",
    },
  );

  if (!result.ok) {
    if (result.error.includes("401") || result.error.includes("403")) {
      throw new Error(
        "DataGolf API authentication failed. Please verify DATAGOLF_API_KEY is correct and active.",
      );
    }

    throw new Error(`Failed to fetch DataGolf player list: ${result.error}`);
  }

  return result.data;
}

export function normalizeCommaName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed.includes(",")) return trimmed;

  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 2) {
    const [last, first] = parts;
    if (!last || !first) return trimmed;
    return `${first} ${last}`;
  }

  if (parts.length >= 3) {
    const last = parts[0];
    const first = parts[parts.length - 1];
    const suffixTokens = parts.slice(1, parts.length - 1);
    const suffix = suffixTokens
      .map(normalizeSuffixToken)
      .filter(Boolean)
      .join(" ");
    if (!last || !first) return trimmed;
    return suffix ? `${first} ${last} ${suffix}` : `${first} ${last}`;
  }

  return trimmed;
}

export function generateDisplayName(playerName: string): string {
  return playerName.trim();
}

export function generateRankDisplay(worldRank?: number): string {
  if (!worldRank) return "Unranked";
  return `#${worldRank}`;
}

export function getRankingCategory(
  worldRank?: number,
): "top10" | "top50" | "top100" | "ranked" | "unranked" {
  if (!worldRank) return "unranked";

  if (worldRank <= 10) return "top10";
  if (worldRank <= 50) return "top50";
  if (worldRank <= 100) return "top100";
  return "ranked";
}

export function calculateRecentForm(
  recentResults: TournamentGolferDoc[],
): "excellent" | "good" | "average" | "poor" | "unknown" {
  if (recentResults.length === 0) return "unknown";

  const avgPosition = recentResults
    .filter(
      (r) =>
        r.position && typeof r.position === "string" && r.position !== "CUT",
    )
    .map((r) => parseInt(r.position as string))
    .filter((pos) => !isNaN(pos))
    .reduce((sum, pos, _, arr) => sum + pos / arr.length, 0);

  if (avgPosition === 0) return "unknown";
  if (avgPosition <= 10) return "excellent";
  if (avgPosition <= 25) return "good";
  if (avgPosition <= 50) return "average";
  return "poor";
}

export function normalizeGolferName(name: string): string {
  return normalize.name(name);
}

export async function getOptimizedGolfers(
  ctx: DatabaseContext,
  options: GolferOptimizedQueryOptions,
): Promise<GolferDoc[]> {
  const filter = options.filter || {};
  if (filter.apiId) {
    const golfer = await ctx.db
      .query("golfers")
      .withIndex("by_api_id", (q) => q.eq("apiId", filter.apiId!))
      .first();
    return golfer ? [golfer] : [];
  }

  if (filter.playerName) {
    return await ctx.db
      .query("golfers")
      .withIndex("by_player_name", (q) =>
        q.eq("playerName", filter.playerName!),
      )
      .collect();
  }

  return await ctx.db.query("golfers").collect();
}

export function applyFilters(
  golfers: GolferDoc[],
  filter: GolferFilterOptions,
): GolferDoc[] {
  return golfers.filter((golfer) => {
    if (filter.country && golfer.country !== filter.country) {
      return false;
    }
    if (
      filter.worldRank !== undefined &&
      golfer.worldRank !== filter.worldRank
    ) {
      return false;
    }

    if (filter.minWorldRank !== undefined) {
      if (!golfer.worldRank || golfer.worldRank < filter.minWorldRank) {
        return false;
      }
    }

    if (filter.maxWorldRank !== undefined) {
      if (!golfer.worldRank || golfer.worldRank > filter.maxWorldRank) {
        return false;
      }
    }
    if (filter.searchTerm) {
      const searchTerm = filter.searchTerm.toLowerCase();
      const searchableText = [golfer.playerName, golfer.country || ""]
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }
    if (
      filter.createdAfter !== undefined &&
      golfer._creationTime < filter.createdAfter
    ) {
      return false;
    }

    if (
      filter.createdBefore !== undefined &&
      golfer._creationTime > filter.createdBefore
    ) {
      return false;
    }

    if (
      filter.updatedAfter !== undefined &&
      (golfer.updatedAt || 0) < filter.updatedAfter
    ) {
      return false;
    }

    if (
      filter.updatedBefore !== undefined &&
      (golfer.updatedAt || 0) > filter.updatedBefore
    ) {
      return false;
    }

    return true;
  });
}

export function getSortFunction(sort: GolferSortOptions): GolferSortFunction {
  if (!sort.sortBy) return undefined;

  const sortOrder = sort.sortOrder === "asc" ? 1 : -1;

  switch (sort.sortBy) {
    case "playerName":
      return (a: GolferDoc, b: GolferDoc) =>
        a.playerName.localeCompare(b.playerName) * sortOrder;
    case "country":
      return (a: GolferDoc, b: GolferDoc) =>
        (a.country || "").localeCompare(b.country || "") * sortOrder;
    case "worldRank":
      return (a: GolferDoc, b: GolferDoc) => {
        if (!a.worldRank && !b.worldRank) return 0;
        if (!a.worldRank) return 1 * sortOrder;
        if (!b.worldRank) return -1 * sortOrder;
        return (a.worldRank - b.worldRank) * sortOrder;
      };
    case "apiId":
      return (a: GolferDoc, b: GolferDoc) => (a.apiId - b.apiId) * sortOrder;
    case "createdAt":
      return (a: GolferDoc, b: GolferDoc) =>
        (a._creationTime - b._creationTime) * sortOrder;
    case "updatedAt":
      return (a: GolferDoc, b: GolferDoc) =>
        ((a.updatedAt || 0) - (b.updatedAt || 0)) * sortOrder;
    default:
      return undefined;
  }
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
