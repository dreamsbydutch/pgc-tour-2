import { CENTS_PER_DOLLAR, MS_PER_DAY } from "../functions/_constants";
import {
  BuildUsageRateByGolferApiIdOptions,
  TeamsCronGolferSnap,
} from "../types/cronJobs";

export function getPath<T = unknown, R = unknown>(
  obj: T,
  path: string,
): R | undefined {
  if (!obj || typeof path !== "string" || !path) return undefined;
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && key in (acc as object)
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    ) as R | undefined;
}

export function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === "object" &&
    error &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
  } catch {
    return "Unserializable error";
  }
}

export function groupBy<T, K extends string | number | symbol>(
  array: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  return array.reduce(
    (acc, item) => {
      const key = keyFn(item);
      (acc[key] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

export function sortItems<T>(
  items: T[],
  key: keyof T,
  direction: "asc" | "desc" = "desc",
): T[] {
  return [...items].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal == null || bVal == null) return 0;
    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

export function formatScore(score: number | null): string {
  if (score === 0) return "E";
  if (!score) return "-";
  if (score > 0) return `+${score}`;
  return String(score);
}

export function safeNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  return isNaN(num) || !isFinite(num) ? fallback : num;
}

export function getGolferTeeTime(golfer: {
  round?: number | null;
  roundOneTeeTime?: string | null;
  roundTwoTeeTime?: string | null;
  roundThreeTeeTime?: string | null;
  roundFourTeeTime?: string | null;
}): string | undefined {
  if (!golfer || typeof golfer.round !== "number") return undefined;
  const roundMap = [
    undefined,
    "roundOneTeeTime",
    "roundTwoTeeTime",
    "roundThreeTeeTime",
    "roundFourTeeTime",
  ];
  const key = roundMap[golfer.round];
  const teeTime =
    key && golfer[key as keyof typeof golfer]
      ? String(golfer[key as keyof typeof golfer])
      : undefined;
  if (!teeTime) return undefined;

  const date = new Date(teeTime);
  if (!isNaN(date.getTime())) {
    return date.toLocaleString("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
  }

  const timeRegex = /(\d{1,2}):(\d{2})/;
  const match = timeRegex.exec(teeTime);
  if (match) {
    const hour = Number(match[1]);
    const minute = match[2];
    let period = "AM";
    let displayHour = hour;
    if (hour === 0) {
      displayHour = 12;
    } else if (hour >= 12) {
      period = "PM";
      if (hour > 12) displayHour = hour - 12;
    }
    return `${displayHour}:${minute} ${period}`;
  }

  return teeTime;
}

export function parsePositionNumber(position?: string | null): number | null {
  if (!position) return null;
  const stripped = String(position).trim().replace(/^T/i, "");
  const num = Number.parseInt(stripped, 10);
  return Number.isFinite(num) ? num : null;
}

export function computePosChange(
  prevPosition?: string,
  nextPosition?: string,
): number {
  const prevNum = parsePositionNumber(prevPosition);
  const nextNum = parsePositionNumber(nextPosition);
  if (prevNum === null || nextNum === null) return 0;
  return prevNum - nextNum;
}

export function roundToDecimalPlace(
  value: number,
  decimalPlaces: number = 1,
): number {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(value * factor) / factor;
}

export function buildUsageRateByGolferApiId(
  options: BuildUsageRateByGolferApiIdOptions,
): Map<number, number> {
  const counts = new Map<number, number>();
  const totalTeams = options.teams.length;
  if (totalTeams === 0) return new Map();

  for (const team of options.teams) {
    for (const golferApiId of team.golferIds) {
      counts.set(golferApiId, (counts.get(golferApiId) ?? 0) + 1);
    }
  }

  const rate = new Map<number, number>();
  for (const [golferApiId, count] of counts.entries()) {
    rate.set(golferApiId, count / totalTeams);
  }

  return rate;
}

export function formatCents(cents: number): string {
  return `$${(cents / CENTS_PER_DOLLAR).toFixed(2)}`;
}
export function sumArray(values: number[]): number {
  return values.reduce((sum, val) => sum + val, 0);
}
export function avgArray(
  nums: Array<number | null | undefined>,
): number | undefined {
  const list = nums.filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n),
  );
  if (!list.length) return undefined;
  return list.reduce((a, b) => a + b, 0) / list.length;
}
export const getRoundScore = (
  g: {
    roundOne: number | null | undefined;
    roundTwo: number | null | undefined;
    roundThree: number | null | undefined;
    roundFour: number | null | undefined;
  },
  round: 1 | 2 | 3 | 4,
) =>
  round === 1
    ? g.roundOne
    : round === 2
      ? g.roundTwo
      : round === 3
        ? g.roundThree
        : g.roundFour;
export const avgArrayToPar = (
  obj: {
    roundOne: number | null | undefined;
    roundTwo: number | null | undefined;
    roundThree: number | null | undefined;
    roundFour: number | null | undefined;
  }[],
  round: 1 | 2 | 3 | 4,
  par: number,
) => {
  const vals = obj.map((g) => {
    const r = getRoundScore(g, round);
    return typeof r === "number" ? r - par : undefined;
  });
  return avgArray(vals);
};
export const avgToday = (golfers: { today: number | null | undefined }[]) =>
  avgArray(golfers.map((g) => g.today));
export const avgThru = (golfers: { thru: number | null | undefined }[]) =>
  avgArray(golfers.map((g) => g.thru));
export const selectionCountByPlayoffTournamentRound = (
  eventNumber: 0 | 1 | 2 | 3,
  round: 1 | 2 | 3 | 4,
) => {
  if (eventNumber <= 1) return round <= 2 ? 10 : 5;
  if (eventNumber === 2) return 5;
  return 3;
};
export const pickTopNGolfersForRound = (
  golfers: TeamsCronGolferSnap[],
  round: 1 | 2 | 3 | 4,
  liveMode: boolean,
  n: number,
  par: number,
) => {
  return [...golfers]
    .sort((a, b) => {
      const aRound = getRoundScore(a, round);
      const bRound = getRoundScore(b, round);
      const va = liveMode ? a.today : (aRound ?? par + 8) - par;
      const vb = liveMode ? b.today : (bRound ?? par + 8) - par;
      if (va !== vb) return (va ?? 8) - (vb ?? 8);
      if (a.score !== b.score) return (a.score ?? 8) - (b.score ?? 8);
      return (a.apiId ?? 0) - (b.apiId ?? 0);
    })
    .slice(0, n);
};

export const normalize = {
  email(email: string): string {
    return email.trim().toLowerCase();
  },

  name(name: string): string {
    return name.trim().replace(/\s+/g, " ");
  },
} as const;

export const dateUtils = {
  daysBetween(startMs: number, endMs: number): number {
    return Math.floor((endMs - startMs) / MS_PER_DAY);
  },

  daysUntil(futureMs: number): number {
    return Math.floor((futureMs - Date.now()) / MS_PER_DAY);
  },

  daysSince(pastMs: number): number {
    return Math.floor((Date.now() - pastMs) / MS_PER_DAY);
  },
} as const;

export const earliestTimeStr = (
  times: Array<string | null | undefined>,
  position = 1,
) => {
  const valid = times.filter((t): t is string => Boolean(t && t.trim().length));
  if (!valid.length) return undefined;
  const pos = Math.max(1, Math.floor(position));
  try {
    const parsed = valid
      .map((t) => ({ t, d: new Date(t).getTime() }))
      .filter(({ d }) => !Number.isNaN(d));
    if (parsed.length === valid.length && parsed.length > 0) {
      parsed.sort((a, b) => a.d - b.d);
      return parsed[pos - 1]?.t;
    }
  } catch (err) {
    void err;
  }
  const sorted = [...valid].sort();
  return sorted[pos - 1];
};
