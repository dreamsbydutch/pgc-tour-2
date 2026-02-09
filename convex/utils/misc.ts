import { Doc } from "../_generated/dataModel";
import { CENTS_PER_DOLLAR, MS_PER_DAY } from "../functions/_constants";
import type { BuildUsageRateByGolferApiIdOptions } from "../types/golfers";
import {
  EnhancedTournamentDoc,
  EnhancedTournamentGolferDoc,
  EnhancedTournamentTeamDoc,
} from "../types/types";

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
    roundOne?: number | null | undefined;
    roundTwo?: number | null | undefined;
    roundThree?: number | null | undefined;
    roundFour?: number | null | undefined;
  },
  round: 0 | 1 | 2 | 3 | 4 | 5,
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
    roundOne?: number | null | undefined;
    roundTwo?: number | null | undefined;
    roundThree?: number | null | undefined;
    roundFour?: number | null | undefined;
  }[],
  round: 0 | 1 | 2 | 3 | 4 | 5,
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
  round: 0 | 1 | 2 | 3 | 4 | 5,
) => {
  if (eventNumber <= 1) return round <= 2 ? 10 : 5;
  if (eventNumber === 2) return 5;
  return 3;
};
export const categorizeTeamGolfersForRound = (
  golfers: EnhancedTournamentGolferDoc[],
  round: 0 | 1 | 2 | 3 | 4 | 5,
  eventIndex: 0 | 1 | 2 | 3,
  liveMode: boolean,
  tournamentRound: number | undefined,
  par: number,
) => {
  const sortedGolfers = [...golfers].sort((a, b) => {
    const aRound = getRoundScore(a, round);
    const bRound = getRoundScore(b, round);
    const va = liveMode ? a.today : (aRound ?? par + 8) - par;
    const vb = liveMode ? b.today : (bRound ?? par + 8) - par;
    if (va !== vb) return (va ?? 8) - (vb ?? 8);
    if (a.score !== b.score) return (a.score ?? 8) - (b.score ?? 8);
    return (a.apiId ?? 0) - (b.apiId ?? 0);
  });
  let roundState: "upcoming" | "active" | "completed" | "cut" = "completed";
  if (round === 0) {
    roundState = "completed";
  } else if (round === 1) {
    if (sortedGolfers.every((g) => g.roundOne !== null)) {
      roundState = "completed";
    } else if (
      tournamentRound === 1 &&
      liveMode &&
      sortedGolfers.every((g) => g.thru !== null && (g.thru ?? 0) === 18)
    ) {
      roundState = "completed";
    } else if (
      tournamentRound === 1 &&
      liveMode &&
      sortedGolfers.some((g) => g.thru !== null && (g.thru ?? 0) > 0)
    ) {
      roundState = "active";
    } else if (
      tournamentRound === 1 &&
      liveMode &&
      sortedGolfers.every((g) => g.thru === null || (g.thru ?? 0) === 0)
    ) {
      roundState = "upcoming";
    } else {
      roundState = "upcoming";
    }
  } else if (round === 2) {
    if (sortedGolfers.every((g) => g.roundTwo !== null)) {
      roundState = "completed";
    } else if (
      tournamentRound === 2 &&
      liveMode &&
      sortedGolfers.every((g) => g.thru !== null && (g.thru ?? 0) === 18)
    ) {
      roundState = "completed";
    } else if (
      tournamentRound === 2 &&
      liveMode &&
      sortedGolfers.some((g) => g.thru !== null && (g.thru ?? 0) > 0)
    ) {
      roundState = "active";
    } else if (
      tournamentRound === 2 &&
      liveMode &&
      sortedGolfers.every((g) => g.thru === null || (g.thru ?? 0) === 0)
    ) {
      roundState = "upcoming";
    } else {
      roundState = "upcoming";
    }
  } else if (round === 3) {
    if (sortedGolfers.every((g) => g.roundThree !== null)) {
      roundState = "completed";
    } else if (
      tournamentRound === 3 &&
      liveMode &&
      sortedGolfers.every((g) => g.thru !== null && (g.thru ?? 0) === 18)
    ) {
      roundState = "completed";
    } else if (
      tournamentRound === 3 &&
      liveMode &&
      sortedGolfers.some((g) => g.thru !== null && (g.thru ?? 0) > 0)
    ) {
      roundState = "active";
    } else if (
      tournamentRound === 3 &&
      liveMode &&
      sortedGolfers.every((g) => g.thru === null || (g.thru ?? 0) === 0)
    ) {
      roundState = "upcoming";
    } else {
      roundState = "upcoming";
    }
  } else if (round === 4) {
    if (sortedGolfers.every((g) => g.roundFour !== null)) {
      roundState = "completed";
    } else if (
      tournamentRound === 4 &&
      liveMode &&
      sortedGolfers.every((g) => g.thru !== null && (g.thru ?? 0) === 18)
    ) {
      roundState = "completed";
    } else if (
      tournamentRound === 4 &&
      liveMode &&
      sortedGolfers.some((g) => g.thru !== null && (g.thru ?? 0) > 0)
    ) {
      roundState = "active";
    } else if (
      tournamentRound === 4 &&
      liveMode &&
      sortedGolfers.every((g) => g.thru === null || (g.thru ?? 0) === 0)
    ) {
      roundState = "upcoming";
    } else {
      roundState = "upcoming";
    }
  } else if (round === 5) {
    if (sortedGolfers.every((g) => g.roundFour !== null)) {
      roundState = "completed";
    } else if (
      tournamentRound === 4 &&
      sortedGolfers.every((g) => g.thru !== null && (g.thru ?? 0) === 18)
    ) {
      roundState = "completed";
    } else {
      roundState = "upcoming";
    }
  }

  return {
    teamRound: round,
    roundState:
      sortedGolfers.length <
      selectionCountByPlayoffTournamentRound(eventIndex, round)
        ? "cut"
        : roundState,
    active: sortedGolfers.slice(
      0,
      selectionCountByPlayoffTournamentRound(eventIndex, round),
    ),
    alternates: sortedGolfers
      .slice(selectionCountByPlayoffTournamentRound(eventIndex, round))
      .filter((g) => !["WD", "DQ", "CUT"].includes(g.position ?? "")),
    inactive: golfers.filter((g) =>
      ["WD", "DQ", "CUT"].includes(g.position ?? ""),
    ),
  };
};
export const updateScoreForRound = (
  tournament: {
    currentRound: number | undefined;
    livePlay: boolean | undefined;
    eventIndex: number | undefined;
  },
  golfers: Doc<"tournamentGolfers">[],
  round: 1 | 2 | 3 | 4,
) => {
  if (
    ((tournament.currentRound === round && tournament.livePlay === false) ||
      (tournament.currentRound ?? 0) > round) &&
    golfers.length >=
      selectionCountByPlayoffTournamentRound(
        (tournament.eventIndex ?? 0) as 0 | 1 | 2 | 3,
        round,
      )
  ) {
    return roundToDecimalPlace(
      avgArray(
        golfers
          .map((c) =>
            round === 1
              ? c.roundOne
              : round === 2
                ? c.roundTwo
                : round === 3
                  ? c.roundThree
                  : c.roundFour,
          )
          .filter((n) => typeof n === "number"),
      ) ?? 0,
      1,
    );
  } else {
    return undefined;
  }
};
export const insertReplacementGolfers = (
  teamGolfers: EnhancedTournamentGolferDoc[],
  tournamentGolfers: EnhancedTournamentGolferDoc[],
) => {
  if (teamGolfers.filter((t) => t.group === 1).length < 2) {
    const teamGolfersForGroup = teamGolfers.filter((t) => t.group === 1);
    const groupGolfers =
      tournamentGolfers
        ?.filter((g) => g.group === 1)
        .sort((a, b) => (a.worldRank ?? 501) - (b.worldRank ?? 501)) ?? [];
    if (teamGolfersForGroup.length === 0) {
      teamGolfers.push(...groupGolfers.slice(0, 2));
    } else if (teamGolfersForGroup.length === 1) {
      if (teamGolfersForGroup[0].apiId === groupGolfers[0].apiId) {
        teamGolfers.push(groupGolfers[1]);
      } else {
        teamGolfers.push(groupGolfers[0]);
      }
    }
  } else if (teamGolfers.filter((t) => t.group === 2).length < 2) {
    const teamGolfersForGroup = teamGolfers.filter((t) => t.group === 2);
    const groupGolfers =
      tournamentGolfers
        ?.filter((g) => g.group === 2)
        .sort((a, b) => (a.worldRank ?? 501) - (b.worldRank ?? 501)) ?? [];
    if (teamGolfersForGroup.length === 0) {
      teamGolfers.push(...groupGolfers.slice(0, 2));
    } else if (teamGolfersForGroup.length === 1) {
      if (teamGolfersForGroup[0].apiId === groupGolfers[0].apiId) {
        teamGolfers.push(groupGolfers[1]);
      } else {
        teamGolfers.push(groupGolfers[0]);
      }
    }
  } else if (teamGolfers.filter((t) => t.group === 3).length < 2) {
    const teamGolfersForGroup = teamGolfers.filter((t) => t.group === 3);
    const groupGolfers =
      tournamentGolfers
        ?.filter((g) => g.group === 3)
        .sort((a, b) => (a.worldRank ?? 501) - (b.worldRank ?? 501)) ?? [];
    if (teamGolfersForGroup.length === 0) {
      teamGolfers.push(...groupGolfers.slice(0, 2));
    } else if (teamGolfersForGroup.length === 1) {
      if (teamGolfersForGroup[0].apiId === groupGolfers[0].apiId) {
        teamGolfers.push(groupGolfers[1]);
      } else {
        teamGolfers.push(groupGolfers[0]);
      }
    }
  } else if (teamGolfers.filter((t) => t.group === 4).length < 2) {
    const teamGolfersForGroup = teamGolfers.filter((t) => t.group === 4);
    const groupGolfers =
      tournamentGolfers
        ?.filter((g) => g.group === 4)
        .sort((a, b) => (a.worldRank ?? 501) - (b.worldRank ?? 501)) ?? [];
    if (teamGolfersForGroup.length === 0) {
      teamGolfers.push(...groupGolfers.slice(0, 2));
    } else if (teamGolfersForGroup.length === 1) {
      if (teamGolfersForGroup[0].apiId === groupGolfers[0].apiId) {
        teamGolfers.push(groupGolfers[1]);
      } else {
        teamGolfers.push(groupGolfers[0]);
      }
    }
  } else if (teamGolfers.filter((t) => t.group === 5).length < 2) {
    const teamGolfersForGroup = teamGolfers.filter((t) => t.group === 5);
    const groupGolfers =
      tournamentGolfers
        ?.filter((g) => g.group === 5)
        .sort((a, b) => (a.worldRank ?? 501) - (b.worldRank ?? 501)) ?? [];
    if (teamGolfersForGroup.length === 0) {
      teamGolfers.push(...groupGolfers.slice(0, 2));
    } else if (teamGolfersForGroup.length === 1) {
      if (teamGolfersForGroup[0].apiId === groupGolfers[0].apiId) {
        teamGolfers.push(groupGolfers[1]);
      } else {
        teamGolfers.push(groupGolfers[0]);
      }
    }
  }
  return teamGolfers;
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

export const earliestTimeStr = (times: Array<string | null | undefined>) => {
  const valid = times.filter((t): t is string => Boolean(t && t.trim().length));
  if (!valid.length) return undefined;
  try {
    const parsed = valid
      .map((t) => ({ t, d: new Date(t).getTime() }))
      .filter(({ d }) => !Number.isNaN(d));
    if (parsed.length === valid.length && parsed.length > 0) {
      parsed.sort((a, b) => a.d - b.d);
      return parsed[0]?.t;
    }
  } catch (err) {
    void err;
  }
  const sorted = [...valid].sort();
  return sorted[0];
};

const avgAwards = (arr: number[], start: number, count: number) => {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += arr[start + i] ?? 0;
  return count > 0 ? sum / count : 0;
};

export const awardTeamPlayoffPoints = (
  tournament: EnhancedTournamentDoc,
  team: EnhancedTournamentTeamDoc,
) => {
  return avgAwards(
    tournament.tier?.points ?? [],
    tournament.teams?.filter((t) => (t.score ?? 500) < (team.score ?? 500))
      .length ?? 0,
    tournament.teams?.filter((t) => (t.score ?? 500) === (team.score ?? 500))
      .length ?? 0,
  );
};
export const awardTeamEarnings = (
  tournament: EnhancedTournamentDoc,
  team: EnhancedTournamentTeamDoc,
) => {
  return avgAwards(
    tournament.tier?.payouts ?? [],
    tournament.teams?.filter((t) => (t.score ?? 500) < (team.score ?? 500))
      .length ?? 0,
    tournament.teams?.filter((t) => (t.score ?? 500) === (team.score ?? 500))
      .length ?? 0,
  );
};


export function calculateScoreForSorting(
  position: string | null | undefined,
  score: number | null | undefined,
): number {
  if (position === "DQ") return 999 + (score ?? 999);
  if (position === "WD") return 888 + (score ?? 999);
  if (position === "CUT") return 444 + (score ?? 999);
  return score ?? 999;
}