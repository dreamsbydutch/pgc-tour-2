import { fetchWithRetry } from "./externalFetch";
import type {
  LiveTournamentStat,
  OddsFormat,
  SkillRatingCategoryKey,
} from "../types/datagolf";

const BASE_URL = "https://feeds.datagolf.com";

export async function fetchFromDataGolf<T = Record<string, never>>(
  endpoint: string,
  validateResponse?: (json: unknown) => boolean,
): Promise<T> {
  const apiKey = process.env.DATAGOLF_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DataGolf API key not found. Please set DATAGOLF_API_KEY in Convex environment variables.",
    );
  }

  const joiner = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${endpoint}${joiner}key=${apiKey}`;

  const result = await fetchWithRetry<T>(
    url,
    {},
    {
      timeout: 30000,
      retries: 3,
      validateResponse,
      logPrefix: "DataGolf API",
    },
  );

  if (!result.ok) {
    if (result.error.includes("401") || result.error.includes("403")) {
      throw new Error(
        "DataGolf API authentication failed. Please verify DATAGOLF_API_KEY is correct and active.",
      );
    }

    throw new Error(`DataGolf API error: ${result.error}`);
  }

  return result.data;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseNumberLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function impliedProbabilityFromOdds(
  odds: number | string,
  oddsFormat: OddsFormat,
): number | null {
  if (oddsFormat === "percent") {
    const percent = parseNumberLike(odds);
    if (percent === null) return null;
    return percent / 100;
  }

  if (oddsFormat === "decimal") {
    const decimal = parseNumberLike(odds);
    if (decimal === null || decimal <= 0) return null;
    return 1 / decimal;
  }

  if (oddsFormat === "american") {
    const american = parseNumberLike(odds);
    if (american === null || american === 0) return null;
    if (american > 0) return 100 / (american + 100);
    const abs = Math.abs(american);
    return abs / (abs + 100);
  }

  const fraction = String(odds).trim();
  const parts = fraction.split("/").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (numerator < 0 || denominator <= 0) return null;
  return denominator / (numerator + denominator);
}

const SKILL_RATING_CATEGORY_KEYS = [
  "sg_putt",
  "sg_arg",
  "sg_app",
  "sg_ott",
  "sg_total",
  "driving_acc",
  "driving_dist",
] as const;

export function isSkillRatingCategoryKey(
  value: string,
): value is SkillRatingCategoryKey {
  return (SKILL_RATING_CATEGORY_KEYS as readonly string[]).includes(value);
}

const LIVE_TOURNAMENT_STATS = [
  "sg_putt",
  "sg_arg",
  "sg_app",
  "sg_ott",
  "sg_t2g",
  "sg_bs",
  "sg_total",
  "distance",
  "accuracy",
  "gir",
  "prox_fw",
  "prox_rgh",
  "scrambling",
  "great_shots",
  "poor_shots",
] as const satisfies readonly LiveTournamentStat[];

export function isLiveTournamentStat(
  value: string,
): value is LiveTournamentStat {
  return (LIVE_TOURNAMENT_STATS as readonly string[]).includes(value);
}

export function buildQueryParams(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.append(key, String(value));
    }
  });
  return searchParams.toString();
}
