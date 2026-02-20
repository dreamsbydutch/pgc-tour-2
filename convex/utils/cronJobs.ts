import type { DataGolfLiveModelPlayer } from "../types/datagolf";
import type {
  BuildUsageRateByGolferApiIdOptions,
  FieldPlayerWithAllTeeTimes,
} from "../types/cronJobs";

type RawFieldTeetime = {
  round_num?: unknown;
  teetime?: unknown;
  start_hole?: unknown;
};

type RawFieldPlayer = {
  am?: unknown;
  country?: unknown;
  course?: unknown;
  dg_id?: unknown;
  dk_id?: unknown;
  dk_salary?: unknown;
  early_late?: unknown;
  fd_id?: unknown;
  fd_salary?: unknown;
  flag?: unknown;
  pga_number?: unknown;
  player_name?: unknown;
  r1_teetime?: unknown;
  r2_teetime?: unknown;
  r3_teetime?: unknown;
  r4_teetime?: unknown;
  start_hole?: unknown;
  teetimes?: unknown;
  unofficial?: unknown;
  yh_id?: unknown;
  yh_salary?: unknown;
};

/**
 * Normalizes raw DataGolf field payload rows into the strict shape expected by
 * `applyDataGolfLiveSync` validators.
 */
export function normalizeFieldPlayerFromDataGolf(
  raw: unknown,
): FieldPlayerWithAllTeeTimes | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as RawFieldPlayer;
  const am = asFiniteNumber(record.am);
  const dgId = asFiniteNumber(record.dg_id);
  const country = asNonEmptyString(record.country);
  const playerName = asNonEmptyString(record.player_name);

  if (
    am === undefined ||
    dgId === undefined ||
    country === undefined ||
    playerName === undefined
  ) {
    return null;
  }

  const teeTimesByRound = parseTeetimesByRound(record.teetimes);
  const roundOneTeetime = coerceNullableTeetime(
    record.r1_teetime,
    teeTimesByRound.get(1),
  );
  const roundTwoTeetime = coerceNullableTeetime(
    record.r2_teetime,
    teeTimesByRound.get(2),
  );
  const roundThreeTeetime = coerceNullableTeetime(
    record.r3_teetime,
    teeTimesByRound.get(3),
  );
  const roundFourTeetime = coerceNullableTeetime(
    record.r4_teetime,
    teeTimesByRound.get(4),
  );

  const startHole =
    asFiniteNumber(record.start_hole) ?? parseStartHoleFromTeetimes(record.teetimes);

  return {
    am,
    country,
    ...(asString(record.course) !== undefined
      ? { course: asString(record.course) }
      : {}),
    dg_id: dgId,
    ...(asString(record.dk_id) !== undefined
      ? { dk_id: asString(record.dk_id) }
      : {}),
    ...(asFiniteNumber(record.dk_salary) !== undefined
      ? { dk_salary: asFiniteNumber(record.dk_salary) }
      : {}),
    ...(asFiniteNumber(record.early_late) !== undefined
      ? { early_late: asFiniteNumber(record.early_late) }
      : {}),
    ...(asString(record.fd_id) !== undefined
      ? { fd_id: asString(record.fd_id) }
      : {}),
    ...(asFiniteNumber(record.fd_salary) !== undefined
      ? { fd_salary: asFiniteNumber(record.fd_salary) }
      : {}),
    ...(asString(record.flag) !== undefined
      ? { flag: asString(record.flag) }
      : {}),
    ...(asFiniteNumber(record.pga_number) !== undefined
      ? { pga_number: asFiniteNumber(record.pga_number) }
      : {}),
    player_name: playerName,
    ...(roundOneTeetime !== undefined ? { r1_teetime: roundOneTeetime } : {}),
    ...(roundTwoTeetime !== undefined ? { r2_teetime: roundTwoTeetime } : {}),
    ...(roundThreeTeetime !== undefined
      ? { r3_teetime: roundThreeTeetime }
      : {}),
    ...(roundFourTeetime !== undefined
      ? { r4_teetime: roundFourTeetime }
      : {}),
    ...(startHole !== undefined ? { start_hole: startHole } : {}),
    ...(asFiniteNumber(record.unofficial) !== undefined
      ? { unofficial: asFiniteNumber(record.unofficial) }
      : {}),
    ...(asString(record.yh_id) !== undefined
      ? { yh_id: asString(record.yh_id) }
      : {}),
    ...(asFiniteNumber(record.yh_salary) !== undefined
      ? { yh_salary: asFiniteNumber(record.yh_salary) }
      : {}),
  };
}

function parseTeetimesByRound(teetimes: unknown): Map<number, string> {
  const byRound = new Map<number, string>();
  if (!Array.isArray(teetimes)) return byRound;

  for (const item of teetimes as RawFieldTeetime[]) {
    if (!item || typeof item !== "object") continue;
    const round = asFiniteNumber(item.round_num);
    const teetime = asNonEmptyString(item.teetime);
    if (round === undefined || teetime === undefined) continue;
    byRound.set(round, teetime);
  }

  return byRound;
}

function parseStartHoleFromTeetimes(teetimes: unknown): number | undefined {
  if (!Array.isArray(teetimes)) return undefined;
  for (const item of teetimes as RawFieldTeetime[]) {
    if (!item || typeof item !== "object") continue;
    const startHole = asFiniteNumber(item.start_hole);
    if (startHole !== undefined) return startHole;
  }
  return undefined;
}

function coerceNullableTeetime(
  primary: unknown,
  fallback: string | undefined,
): string | null | undefined {
  if (primary === null) return null;
  const value = asNonEmptyString(primary) ?? fallback;
  return value === undefined ? undefined : value;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

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
  player: DataGolfLiveModelPlayer,
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
  liveStats: DataGolfLiveModelPlayer[],
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
  liveStats: DataGolfLiveModelPlayer[],
): boolean {
  if (liveStats.length === 0) return false;
  return liveStats.every(isPlayerFinishedFromLiveStats);
}

export function inferParFromLiveStats(liveStats: DataGolfLiveModelPlayer[]): {
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
