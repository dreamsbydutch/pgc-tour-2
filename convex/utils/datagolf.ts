import { fetchWithRetry } from "./externalFetch";
import type {
  DataGolfFieldPlayer,
  DataGolfLiveTournamentStat,
  DataGolfRankedPlayer,
} from "../types/datagolf";
import { Doc } from "../_generated/dataModel";

const BASE_URL = "https://feeds.datagolf.com";

// Normalize an incoming name from {Last}, {First} to {First} {Last}
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

export function isLiveTournamentStat(
  value: DataGolfLiveTournamentStat,
): value is DataGolfLiveTournamentStat {
  return (
    [
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
    ] as const satisfies readonly DataGolfLiveTournamentStat[]
  ).includes(value);
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

function isPlayerFinishedFromLiveStats(player: {
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
    return Number.isFinite(parsed) && parsed >= 0 && parsed < 18;
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

function normalizeEventTokens(name: string): string[] {
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

export function checkCompatabilityOfEventNames(
  expectedTournamentName: string,
  dataGolfEventName: string,
): {
  ok: boolean;
  score: number;
  intersection: string[];
  expectedTokens: string[];
  actualTokens: string[];
} {
  if (dataGolfEventName.startsWith("WM")) {
    dataGolfEventName = "Waste Management " + dataGolfEventName;
  }
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

export function parseDataGolfTeeTimeToMs(
  value: string | undefined,
  options?: {
    baseDateMs?: number;
    sourceUtcOffsetSeconds?: number;
  },
): number | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;

  const timeOnlyMatch = /^(\d{1,2}):(\d{2})\s*([aApP][mM])$/.exec(raw);
  if (timeOnlyMatch) {
    const baseDateMs = options?.baseDateMs;
    if (!Number.isFinite(baseDateMs)) return undefined;

    const baseDate = new Date(baseDateMs as number);
    if (Number.isNaN(baseDate.getTime())) return undefined;

    const hourRaw = Number(timeOnlyMatch[1]);
    const minute = Number(timeOnlyMatch[2]);
    const ampm = timeOnlyMatch[3].toLowerCase();

    if (!Number.isFinite(hourRaw) || !Number.isFinite(minute)) return undefined;
    if (hourRaw < 1 || hourRaw > 12 || minute < 0 || minute > 59)
      return undefined;

    let hour24 = hourRaw % 12;
    if (ampm === "pm") hour24 += 12;

    const utcBase = Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate(),
      hour24,
      minute,
      0,
      0,
    );
    if (Number.isNaN(utcBase)) return undefined;

    const offsetMs = (options?.sourceUtcOffsetSeconds ?? 0) * 1000;
    return utcBase - offsetMs;
  }

  const direct = new Date(raw).getTime();
  if (!Number.isNaN(direct)) return direct;

  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/.exec(
      raw,
    );

  if (!match) return undefined;

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
    return undefined;
  }

  if (tzRaw) {
    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    const ss = String(second).padStart(2, "0");
    const normalizedTz =
      tzRaw === "Z" ? "Z" : tzRaw.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");

    const iso = `${match[1]}-${match[2]}-${match[3]}T${hh}:${mm}:${ss}${normalizedTz}`;
    const parsed = new Date(iso).getTime();
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isNaN(utc) ? undefined : utc;
}
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function computeHasTournamentStarted(
  tournament: Pick<
    Doc<"tournaments">,
    "_id" | "status" | "startDate" | "livePlay"
  >,
): boolean {
  return (
    tournament.status === "active" ||
    tournament.status === "completed" ||
    tournament.livePlay === true ||
    (tournament.status !== "upcoming" &&
      isFiniteNumber(tournament.startDate) &&
      tournament.startDate > 0 &&
      Date.now() >= tournament.startDate)
  );
}

export function computeActiveApiIds(args: {
  field: { dg_id: number }[];
  liveStats: { dg_id: number }[];
}): Set<number> {
  const liveFieldApiIds = new Set(args.liveStats.map((p) => p.dg_id));
  if (liveFieldApiIds.size > 0) return liveFieldApiIds;
  return new Set(args.field.map((f) => f.dg_id));
}

export function buildFieldById(
  field: DataGolfFieldPlayer[],
): Map<number, DataGolfFieldPlayer> {
  const fieldById = new Map<number, DataGolfFieldPlayer>();
  for (const f of field) fieldById.set(f.dg_id, f);
  return fieldById;
}

export function buildRankingById(
  rankings: DataGolfRankedPlayer[],
): Map<number, DataGolfRankedPlayer> {
  const rankingById = new Map<number, DataGolfRankedPlayer>();
  for (const r of rankings) rankingById.set(r.dg_id, r);
  return rankingById;
}
