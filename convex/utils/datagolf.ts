import { fetchWithRetry } from "./externalFetch";
import type {
  LiveModelPlayer,
  LiveTournamentStat,
  OddsFormat,
  SkillRatingCategoryKey,
} from "../types/datagolf";

const BASE_URL = "https://feeds.datagolf.com";

export function normalizePlayerNameFromDataGolf(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes(",")) return trimmed.replace(/\s+/g, " ").trim();

  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 2) return trimmed.replace(/\s+/g, " ").trim();

  const last = parts[0] ?? trimmed;
  const first = parts.slice(1).join(", ").trim();
  return `${first} ${last}`.replace(/\s+/g, " ").trim();
}

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

export function isPlayerFinishedFromLiveStats(player: {
  current_pos?: string | null;
  thru?: number | undefined;
}): boolean {
  const pos = String(player.current_pos ?? "")
    .trim()
    .toUpperCase();
  if (
    pos === "WD" ||
    pos === "DQ" ||
    pos === "CUT" ||
    pos === "MC" ||
    pos === "MDF" ||
    pos === "DNS" ||
    pos === "DNF"
  ) {
    return true;
  }

  const raw = String(player.thru ?? "")
    .trim()
    .toUpperCase();
  if (!raw) return false;
  if (
    raw === "WD" ||
    raw === "DQ" ||
    raw === "CUT" ||
    raw === "MC" ||
    raw === "MDF" ||
    raw === "DNS" ||
    raw === "DNF"
  ) {
    return true;
  }
  if (raw === "F") return true;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 18;
}

export function isRoundRunningFromLiveStats(
  liveStats: { current_pos?: string | null; thru?: number | undefined }[],
): boolean {
  return liveStats.some((p) => {
    if (isPlayerFinishedFromLiveStats(p)) return false;

    const raw = String(p.thru).trim().toUpperCase();
    if (!raw) return false;
    if (raw === "F") return false;

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 && parsed < 18;
  });
}

export function parseThruFromLiveModel(thru: unknown): number | undefined {
  const raw = String(thru).trim().toUpperCase();
  if (!raw) return undefined;
  if (raw === "F") return 18;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
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

export function parseDataGolfTeeTimeToMs(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;

  const direct = new Date(raw).getTime();
  if (!Number.isNaN(direct)) return direct;

  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/.exec(
      raw,
    );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] ? Number(match[6]) : 0;
  const tzRaw = match[7] ?? null;

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  if (tzRaw) {
    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    const ss = String(second).padStart(2, "0");
    const normalizedTz =
      tzRaw === "Z" ? "Z" : tzRaw.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");

    const iso = `${match[1]}-${match[2]}-${match[3]}T${hh}:${mm}:${ss}${normalizedTz}`;
    const parsed = new Date(iso).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }

  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isNaN(utc) ? null : utc;
}
