import type { LiveModelPlayer } from "../types/datagolf";
import type { BuildUsageRateByGolferApiIdOptions } from "../types/cronJobs";

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

export function roundToSingleDecimalPlace(value: number): number {
  return Math.round(value * 10) / 10;
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

export function isPlayerFinishedFromLiveStats(
  player: LiveModelPlayer,
): boolean {
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

  if (typeof player.end_hole === "number" && player.end_hole >= 18) {
    return true;
  }

  const raw = String(player.thru).trim().toUpperCase();
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
  liveStats: LiveModelPlayer[],
): boolean {
  return liveStats.some((p) => {
    if (isPlayerFinishedFromLiveStats(p)) return false;

    if (typeof p.end_hole === "number" && p.end_hole > 0 && p.end_hole < 18) {
      return true;
    }

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

export function areAllPlayersFinishedFromLiveStats(
  liveStats: LiveModelPlayer[],
): boolean {
  if (liveStats.length === 0) return false;
  return liveStats.every(isPlayerFinishedFromLiveStats);
}

export function inferParFromLiveStats(liveStats: LiveModelPlayer[]): {
  par: number | null;
  samples: number;
} {
  const counts = new Map<number, number>();
  let samples = 0;

  for (const p of liveStats) {
    const rounds = [p.R1, p.R2, p.R3, p.R4].filter(
      (n): n is number => typeof n === "number" && Number.isFinite(n),
    );
    const completed = rounds.length;
    if (completed < 2) continue;
    if (!Number.isFinite(p.current_score)) continue;

    const sum = rounds.reduce((a, b) => a + b, 0);
    const rawPar = (sum - p.current_score) / completed;
    if (!Number.isFinite(rawPar)) continue;

    const rounded = Math.round(rawPar);
    if (Math.abs(rawPar - rounded) > 0.25) continue;

    counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
    samples += 1;
  }

  let bestPar: number | null = null;
  let bestCount = 0;
  for (const [par, count] of counts.entries()) {
    if (count > bestCount) {
      bestPar = par;
      bestCount = count;
    }
  }

  return { par: bestPar, samples };
}

export function roundDecimalTeamsCron(
  n: number | null | undefined,
  places = 1,
): number | null {
  if (n == null) return null;
  return Math.round(n * 10 ** places) / 10 ** places;
}
