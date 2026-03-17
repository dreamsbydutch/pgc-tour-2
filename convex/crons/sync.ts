import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type {
  DataGolfFieldPlayer,
  DataGolfFieldUpdatesResponse,
  DataGolfHistoricalPlayer,
  DataGolfHistoricalRoundDataResponse,
  DataGolfLiveModelPlayer,
  DataGolfLiveModelPredictionsResponse,
  DataGolfRankedPlayer,
  DataGolfRankingsResponse,
} from "../types/datagolf";
import {
  normalizePlayerNameFromDataGolf,
  parseDataGolfTeeTimeToMs,
} from "../utils/datagolf";
import { v } from "convex/values";

// Level 0: sync definitions

// Level 0A: normalized sync domain types

type EnhancedGolfer = {
  field?: DataGolfFieldPlayer;
  ranking?: DataGolfRankedPlayer;
  live?: DataGolfLiveModelPlayer;
  historical?: DataGolfHistoricalPlayer;
  tournamentGolfer?: Doc<"tournamentGolfers">;
  golfer?: Doc<"golfers">;
};

type TournamentLifecycleStatus = "upcoming" | "active" | "completed";
type TournamentSyncType = "active" | "next" | "recent";
type TournamentContext = {
  type: TournamentSyncType;
  tournament: Doc<"tournaments">;
  course: Doc<"courses">;
  tier?: Doc<"tiers">;
};
type TournamentSyncTeam = Doc<"teams"> & {
  golfers: EnhancedGolfer[];
  tour?: Doc<"tours">;
  tourCard?: Doc<"tourCards">;
};
type TournamentStats = {
  teams: TournamentSyncTeam[];
  golfers: EnhancedGolfer[];
  fieldData: {
    field?: DataGolfFieldPlayer[];
  };
  liveData: DataGolfLiveModelPredictionsResponse;
  historicalData: DataGolfHistoricalRoundDataResponse | undefined;
};
type TournamentStatsOptions = {
  includeTeams: boolean;
  includeTeamTours: boolean;
  includeRankings: boolean;
};
type TournamentSyncContextResponse =
  | {
      ok: true;
      type: TournamentSyncType;
      tournament: Doc<"tournaments">;
      course: Doc<"courses">;
      tier?: Doc<"tiers">;
    }
  | {
      ok: false;
    };
type TournamentDatabaseStats = {
  teams: (Doc<"teams"> & {
    tourCard?: Doc<"tourCards">;
    tour?: Doc<"tours">;
  })[];
  golfers: EnhancedGolfer[];
};
type TournamentExternalData =
  | {
      ok: true;
      fieldData: DataGolfFieldUpdatesResponse;
      rankingData?: DataGolfRankingsResponse;
      liveData: DataGolfLiveModelPredictionsResponse;
      historicalData: DataGolfHistoricalRoundDataResponse | undefined;
    }
  | {
      ok: false;
    };

// Level 0B: helper input types

type BuildUsageRateByGolferApiIdOptions = {
  teams: Array<{
    golferIds: number[];
  }>;
};

// Level 0C: sync cadence constants

const UPCOMING_SYNC_INTERVAL_MS = 1000 * 60 * 60 * 4;
const UPCOMING_SYNC_START_HOUR = 6;
const UPCOMING_SYNC_END_HOUR = 21;
const LIVE_SYNC_START_HOUR = 6;
const LIVE_SYNC_END_HOUR = 22;

// Level 1: pure leaf helpers

// Level 1A: shared utility helpers

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

function isRoundRunningFromLiveStats(
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

/** Rounds a number to a fixed number of decimal places. */
function roundToDecimalPlace(value: number, decimalPlaces: number = 1): number {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(value * factor) / factor;
}

/** Builds golfer usage rates by dividing roster appearances by total team count. */
function buildUsageRateByGolferApiId(
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

/** Returns the earliest valid tee time from a list of timestamp candidates. */
function earliestTimeStr(times: Array<number | null | undefined>) {
  const valid = times.filter((time): time is number => Boolean(time));
  if (!valid.length) {
    return undefined;
  }

  try {
    if (valid.length > 0) {
      valid.sort((a, b) => a - b);
      return valid[0];
    }
  } catch (error) {
    void error;
  }

  const sorted = [...valid].sort((a, b) => a - b);
  return sorted[0];
}

// Level 1B: tournament sync leaf helpers

/** Returns the average of a contiguous awards slice, defaulting missing values to zero. */
function avgAwards(arr: number[], start: number, count: number) {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += arr[start + i] ?? 0;
  return count > 0 ? sum / count : 0;
}

/** Splits tier playoff points evenly across tied finishing positions. */
function awardTeamPlayoffPoints(
  tierPoints: number[],
  aheadCount: number,
  tiedCount: number,
) {
  return roundToDecimalPlace(
    avgAwards(tierPoints ?? [], aheadCount, tiedCount),
    0,
  );
}

/** Splits tier earnings evenly across tied finishing positions. */
function awardTeamEarnings(
  tierPayouts: number[],
  aheadCount: number,
  tiedCount: number,
) {
  return roundToDecimalPlace(
    avgAwards(tierPayouts ?? [], aheadCount, tiedCount),
    0,
  );
}

/** Classifies a tournament as active, next, or recent from its schedule and status. */
function getTournamentSyncType(
  tournament: {
    startDate: number;
    endDate: number;
    status?: Doc<"tournaments">["status"];
  },
  nowMs: number,
): TournamentSyncType {
  if (
    tournament.status === "active" ||
    (tournament.startDate < nowMs && tournament.endDate > nowMs)
  ) {
    return "active";
  }

  if (tournament.startDate > nowMs) {
    return "next";
  }

  return "recent";
}

// TODO: If these tee times are wrong then we need to factor i the tournament's time zone offset that is a field on the course object. We should also consider daylight savings time changes for tournaments late in the year.
/** Resolves a golfer's round-one tee time from live field, historical, or stored tournament data. */
function getGolferRoundOneTeeTimeMs(
  golfer: EnhancedGolfer,
): number | undefined {
  const fieldTeeTime = golfer.field?.teetimes.find(
    (teetime) => teetime.round_num === 1,
  )?.teetime;
  if (typeof fieldTeeTime === "number") {
    return fieldTeeTime;
  }

  const historicalTeeTime = golfer.historical?.round_1?.teetime;
  if (typeof historicalTeeTime === "number") {
    return historicalTeeTime;
  }

  const storedTeeTime = golfer.tournamentGolfer?.roundOneTeeTime;
  if (typeof storedTeeTime === "number") {
    return storedTeeTime;
  }

  return typeof storedTeeTime === "string"
    ? parseDataGolfTeeTimeToMs(storedTeeTime)
    : undefined;
}

/** Returns the earliest round-one tee time currently present in the field feed. */
function getFieldRoundOneTeeTimeMs(
  field: DataGolfFieldPlayer[] | undefined,
): number | undefined {
  return earliestTimeStr(
    (field ?? []).map(
      (golfer) =>
        golfer.teetimes.find((teetime) => teetime.round_num === 1)?.teetime,
    ),
  );
}

/** Normalizes a thru value into a numeric hole count when possible. */
function getHoleCount(
  thru: string | number | null | undefined,
): number | undefined {
  if (typeof thru === "number" && Number.isFinite(thru)) {
    return thru;
  }

  const raw = String(thru ?? "")
    .trim()
    .toUpperCase();
  if (!raw) {
    return undefined;
  }
  if (raw === "F") {
    return 18;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Returns whether a position code represents a terminal tournament state. */
function isTerminalTournamentPosition(
  position: string | null | undefined,
): boolean {
  return ["CUT", "MC", "MDF", "WD", "DQ", "DNS", "DNF"].includes(
    String(position ?? "")
      .trim()
      .toUpperCase(),
  );
}

/** Resolves the best available tournament position across live, historical, and stored data. */
function getEffectiveTournamentPosition(
  golfer: EnhancedGolfer,
): string | undefined {
  const position =
    golfer.live?.current_pos ??
    golfer.historical?.fin_text ??
    golfer.tournamentGolfer?.position;
  const normalized = String(position ?? "")
    .trim()
    .toUpperCase();

  return normalized || undefined;
}

/** Returns whether a position should be excluded from leaderboard ranking math. */
function isNonRankingTournamentPosition(position: string | undefined): boolean {
  return ["CUT", "WD", "DQ", ""].includes(position ?? "");
}

/** Returns whether a position indicates the golfer withdrew or was disqualified. */
function isWithdrawnOrDisqualifiedPosition(
  position: string | undefined,
): boolean {
  return position === "WD" || position === "DQ";
}

/** Returns the completed score for a specific round from live, historical, or stored tournament data. */
function getCompletedRoundScore(
  golfer: EnhancedGolfer,
  roundNumber: 1 | 2 | 3 | 4,
): number | undefined {
  switch (roundNumber) {
    case 1:
      return (golfer.live?.R1 ?? 0) > 0
        ? golfer.live?.R1
        : (golfer.historical?.round_1?.score ?? 0) > 0
          ? golfer.historical?.round_1?.score
          : (golfer.tournamentGolfer?.roundOne ?? 0) > 0
            ? golfer.tournamentGolfer?.roundOne
            : undefined;
    case 2:
      return (golfer.live?.R2 ?? 0) > 0
        ? golfer.live?.R2
        : (golfer.historical?.round_2?.score ?? 0) > 0
          ? golfer.historical?.round_2?.score
          : (golfer.tournamentGolfer?.roundTwo ?? 0) > 0
            ? golfer.tournamentGolfer?.roundTwo
            : undefined;
    case 3:
      return (golfer.live?.R3 ?? 0) > 0
        ? golfer.live?.R3
        : (golfer.historical?.round_3?.score ?? 0) > 0
          ? golfer.historical?.round_3?.score
          : (golfer.tournamentGolfer?.roundThree ?? 0) > 0
            ? golfer.tournamentGolfer?.roundThree
            : undefined;
    case 4:
      return (golfer.live?.R4 ?? 0) > 0
        ? golfer.live?.R4
        : (golfer.historical?.round_4?.score ?? 0) > 0
          ? golfer.historical?.round_4?.score
          : (golfer.tournamentGolfer?.roundFour ?? 0) > 0
            ? golfer.tournamentGolfer?.roundFour
            : undefined;
  }
}

// Level 2A: golfer-state helpers

/** Computes a golfer's score for one tournament round, including penalty fallbacks for WD and DQ states. */
function getTournamentRoundScore(args: {
  golfer: EnhancedGolfer;
  roundNumber: 1 | 2 | 3 | 4;
  currentRound: number;
  isRoundRunning: boolean;
  coursePar: number;
}): number | undefined {
  const position = getEffectiveTournamentPosition(args.golfer);
  const completedScore = getCompletedRoundScore(args.golfer, args.roundNumber);

  if (isWithdrawnOrDisqualifiedPosition(position)) {
    if (args.roundNumber >= 3) {
      return undefined;
    }
    if (typeof completedScore === "number") {
      return completedScore;
    }
    return args.currentRound >= args.roundNumber
      ? args.coursePar + 8
      : undefined;
  }

  const roundIsAvailable =
    args.currentRound > args.roundNumber ||
    (args.currentRound === args.roundNumber && !args.isRoundRunning);
  if (!roundIsAvailable) {
    return undefined;
  }
  if (typeof completedScore === "number") {
    return completedScore;
  }

  return args.roundNumber <= 2 ? args.coursePar + 8 : undefined;
}

/** Returns the synthetic live-round penalty used when a golfer withdraws or is disqualified mid-round. */
function getCurrentRoundPenaltyToday(args: {
  golfer: EnhancedGolfer;
  currentRound: number;
  isRoundRunning: boolean;
  coursePar: number;
}): number | undefined {
  if (args.currentRound !== 1 && args.currentRound !== 2) {
    return undefined;
  }

  if (
    !isWithdrawnOrDisqualifiedPosition(
      getEffectiveTournamentPosition(args.golfer),
    )
  ) {
    return undefined;
  }

  const roundScore = getTournamentRoundScore({
    golfer: args.golfer,
    roundNumber: args.currentRound,
    currentRound: args.currentRound,
    isRoundRunning: args.isRoundRunning,
    coursePar: args.coursePar,
  });

  return roundScore === args.coursePar + 8 ? 8 : undefined;
}

/** Resolves the live "today" value for a golfer from live, historical, or stored tournament state. */
function getTournamentTodayValue(args: {
  golfer: EnhancedGolfer;
  currentRound: number;
  isRoundRunning: boolean;
  coursePar: number;
}): number | undefined {
  const penaltyToday = getCurrentRoundPenaltyToday(args);
  if (typeof penaltyToday === "number") {
    return penaltyToday;
  }

  const position = getEffectiveTournamentPosition(args.golfer);
  if (isNonRankingTournamentPosition(position)) {
    return undefined;
  }

  return (
    args.golfer.live?.today ??
    (args.currentRound === 4
      ? (args.golfer.historical?.round_4?.score ?? 0) -
        (args.golfer.historical?.round_4?.course_par ?? 0)
      : (args.golfer.tournamentGolfer?.today ?? undefined))
  );
}

/** Resolves the live thru value for a golfer, including completed and penalty rounds. */
function getTournamentThruValue(args: {
  golfer: EnhancedGolfer;
  currentRound: number;
  isRoundRunning: boolean;
  coursePar: number;
}): number | undefined {
  if (typeof getCurrentRoundPenaltyToday(args) === "number") {
    return 18;
  }

  const position = getEffectiveTournamentPosition(args.golfer);
  if (isNonRankingTournamentPosition(position)) {
    return undefined;
  }

  return args.golfer.live?.thru
    ? parseInt(args.golfer.live.thru)
    : !args.isRoundRunning
      ? 18
      : 0;
}

/** Returns whether a golfer has started any tournament play based on positions, holes, or round scores. */
function hasGolferStartedPlay(golfer: EnhancedGolfer): boolean {
  const terminalPosition =
    golfer.live?.current_pos ??
    golfer.historical?.fin_text ??
    golfer.tournamentGolfer?.position;
  if (isTerminalTournamentPosition(terminalPosition)) {
    return true;
  }

  const thru = getHoleCount(golfer.live?.thru);
  if (typeof thru === "number" && thru > 0) {
    return true;
  }

  return Boolean(
    (golfer.live?.R1 ?? 0) > 0 ||
      (golfer.live?.R2 ?? 0) > 0 ||
      (golfer.live?.R3 ?? 0) > 0 ||
      (golfer.live?.R4 ?? 0) > 0 ||
      (golfer.historical?.round_1?.score ?? 0) > 0 ||
      (golfer.historical?.round_2?.score ?? 0) > 0 ||
      (golfer.historical?.round_3?.score ?? 0) > 0 ||
      (golfer.historical?.round_4?.score ?? 0) > 0 ||
      (golfer.tournamentGolfer?.roundOne ?? 0) > 0 ||
      (golfer.tournamentGolfer?.roundTwo ?? 0) > 0 ||
      (golfer.tournamentGolfer?.roundThree ?? 0) > 0 ||
      (golfer.tournamentGolfer?.roundFour ?? 0) > 0 ||
      (golfer.live?.current_score ?? 0) !== 0,
  );
}

/** Returns whether a golfer's tournament should be treated as fully complete. */
function hasGolferCompletedTournament(golfer: EnhancedGolfer): boolean {
  const terminalPosition =
    golfer.live?.current_pos ??
    golfer.historical?.fin_text ??
    golfer.tournamentGolfer?.position;
  if (isTerminalTournamentPosition(terminalPosition)) {
    return true;
  }

  if (
    (golfer.live?.R4 ?? 0) > 0 ||
    (golfer.historical?.round_4?.score ?? 0) > 0 ||
    (golfer.tournamentGolfer?.roundFour ?? 0) > 0
  ) {
    return true;
  }

  const thru = getHoleCount(golfer.live?.thru);
  return thru === 18 && (golfer.live?.round ?? 0) >= 4;
}

/** Derives the monotonic sync round marker for a golfer from stored and incoming scoring state. */
function getTournamentGolferSyncRound(golfer: EnhancedGolfer): number {
  const storedRound = Number.isFinite(golfer.tournamentGolfer?.round)
    ? Math.max(0, Math.min(5, Math.trunc(golfer.tournamentGolfer?.round ?? 0)))
    : 0;
  if (storedRound >= 5) {
    return 5;
  }

  const position = getEffectiveTournamentPosition(golfer);
  if (isTerminalTournamentPosition(position)) {
    return 5;
  }

  const liveRound =
    typeof golfer.live?.round === "number" && Number.isFinite(golfer.live.round)
      ? golfer.live.round
      : 0;
  const thru = getHoleCount(golfer.live?.thru);
  const roundFourCompleted =
    typeof getCompletedRoundScore(golfer, 4) === "number" ||
    (liveRound >= 4 && thru === 18);

  let derivedRound = 0;
  if (roundFourCompleted) {
    derivedRound = 5;
  } else if (liveRound >= 4) {
    derivedRound = 4;
  } else if (
    liveRound >= 3 ||
    typeof getCompletedRoundScore(golfer, 3) === "number"
  ) {
    derivedRound = 3;
  } else if (
    liveRound >= 2 ||
    typeof getCompletedRoundScore(golfer, 2) === "number"
  ) {
    derivedRound = 2;
  } else if (
    liveRound >= 1 ||
    typeof getCompletedRoundScore(golfer, 1) === "number"
  ) {
    derivedRound = 1;
  }

  return Math.max(storedRound, derivedRound);
}

/** Returns whether a golfer has completed a specific tournament round. */
function hasGolferCompletedTournamentRound(args: {
  golfer: EnhancedGolfer;
  roundNumber: 1 | 2 | 3 | 4;
}): boolean {
  const syncRound = getTournamentGolferSyncRound(args.golfer);
  if (syncRound >= 5 || syncRound > args.roundNumber) {
    return true;
  }

  if (
    typeof getCompletedRoundScore(args.golfer, args.roundNumber) === "number"
  ) {
    return true;
  }

  const liveRound =
    typeof args.golfer.live?.round === "number" &&
    Number.isFinite(args.golfer.live.round)
      ? args.golfer.live.round
      : 0;
  const thru = getHoleCount(args.golfer.live?.thru);

  return liveRound === args.roundNumber && thru === 18;
}

// Level 2B: team-state helpers

/** Returns whether a golfer should contribute to a team's live scoring window. */
function shouldIncludeGolferInTeamLiveWindow(args: {
  golfer: EnhancedGolfer;
  currentRound: number;
  isRoundRunning: boolean;
  coursePar: number;
}): boolean {
  const position = getEffectiveTournamentPosition(args.golfer);

  if (position === "CUT" || position === "") {
    return false;
  }

  if (isWithdrawnOrDisqualifiedPosition(position)) {
    return typeof getCurrentRoundPenaltyToday(args) === "number";
  }

  return true;
}

/** Returns whether a golfer position keeps that golfer eligible for weekend team scoring. */
function isWeekendEligibleTeamPosition(position: string | undefined): boolean {
  return !["CUT", "WD", "DQ"].includes(position ?? "");
}

/** Returns whether a team has fewer than five weekend-eligible golfers. */
function isTeamWeekendCut(args: {
  golfers: EnhancedGolfer[];
  currentRound: number;
}): boolean {
  if (args.currentRound < 3) {
    return false;
  }

  return (
    args.golfers.filter((golfer) =>
      isWeekendEligibleTeamPosition(getEffectiveTournamentPosition(golfer)),
    ).length < 5
  );
}

/** Selects the golfers that should drive a team's live today and thru averages. */
function getTeamLiveWindowGolfers(args: {
  golfers: EnhancedGolfer[];
  currentRound: number;
  isRoundRunning: boolean;
  coursePar: number;
}): EnhancedGolfer[] {
  if (
    isTeamWeekendCut({
      golfers: args.golfers,
      currentRound: args.currentRound,
    })
  ) {
    return [];
  }

  const selectionSize = args.currentRound >= 3 ? 5 : 10;

  return args.golfers
    .filter((golfer) =>
      shouldIncludeGolferInTeamLiveWindow({ ...args, golfer }),
    )
    .sort(
      (a, b) =>
        (getTournamentTodayValue({ ...args, golfer: a }) ?? 500) -
        (getTournamentTodayValue({ ...args, golfer: b }) ?? 500),
    )
    .slice(0, selectionSize);
}

/** Returns the mean today or thru value for a team's selected live scoring window. */
function getTeamLiveWindowMean(args: {
  golfers: EnhancedGolfer[];
  currentRound: number;
  isRoundRunning: boolean;
  coursePar: number;
  metric: "today" | "thru";
}): number | undefined {
  if (args.golfers.length === 0) {
    return undefined;
  }

  const selectionSize = args.currentRound >= 3 ? 5 : 10;
  const total = args.golfers.reduce((sum, golfer) => {
    const value =
      args.metric === "today"
        ? getTournamentTodayValue({ ...args, golfer })
        : getTournamentThruValue({ ...args, golfer });
    return sum + (value ?? 0);
  }, 0);

  return total / selectionSize;
}

/** Returns whether a team has enough finished scores to finalize a specific round. */
function isTeamRoundComplete(args: {
  golfers: EnhancedGolfer[];
  roundNumber: 1 | 2 | 3 | 4;
  currentRound: number;
  isRoundRunning: boolean;
  coursePar: number;
}): boolean {
  const roundScores = args.golfers.map((golfer) =>
    getTournamentRoundScore({
      golfer,
      roundNumber: args.roundNumber,
      currentRound: args.currentRound,
      isRoundRunning: args.isRoundRunning,
      coursePar: args.coursePar,
    }),
  );

  if (args.roundNumber <= 2) {
    return roundScores.every((score) => typeof score === "number");
  }

  if (
    isTeamWeekendCut({
      golfers: args.golfers,
      currentRound: args.currentRound,
    })
  ) {
    return false;
  }

  return roundScores.filter((score) => typeof score === "number").length >= 5;
}

/** Computes a team's averaged round score using the 10-count or 5-count format. */
function getTeamRoundScore(args: {
  golfers: EnhancedGolfer[];
  roundNumber: 1 | 2 | 3 | 4;
  currentRound: number;
  isRoundRunning: boolean;
  coursePar: number;
}): number | undefined {
  if (!isTeamRoundComplete(args)) {
    return undefined;
  }

  const roundScores = args.golfers
    .map((golfer) =>
      getTournamentRoundScore({
        golfer,
        roundNumber: args.roundNumber,
        currentRound: args.currentRound,
        isRoundRunning: args.isRoundRunning,
        coursePar: args.coursePar,
      }),
    )
    .filter((score): score is number => typeof score === "number");

  if (args.roundNumber <= 2) {
    return roundToDecimalPlace(
      (roundScores.reduce((sum, score) => sum + score, 0) ?? 0) / 10,
      1,
    );
  }

  return roundToDecimalPlace(
    (roundScores
      .sort((a, b) => (a === 0 ? 500 : a) - (b === 0 ? 500 : b))
      .slice(0, 5)
      .reduce((sum, score) => sum + score, 0) ?? 0) / 5,
    1,
  );
}

/** Derives the monotonic sync round marker for a team from its golfers and stored round. */
function getTournamentTeamSyncRound(args: {
  golfers: EnhancedGolfer[];
  existingRound?: number;
}): number {
  const storedRound = Number.isFinite(args.existingRound)
    ? Math.max(0, Math.min(5, Math.trunc(args.existingRound ?? 0)))
    : 0;
  if (storedRound >= 5) {
    return 5;
  }

  const golferRounds = args.golfers.map((golfer) =>
    getTournamentGolferSyncRound(golfer),
  );
  if (golferRounds.length === 0) {
    return storedRound;
  }

  if (golferRounds.every((round) => round >= 5)) {
    return 5;
  }

  let derivedRound = golferRounds.some((round) => round >= 1) ? 1 : 0;

  if (
    golferRounds.some((round) => round >= 2) &&
    args.golfers.every((golfer) =>
      hasGolferCompletedTournamentRound({ golfer, roundNumber: 1 }),
    )
  ) {
    derivedRound = 2;
  }

  if (
    golferRounds.some((round) => round >= 3) &&
    args.golfers.every((golfer) =>
      hasGolferCompletedTournamentRound({ golfer, roundNumber: 2 }),
    )
  ) {
    derivedRound = 3;
  }

  if (
    golferRounds.some((round) => round >= 4) &&
    args.golfers.every((golfer) =>
      hasGolferCompletedTournamentRound({ golfer, roundNumber: 3 }),
    )
  ) {
    derivedRound = 4;
  }

  return Math.max(storedRound, derivedRound);
}

/** Returns whether every golfer on a team has completed a specific round. */
function hasTeamCompletedTournamentRound(args: {
  golfers: EnhancedGolfer[];
  roundNumber: 1 | 2 | 3 | 4;
}): boolean {
  return args.golfers.every((golfer) =>
    hasGolferCompletedTournamentRound({
      golfer,
      roundNumber: args.roundNumber,
    }),
  );
}

/** Returns whether any golfer on a team is actively playing a round. */
function isTeamRoundRunning(golfers: EnhancedGolfer[]): boolean {
  return golfers.some((golfer) => {
    if (getTournamentGolferSyncRound(golfer) >= 5) {
      return false;
    }

    const thru = getHoleCount(golfer.live?.thru);
    return typeof thru === "number" && thru > 0 && thru < 18;
  });
}

/** Computes a team's aggregate tournament score from completed rounds and optional live scoring. */
function getTeamAggregateScore(args: {
  roundOne?: number;
  roundTwo?: number;
  roundThree?: number;
  roundFour?: number;
  liveToday?: number;
  coursePar: number;
  currentRound: number;
  isRoundRunning: boolean;
}): number {
  const completedScore =
    (typeof args.roundOne === "number" ? args.roundOne - args.coursePar : 0) +
    (typeof args.roundTwo === "number" ? args.roundTwo - args.coursePar : 0) +
    (typeof args.roundThree === "number"
      ? args.roundThree - args.coursePar
      : 0) +
    (typeof args.roundFour === "number" ? args.roundFour - args.coursePar : 0);
  const liveScore = shouldIncludeLiveTodayInScore({
    currentRound: args.currentRound,
    isRoundRunning: args.isRoundRunning,
  })
    ? (args.liveToday ?? 0)
    : 0;

  return roundToDecimalPlace(completedScore + liveScore, 1);
}

// Level 2C: tournament-state helpers

/** Derives the tournament-wide sync round from all participating teams. */
function getTournamentSyncCurrentRound(args: {
  teams: Array<{
    golfers: EnhancedGolfer[];
    round?: number;
  }>;
  existingRound?: number;
}): number {
  const storedRound = Number.isFinite(args.existingRound)
    ? Math.max(0, Math.min(5, Math.ceil(args.existingRound ?? 0)))
    : 0;
  if (storedRound >= 5) {
    return 5;
  }

  const teamRounds = args.teams.map((team) =>
    getTournamentTeamSyncRound({
      golfers: team.golfers,
      existingRound: team.round,
    }),
  );
  if (teamRounds.length === 0) {
    return storedRound;
  }

  if (teamRounds.every((round) => round >= 5)) {
    return 5;
  }

  let derivedRound = teamRounds.some((round) => round >= 1) ? 1 : 0;

  if (
    teamRounds.some((round) => round >= 2) &&
    args.teams.every((team) =>
      hasTeamCompletedTournamentRound({
        golfers: team.golfers,
        roundNumber: 1,
      }),
    )
  ) {
    derivedRound = 2;
  }

  if (
    teamRounds.some((round) => round >= 3) &&
    args.teams.every((team) =>
      hasTeamCompletedTournamentRound({
        golfers: team.golfers,
        roundNumber: 2,
      }),
    )
  ) {
    derivedRound = 3;
  }

  if (
    teamRounds.some((round) => round >= 4) &&
    args.teams.every((team) =>
      hasTeamCompletedTournamentRound({
        golfers: team.golfers,
        roundNumber: 3,
      }),
    )
  ) {
    derivedRound = 4;
  }

  return Math.max(storedRound, derivedRound);
}

/** Returns whether the tournament should be treated as live based on team state or DataGolf live play. */
function getTournamentSyncLivePlay(args: {
  teams: Array<{
    golfers: EnhancedGolfer[];
  }>;
  datagolfLivePlay: boolean;
}): boolean {
  if (args.datagolfLivePlay) {
    return true;
  }

  return args.teams.some((team) =>
    team.golfers.some((golfer) => {
      if (getTournamentGolferSyncRound(golfer) >= 5) {
        return false;
      }

      const liveRound =
        typeof golfer.live?.round === "number" &&
        Number.isFinite(golfer.live.round)
          ? golfer.live.round
          : 0;
      const thru = getHoleCount(golfer.live?.thru);

      return liveRound > 0 && typeof thru === "number" && thru > 0 && thru < 18;
    }),
  );
}

/** Derives an upcoming or active lifecycle status from tee times and observed player activity. */
function deriveTournamentLifecycleStatus(args: {
  golfers: EnhancedGolfer[];
  nowMs: number;
  existingStatus: Doc<"tournaments">["status"];
  openingTeeTimeMs?: number;
}): Exclude<TournamentLifecycleStatus, "completed"> {
  if (args.existingStatus === "active") {
    return "active";
  }

  const startedByClock =
    typeof args.openingTeeTimeMs === "number" &&
    args.nowMs >= args.openingTeeTimeMs;
  const startedByPlay = args.golfers.some((golfer) =>
    hasGolferStartedPlay(golfer),
  );

  return startedByClock || startedByPlay ? "active" : "upcoming";
}

/** Returns the subset of lifecycle fields that need to be patched on the tournament document. */
function getChangedTournamentLifecycleFields(args: {
  tournament: Doc<"tournaments">;
  startDate?: number;
  status?: TournamentLifecycleStatus;
}): {
  startDate?: number;
  status?: TournamentLifecycleStatus;
} | null {
  const update: {
    startDate?: number;
    status?: TournamentLifecycleStatus;
  } = {};

  if (
    typeof args.startDate === "number" &&
    args.startDate !== args.tournament.startDate
  ) {
    update.startDate = args.startDate;
  }

  if (args.status && args.status !== args.tournament.status) {
    update.status = args.status;
  }

  return Object.keys(update).length > 0 ? update : null;
}

/** Converts a UTC timestamp into tournament-local weekday and hour values. */
function getTournamentLocalTimeParts(args: {
  nowMs: number;
  timeZoneOffsetMs: number;
}): {
  localDay: number;
  localHour: number;
} {
  const localDate = new Date(args.nowMs + args.timeZoneOffsetMs);
  return {
    localDay: localDate.getUTCDay(),
    localHour: localDate.getUTCHours(),
  };
}

/** Returns whether a local hour falls within a half-open sync window. */
function isWithinLocalWindow(args: {
  localHour: number;
  startHour: number;
  endHour: number;
}): boolean {
  return args.localHour >= args.startHour && args.localHour < args.endHour;
}

// Level 2D: cadence helpers

/** Evaluates whether a tournament sync should run now and records the local-time gating context. */
function getTournamentSyncGate(args: {
  context: TournamentContext;
  nowMs: number;
  bypassCadence: boolean;
  hasGolfers: boolean;
}):
  | {
      shouldSkip: false;
      localDay: number;
      localHour: number;
    }
  | {
      shouldSkip: true;
      reason: string;
      localDay: number;
      localHour: number;
    } {
  const { localDay, localHour } = getTournamentLocalTimeParts({
    nowMs: args.nowMs,
    timeZoneOffsetMs: args.context.course.timeZoneOffset ?? 0,
  });

  if (args.bypassCadence) {
    return {
      shouldSkip: false,
      localDay,
      localHour,
    };
  }

  if (args.context.type === "recent") {
    return {
      shouldSkip: true,
      reason: "recent_tournament",
      localDay,
      localHour,
    };
  }

  if (args.context.type === "next" && !args.hasGolfers) {
    return {
      shouldSkip: true,
      reason: "groups_not_created",
      localDay,
      localHour,
    };
  }

  if (args.context.type === "next") {
    if (![1, 2, 3].includes(localDay)) {
      return {
        shouldSkip: true,
        reason: "outside_pre_tournament_sync_days",
        localDay,
        localHour,
      };
    }

    if (
      !isWithinLocalWindow({
        localHour,
        startHour: UPCOMING_SYNC_START_HOUR,
        endHour: UPCOMING_SYNC_END_HOUR,
      })
    ) {
      return {
        shouldSkip: true,
        reason: "outside_local_sync_window",
        localDay,
        localHour,
      };
    }

    const lastUpdatedAt = args.context.tournament.leaderboardLastUpdatedAt;
    if (
      typeof lastUpdatedAt === "number" &&
      args.nowMs - lastUpdatedAt < UPCOMING_SYNC_INTERVAL_MS
    ) {
      return {
        shouldSkip: true,
        reason: "throttled_pre_tournament_sync",
        localDay,
        localHour,
      };
    }

    return {
      shouldSkip: false,
      localDay,
      localHour,
    };
  }

  if (![0, 4, 5, 6].includes(localDay)) {
    return {
      shouldSkip: true,
      reason: "outside_live_sync_days",
      localDay,
      localHour,
    };
  }

  if (
    !isWithinLocalWindow({
      localHour,
      startHour: LIVE_SYNC_START_HOUR,
      endHour: LIVE_SYNC_END_HOUR,
    })
  ) {
    return {
      shouldSkip: true,
      reason: "outside_local_sync_window",
      localDay,
      localHour,
    };
  }

  return {
    shouldSkip: false,
    localDay,
    localHour,
  };
}

// Level 2E: change-detection and completion helpers

/** Returns a shallow object containing only keys whose values changed. */
function getChangedFields<T extends Record<string, unknown>>(
  current: Record<string, unknown>,
  next: T,
): Partial<T> {
  const changed: Partial<T> = {};

  for (const [key, value] of Object.entries(next) as Array<
    [keyof T, T[keyof T]]
  >) {
    if (current[key as string] !== value) {
      changed[key] = value;
    }
  }

  return changed;
}

/** Returns whether an object contains at least one changed field. */
function hasChangedFields(data: Record<string, unknown>): boolean {
  return Object.keys(data).length > 0;
}

/** Returns a shallow object with undefined fields removed for Convex patch operations. */
function getDefinedFields<T extends Record<string, unknown>>(
  data: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** Returns whether the historical feed marks the tournament as completed. */
function isHistoricalEventCompleted(
  historicalData: DataGolfHistoricalRoundDataResponse | undefined,
): boolean {
  return (
    historicalData?.event_completed === "true" ||
    historicalData?.event_completed === "1"
  );
}

/** Returns whether live today scoring should contribute to the aggregate tournament score. */
function shouldIncludeLiveTodayInScore(args: {
  currentRound: number;
  isRoundRunning: boolean;
}): boolean {
  return (
    args.isRoundRunning && args.currentRound >= 1 && args.currentRound <= 4
  );
}

// Level 3: data access and database mutation helpers

// Level 3A: sync context and database loaders

/** Patches tournament sync fields and always refreshes updatedAt. */
export const updateTournamentInfo = internalMutation({
  args: {
    tournament: v.object({
      _id: v.id("tournaments"),
      startDate: v.optional(v.number()),
      endDate: v.optional(v.number()),
      currentRound: v.optional(v.number()),
      livePlay: v.optional(v.boolean()),
      leaderboardLastUpdatedAt: v.optional(v.number()),
      status: v.optional(
        v.union(
          v.literal("upcoming"),
          v.literal("active"),
          v.literal("completed"),
        ),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const patch = getDefinedFields({
      ...args.tournament,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(args.tournament._id, patch);

    return {
      ok: true,
      tournamentId: args.tournament._id,
    } as const;
  },
});

/** Creates missing golfer and tournamentGolfer rows for a tournament field feed. */
export const createMissingTournamentGolfers = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    golfers: v.array(
      v.object({
        dg_id: v.number(),
        player_name: v.string(),
        country: v.optional(v.string()),
        worldRank: v.optional(v.number()),
        dg_skill_estimate: v.optional(v.number()),
        r1_teetime: v.optional(v.union(v.number(), v.string())),
        r2_teetime: v.optional(v.union(v.number(), v.string())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let createdGolfers = 0;
    let createdTournamentGolfers = 0;

    for (const incomingGolfer of args.golfers) {
      let golfer = await ctx.db
        .query("golfers")
        .withIndex("by_api_id", (q) => q.eq("apiId", incomingGolfer.dg_id))
        .first();

      if (!golfer) {
        const golferId = await ctx.db.insert("golfers", {
          apiId: incomingGolfer.dg_id,
          playerName: normalizePlayerNameFromDataGolf(
            incomingGolfer.player_name,
          ),
          country: incomingGolfer.country,
          worldRank: incomingGolfer.worldRank,
          updatedAt: Date.now(),
        });

        golfer = await ctx.db.get(golferId);
        createdGolfers += 1;
      }

      if (!golfer) {
        continue;
      }

      const existingTournamentGolfer = await ctx.db
        .query("tournamentGolfers")
        .withIndex("by_golfer_tournament", (q) =>
          q.eq("golferId", golfer._id).eq("tournamentId", args.tournamentId),
        )
        .first();

      if (existingTournamentGolfer) {
        continue;
      }

      await ctx.db.insert("tournamentGolfers", {
        golferId: golfer._id,
        tournamentId: args.tournamentId,
        roundOneTeeTime:
          typeof incomingGolfer.r1_teetime === "string"
            ? parseDataGolfTeeTimeToMs(incomingGolfer.r1_teetime)
            : incomingGolfer.r1_teetime,
        roundTwoTeeTime:
          typeof incomingGolfer.r2_teetime === "string"
            ? parseDataGolfTeeTimeToMs(incomingGolfer.r2_teetime)
            : incomingGolfer.r2_teetime,
        rating: incomingGolfer.dg_skill_estimate,
        worldRank: incomingGolfer.worldRank,
        updatedAt: Date.now(),
      });
      createdTournamentGolfers += 1;
    }

    return {
      ok: true,
      createdGolfers,
      createdTournamentGolfers,
    } as const;
  },
});

/** Applies direct tournamentGolfer sync patches without relying on external internal modules. */
export const updateTournamentGolfer = internalMutation({
  args: {
    tournamentGolfer: v.object({
      _id: v.id("tournamentGolfers"),
      golferId: v.optional(v.id("golfers")),
      tournamentId: v.optional(v.id("tournaments")),
      position: v.optional(v.string()),
      posChange: v.optional(v.number()),
      score: v.optional(v.number()),
      makeCut: v.optional(v.number()),
      topTen: v.optional(v.number()),
      win: v.optional(v.number()),
      earnings: v.optional(v.number()),
      today: v.optional(v.number()),
      thru: v.optional(v.number()),
      round: v.optional(v.number()),
      endHole: v.optional(v.number()),
      group: v.optional(v.number()),
      roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
      roundOne: v.optional(v.number()),
      roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
      roundTwo: v.optional(v.number()),
      roundThreeTeeTime: v.optional(v.union(v.number(), v.string())),
      roundThree: v.optional(v.number()),
      roundFourTeeTime: v.optional(v.union(v.number(), v.string())),
      roundFour: v.optional(v.number()),
      rating: v.optional(v.number()),
      worldRank: v.optional(v.number()),
      usage: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const existingTournamentGolfer = await ctx.db.get(
      args.tournamentGolfer._id,
    );
    if (!existingTournamentGolfer) {
      throw new Error("Tournament golfer not found");
    }

    const { _id, ...patchData } = args.tournamentGolfer;
    await ctx.db.patch(_id, {
      ...getDefinedFields(patchData),
      updatedAt: Date.now(),
    });

    return {
      ok: true,
      tournamentGolferId: _id,
    } as const;
  },
});

/** Loads the most relevant tournament to sync along with its course and optional tier context. */
export const getActiveTournamentSyncContext = internalQuery({
  handler: async (ctx): Promise<TournamentSyncContextResponse> => {
    const currentYear = new Date().getFullYear();
    const currentSeason = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", currentYear))
      .first();
    if (!currentSeason) {
      return { ok: false };
    }

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_season", (q) => q.eq("seasonId", currentSeason._id))
      .collect();
    const nowMs = Date.now();
    const tournament =
      tournaments.find((candidate) => candidate.status === "active") ??
      tournaments.find(
        (candidate) => candidate.startDate < nowMs && candidate.endDate > nowMs,
      ) ??
      tournaments
        .filter((candidate) => candidate.startDate > nowMs)
        .sort((a, b) => a.startDate - b.startDate)[0] ??
      tournaments
        .filter((candidate) => candidate.endDate < nowMs)
        .sort((a, b) => b.endDate - a.endDate)[0];

    if (!tournament) {
      return { ok: false };
    }

    const course = await ctx.db.get(tournament.courseId);
    if (!course) {
      return { ok: false };
    }

    const type = getTournamentSyncType(tournament, nowMs);
    if (type === "next") {
      return {
        ok: true,
        type,
        tournament,
        course,
      };
    }

    const tier = await ctx.db.get(tournament.tierId);
    if (!tier) {
      return { ok: false };
    }

    return {
      ok: true,
      type,
      tournament,
      course,
      tier,
    };
  },
});

/** Loads sync context for a specific tournament id, including course and optional tier data. */
export const getTournamentSyncContextById = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args): Promise<TournamentSyncContextResponse> => {
    const tournament = await ctx.db.get(args.tournamentId);
    if (!tournament) {
      return { ok: false };
    }

    const course = await ctx.db.get(tournament.courseId);
    if (!course) {
      return { ok: false };
    }

    const type = getTournamentSyncType(tournament, Date.now());
    if (type === "next") {
      return {
        ok: true,
        type,
        tournament,
        course,
      };
    }

    const tier = await ctx.db.get(tournament.tierId);
    if (!tier) {
      return { ok: false };
    }

    return {
      ok: true,
      type,
      tournament,
      course,
      tier,
    };
  },
});

/** Returns whether the tournament already has at least one tournament golfer record. */
export const getTournamentHasGolfers = internalQuery({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args) => {
    const tournamentGolfer = await ctx.db
      .query("tournamentGolfers")
      .withIndex("by_tournament", (q) =>
        q.eq("tournamentId", args.tournamentId),
      )
      .first();

    return Boolean(tournamentGolfer);
  },
});

/** Loads the teams, tours, tour cards, and tournament golfers needed for sync calculations. */
export const getTournamentDatabaseData = internalQuery({
  args: {
    tournamentId: v.id("tournaments"),
    seasonId: v.id("seasons"),
    options: v.object({
      includeTeams: v.boolean(),
      includeTeamTours: v.boolean(),
    }),
  },
  handler: async (ctx, args): Promise<TournamentDatabaseStats> => {
    const [teams, tourCards, tours, tournamentGolfers] = await Promise.all([
      args.options.includeTeams
        ? ctx.db
            .query("teams")
            .withIndex("by_tournament", (q) =>
              q.eq("tournamentId", args.tournamentId),
            )
            .collect()
        : Promise.resolve([] as Doc<"teams">[]),
      args.options.includeTeams && args.options.includeTeamTours
        ? ctx.db
            .query("tourCards")
            .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
            .collect()
        : Promise.resolve([] as Doc<"tourCards">[]),
      args.options.includeTeams && args.options.includeTeamTours
        ? ctx.db
            .query("tours")
            .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
            .collect()
        : Promise.resolve([] as Doc<"tours">[]),
      ctx.db
        .query("tournamentGolfers")
        .withIndex("by_tournament", (q) =>
          q.eq("tournamentId", args.tournamentId),
        )
        .collect(),
    ]);

    const golfers = await Promise.all(
      tournamentGolfers.map(async (tournamentGolfer) => ({
        tournamentGolfer,
        golfer: (await ctx.db.get(tournamentGolfer.golferId)) ?? undefined,
      })),
    );

    return {
      teams: teams.map((team) => {
        const tourCard = args.options.includeTeamTours
          ? tourCards.find((candidate) => candidate._id === team.tourCardId)
          : undefined;

        return {
          ...team,
          tourCard,
          tour: args.options.includeTeamTours
            ? tours.find((candidate) => candidate._id === tourCard?.tourId)
            : undefined,
        };
      }),
      golfers,
    };
  },
});

// Level 3B: external feed and combined stats loaders

/** Fetches the external DataGolf payloads needed for tournament synchronization. */
async function getTournamentExternalData(
  ctx: ActionCtx,
  args: {
    tournament: {
      _id: Doc<"tournaments">["_id"];
      name: string;
      endDate: number;
      apiId?: string;
      seasonId: Doc<"seasons">["_id"];
    };
    tzOffset?: number;
    options: {
      includeRankings: boolean;
    };
  },
): Promise<TournamentExternalData> {
  const tournamentForDataGolf = {
    _id: args.tournament._id,
    name: args.tournament.name,
    apiId: args.tournament.apiId,
    seasonId: args.tournament.seasonId,
  };
  const fieldData = await ctx.runAction(
    api.functions.datagolf.fetchFieldUpdates,
    {
      tournament: tournamentForDataGolf,
    },
  );
  const liveData = await ctx.runAction(
    api.functions.datagolf.fetchLiveModelPredictions,
    { tournament: tournamentForDataGolf },
  );
  const rankingData = args.options.includeRankings
    ? await ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {})
    : undefined;
  const historicalData =
    args.tournament.endDate < Date.now()
      ? await ctx.runAction(api.functions.datagolf.fetchHistoricalRoundData, {
          tournament: tournamentForDataGolf,
          options: {
            tour: "pga",
            year: new Date().getFullYear(),
            tzOffset: args.tzOffset,
          },
        })
      : undefined;

  if ("ok" in fieldData || "ok" in liveData) {
    return { ok: false };
  }

  return {
    ok: true,
    fieldData: fieldData as DataGolfFieldUpdatesResponse,
    rankingData: rankingData as DataGolfRankingsResponse | undefined,
    liveData: liveData as DataGolfLiveModelPredictionsResponse,
    historicalData: historicalData as
      | DataGolfHistoricalRoundDataResponse
      | undefined,
  };
}

/** Combines database state and external feeds into the normalized sync view model. */
async function getTournamentStats(
  ctx: ActionCtx,
  context: TournamentContext,
  options: TournamentStatsOptions,
): Promise<TournamentStats | null> {
  const [databaseData, externalData] = await Promise.all([
    ctx.runQuery(internal.crons.sync.getTournamentDatabaseData, {
      tournamentId: context.tournament._id,
      seasonId: context.tournament.seasonId,
      options: {
        includeTeams: options.includeTeams,
        includeTeamTours: options.includeTeamTours,
      },
    }),
    getTournamentExternalData(ctx, {
      tournament: {
        _id: context.tournament._id,
        name: context.tournament.name,
        endDate: context.tournament.endDate,
        apiId: context.tournament.apiId,
        seasonId: context.tournament.seasonId,
      },
      tzOffset: context.course.timeZoneOffset ?? -18000000,
      options: {
        includeRankings: options.includeRankings,
      },
    }),
  ]);

  if (!externalData.ok) {
    return null;
  }

  const golfers = databaseData.golfers.map((golfer) => ({
    ...golfer,
    field: externalData.fieldData.field
      ? externalData.fieldData.field.find(
          (fieldGolfer) => fieldGolfer.dg_id === golfer.golfer?.apiId,
        )
      : undefined,
    ranking: externalData.rankingData?.rankings?.find(
      (ranking) => ranking.dg_id === golfer.golfer?.apiId,
    ),
    live: externalData.liveData.data
      ? externalData.liveData.data.find(
          (liveGolfer) => liveGolfer.dg_id === golfer.golfer?.apiId,
        )
      : undefined,
    historical: externalData.historicalData?.scores
      ? externalData.historicalData.scores.find(
          (historicalGolfer) => historicalGolfer.dg_id === golfer.golfer?.apiId,
        )
      : undefined,
  }));

  return {
    teams: databaseData.teams.map((team) => ({
      ...team,
      golfers: golfers.filter(
        (golfer) =>
          team.golferIds.includes(golfer.golfer?.apiId ?? -1) &&
          (golfer.tournamentGolfer?.group ?? 0) > 0,
      ),
    })),
    golfers,
    fieldData: externalData.fieldData,
    liveData: externalData.liveData,
    historicalData: externalData.historicalData,
  };
}

// Level 3C: roster repair helpers

/** Repairs undersized team rosters by filling missing grouped golfers from the tournament pool. */
async function repairIncompleteTeamRosters(args: {
  ctx: ActionCtx;
  teams: TournamentSyncTeam[];
  golfers: EnhancedGolfer[];
}): Promise<number> {
  let repairedTeams = 0;

  for (const team of args.teams) {
    if ((team.golfers?.length ?? 0) >= 10) {
      continue;
    }

    const nextApiIds = [...team.golferIds];
    const nextGolfers = [...team.golfers];

    for (const group of [1, 2, 3, 4, 5] as const) {
      const currentGroupCount = nextGolfers.filter(
        (golfer) => golfer.tournamentGolfer?.group === group,
      ).length;
      const missingCount = Math.max(0, 2 - currentGroupCount);
      if (missingCount === 0) {
        continue;
      }

      const availableGolfers = args.golfers
        .filter(
          (golfer) =>
            golfer.tournamentGolfer?.group === group &&
            typeof golfer.golfer?.apiId === "number" &&
            !nextApiIds.includes(golfer.golfer.apiId),
        )
        .sort((a, b) => {
          const aRank = a.ranking?.owgr_rank ?? Number.POSITIVE_INFINITY;
          const bRank = b.ranking?.owgr_rank ?? Number.POSITIVE_INFINITY;
          return aRank - bRank;
        })
        .slice(0, missingCount);

      for (const golfer of availableGolfers) {
        if (typeof golfer.golfer?.apiId !== "number") {
          continue;
        }

        nextApiIds.push(golfer.golfer.apiId);
        nextGolfers.push(golfer);
      }
    }

    if (nextApiIds.length === team.golferIds.length) {
      continue;
    }

    await args.ctx.runMutation(
      internal.functions.teams.updateTeamRosterInternal,
      {
        teamId: team._id,
        apiIds: nextApiIds,
      },
    );

    repairedTeams += 1;
  }

  return repairedTeams;
}

// Level 4: top-level orchestration functions

// Level 4A: tournament-mode sync flows

/** Synchronizes an upcoming tournament by refreshing tee times, creating missing golfers, and repairing teams. */
async function syncUpcomingTournament(args: {
  ctx: ActionCtx;
  context: TournamentContext;
  stats: TournamentStats;
  nowMs: number;
  logPrefix: string;
}) {
  const { ctx, context, stats, nowMs, logPrefix } = args;
  const openingTeeTime =
    getFieldRoundOneTeeTimeMs(stats.fieldData.field) ??
    earliestTimeStr(
      stats.golfers.map((golfer) => getGolferRoundOneTeeTimeMs(golfer)),
    ) ??
    context.tournament.startDate;
  const lifecycleStatus = deriveTournamentLifecycleStatus({
    golfers: stats.golfers,
    nowMs,
    existingStatus: context.tournament.status,
    openingTeeTimeMs: openingTeeTime,
  });

  if (lifecycleStatus === "active") {
    await ctx.runMutation(internal.crons.sync.updateTournamentInfo, {
      tournament: {
        _id: context.tournament._id,
        status: "active",
        startDate: openingTeeTime,
        leaderboardLastUpdatedAt: nowMs,
      },
    });

    console.log(`${logPrefix}: skipped (next_tournament_toggled_to_active)`, {
      tournamentId: context.tournament._id,
      tournamentName: context.tournament.name,
      startDate: openingTeeTime,
    });

    return {
      ok: true,
      skipped: true,
      reason: "next_tournament_toggled_to_active",
      tournamentId: context.tournament._id,
      tournamentName: context.tournament.name,
    } as const;
  }

  const repairedTeams = await repairIncompleteTeamRosters({
    ctx,
    teams: stats.teams,
    golfers: stats.golfers,
  });

  const golferApiIds = new Set(
    stats.golfers.map((golfer) => golfer.golfer?.apiId),
  );
  const newGolfers = (stats.fieldData.field ?? [])
    .filter(
      (fieldGolfer) =>
        fieldGolfer.dg_id && !golferApiIds.has(fieldGolfer.dg_id),
    )
    .map((fieldGolfer) => {
      const focusGolfer = stats.golfers.find(
        (golfer) => golfer.golfer?.apiId === fieldGolfer.dg_id,
      );
      return {
        dg_id: fieldGolfer.dg_id,
        player_name: normalizePlayerNameFromDataGolf(fieldGolfer.player_name),
        country: fieldGolfer.country,
        world_rank: focusGolfer?.ranking?.owgr_rank ?? undefined,
        dg_skill_estimate: focusGolfer?.ranking?.dg_skill_estimate ?? undefined,
        r1_teetime:
          fieldGolfer.teetimes.find((teetime) => teetime.round_num === 1)
            ?.teetime ?? undefined,
        r2_teetime:
          fieldGolfer.teetimes.find((teetime) => teetime.round_num === 2)
            ?.teetime ?? undefined,
      };
    });

  if (newGolfers.length > 0) {
    await ctx.runMutation(internal.crons.sync.createMissingTournamentGolfers, {
      tournamentId: context.tournament._id,
      golfers: newGolfers,
    });
  }

  await ctx.runMutation(internal.crons.sync.updateTournamentInfo, {
    tournament: {
      _id: context.tournament._id,
      startDate: openingTeeTime,
      status: "upcoming",
      leaderboardLastUpdatedAt: nowMs,
    },
  });

  return {
    ok: true,
    skipped: false,
    reason: "pre_tournament_synced",
    tournamentId: context.tournament._id,
    tournamentName: context.tournament.name,
    golfersCreated: newGolfers.length,
    teamsRepaired: repairedTeams,
  } as const;
}

/** Synchronizes a live or recently finished tournament across golfers, teams, and tournament metadata. */
async function syncLiveTournament(args: {
  ctx: ActionCtx;
  context: TournamentContext;
  stats: TournamentStats;
  nowMs: number;
}) {
  const { ctx, context, stats, nowMs } = args;
  if (!context.tier) {
    throw new Error("syncLiveTournament requires tier data");
  }

  const upstreamCompleted = isHistoricalEventCompleted(stats.historicalData);
  const completionCandidate =
    upstreamCompleted ||
    (stats.golfers.length > 0 &&
      stats.golfers.every((golfer) => hasGolferCompletedTournament(golfer)));
  const datagolfCurrentRound = stats.liveData.info
    ? stats.liveData.info.current_round
    : upstreamCompleted
      ? 5
      : 0;
  const datagolfLivePlay = stats.liveData.info
    ? isRoundRunningFromLiveStats(
        stats.golfers.map((golfer) => ({
          current_pos:
            golfer.live?.current_pos ??
            golfer.historical?.fin_text ??
            undefined,
          thru: parseFloat(golfer.live?.thru ?? ""),
        })),
      )
    : false;
  const firstTeeTime =
    earliestTimeStr(
      stats.golfers.map((golfer) => getGolferRoundOneTeeTimeMs(golfer)),
    ) ?? context.tournament.startDate;
  const baseStatus: TournamentLifecycleStatus =
    context.tournament.status === "completed"
      ? "completed"
      : completionCandidate
        ? "active"
        : deriveTournamentLifecycleStatus({
            golfers: stats.golfers,
            nowMs,
            existingStatus: context.tournament.status,
            openingTeeTimeMs: firstTeeTime,
          });
  const usageMap = buildUsageRateByGolferApiId({ teams: stats.teams });
  let golferUpdates = 0;

  for (const golfer of stats.golfers) {
    if (!golfer.golfer?._id || !golfer.tournamentGolfer?._id) {
      continue;
    }

    const golferPosition = getEffectiveTournamentPosition(golfer);
    const roundOneScore = getTournamentRoundScore({
      golfer,
      roundNumber: 1,
      currentRound: datagolfCurrentRound,
      isRoundRunning: datagolfLivePlay,
      coursePar: context.course.par,
    });
    const roundTwoScore = getTournamentRoundScore({
      golfer,
      roundNumber: 2,
      currentRound: datagolfCurrentRound,
      isRoundRunning: datagolfLivePlay,
      coursePar: context.course.par,
    });
    const roundThreeScore = getTournamentRoundScore({
      golfer,
      roundNumber: 3,
      currentRound: datagolfCurrentRound,
      isRoundRunning: datagolfLivePlay,
      coursePar: context.course.par,
    });
    const roundFourScore = getTournamentRoundScore({
      golfer,
      roundNumber: 4,
      currentRound: datagolfCurrentRound,
      isRoundRunning: datagolfLivePlay,
      coursePar: context.course.par,
    });
    const betterGolfers = stats.golfers.filter((otherGolfer) => {
      const otherPosition = getEffectiveTournamentPosition(otherGolfer);
      return (
        (isNonRankingTournamentPosition(otherPosition)
          ? 999
          : (otherGolfer.live?.current_score ?? 0)) <
        (isNonRankingTournamentPosition(golferPosition)
          ? 999
          : (golfer.live?.current_score ?? 0))
      );
    }).length;
    const betterGolfersPast = stats.golfers.filter((otherGolfer) => {
      const otherPosition = getEffectiveTournamentPosition(otherGolfer);
      return (
        (isNonRankingTournamentPosition(otherPosition)
          ? 999
          : (otherGolfer.live?.current_score ?? 0) -
            (otherGolfer.live?.today ?? 0)) <
        (isNonRankingTournamentPosition(golferPosition)
          ? 999
          : (golfer.live?.current_score ?? 0) - (golfer.live?.today ?? 0))
      );
    }).length;
    const tiedGolfers = stats.golfers.filter((otherGolfer) => {
      const otherPosition = getEffectiveTournamentPosition(otherGolfer);
      return (
        (isNonRankingTournamentPosition(otherPosition)
          ? 999
          : (otherGolfer.live?.current_score ?? 0)) ===
        (isNonRankingTournamentPosition(golferPosition)
          ? 999
          : (golfer.live?.current_score ?? 0))
      );
    }).length;

    const nextTournamentGolfer = {
      tournamentId: context.tournament._id,
      golferId: golfer.golfer._id,
      position: isNonRankingTournamentPosition(golferPosition)
        ? golferPosition
        : tiedGolfers > 1
          ? `T${betterGolfers + 1}`
          : `${betterGolfers + 1}`,
      posChange: betterGolfersPast - betterGolfers,
      score:
        golfer.live?.current_score ??
        (golfer.historical
          ? roundToDecimalPlace(
              (golfer.historical.round_1?.score ?? 0) -
                (golfer.historical.round_1?.course_par ?? 0) +
                ((golfer.historical.round_2?.score ?? 0) -
                  (golfer.historical.round_2?.course_par ?? 0)) +
                ((golfer.historical.round_3?.score ?? 0) -
                  (golfer.historical.round_3?.course_par ?? 0)) +
                ((golfer.historical.round_4?.score ?? 0) -
                  (golfer.historical.round_4?.course_par ?? 0)),
            )
          : typeof golfer.tournamentGolfer.score === "number"
            ? roundToDecimalPlace(golfer.tournamentGolfer.score)
            : undefined),
      endHole:
        golfer.live?.end_hole ?? golfer.tournamentGolfer?.endHole ?? undefined,
      makeCut:
        golfer.live?.make_cut ?? golfer.tournamentGolfer?.makeCut ?? undefined,
      topTen:
        golfer.live?.top_10 ?? golfer.tournamentGolfer?.topTen ?? undefined,
      win: golfer.live?.win ?? golfer.tournamentGolfer?.win ?? undefined,
      today: getTournamentTodayValue({
        golfer,
        currentRound: datagolfCurrentRound,
        isRoundRunning: datagolfLivePlay,
        coursePar: context.course.par,
      }),
      thru: getTournamentThruValue({
        golfer,
        currentRound: datagolfCurrentRound,
        isRoundRunning: datagolfLivePlay,
        coursePar: context.course.par,
      }),
      roundOne: roundOneScore,
      roundTwo: roundTwoScore,
      roundThree: roundThreeScore,
      roundFour: roundFourScore,
      roundOneTeeTime:
        golfer.field?.teetimes.find((teetime) => teetime.round_num === 1)
          ?.teetime ??
        golfer.historical?.round_1?.teetime ??
        (typeof golfer.tournamentGolfer.roundOneTeeTime === "number"
          ? golfer.tournamentGolfer.roundOneTeeTime
          : (parseDataGolfTeeTimeToMs(
              golfer.tournamentGolfer.roundOneTeeTime as string,
            ) ?? undefined)),
      roundTwoTeeTime:
        golfer.field?.teetimes.find((teetime) => teetime.round_num === 2)
          ?.teetime ??
        golfer.historical?.round_2?.teetime ??
        (typeof golfer.tournamentGolfer.roundTwoTeeTime === "number"
          ? golfer.tournamentGolfer.roundTwoTeeTime
          : (parseDataGolfTeeTimeToMs(
              golfer.tournamentGolfer.roundTwoTeeTime as string,
            ) ?? undefined)),
      roundThreeTeeTime:
        golfer.field?.teetimes.find((teetime) => teetime.round_num === 3)
          ?.teetime ??
        golfer.historical?.round_3?.teetime ??
        (typeof golfer.tournamentGolfer.roundThreeTeeTime === "number"
          ? golfer.tournamentGolfer.roundThreeTeeTime
          : (parseDataGolfTeeTimeToMs(
              golfer.tournamentGolfer.roundThreeTeeTime as string,
            ) ?? undefined)),
      roundFourTeeTime:
        golfer.field?.teetimes.find((teetime) => teetime.round_num === 4)
          ?.teetime ??
        golfer.historical?.round_4?.teetime ??
        (typeof golfer.tournamentGolfer.roundFourTeeTime === "number"
          ? golfer.tournamentGolfer.roundFourTeeTime
          : (parseDataGolfTeeTimeToMs(
              golfer.tournamentGolfer.roundFourTeeTime as string,
            ) ?? undefined)),
      usage: usageMap.get(golfer.golfer.apiId ?? -1) ?? 0,
      round: getTournamentGolferSyncRound(golfer),
    };
    const changedTournamentGolfer = getChangedFields(
      golfer.tournamentGolfer as unknown as Record<string, unknown>,
      nextTournamentGolfer,
    );

    if (!hasChangedFields(changedTournamentGolfer)) {
      continue;
    }

    await ctx.runMutation(internal.crons.sync.updateTournamentGolfer, {
      tournamentGolfer: {
        _id: golfer.tournamentGolfer._id,
        ...changedTournamentGolfer,
      },
    });
    golferUpdates += 1;
  }

  const updatedTeams: Array<{
    existingTeam: TournamentSyncTeam;
    nextTeam: TournamentSyncTeam;
  }> = [];
  for (const team of stats.teams) {
    const teamRound = getTournamentTeamSyncRound({
      golfers: team.golfers,
      existingRound: team.round,
    });
    const teamRoundRunning = isTeamRoundRunning(team.golfers);
    const roundOne = getTeamRoundScore({
      golfers: team.golfers,
      roundNumber: 1,
      currentRound: teamRound,
      isRoundRunning: teamRoundRunning,
      coursePar: context.course.par,
    });
    const roundTwo = getTeamRoundScore({
      golfers: team.golfers,
      roundNumber: 2,
      currentRound: teamRound,
      isRoundRunning: teamRoundRunning,
      coursePar: context.course.par,
    });
    const roundThree = getTeamRoundScore({
      golfers: team.golfers,
      roundNumber: 3,
      currentRound: teamRound,
      isRoundRunning: teamRoundRunning,
      coursePar: context.course.par,
    });
    const roundFour = getTeamRoundScore({
      golfers: team.golfers,
      roundNumber: 4,
      currentRound: teamRound,
      isRoundRunning: teamRoundRunning,
      coursePar: context.course.par,
    });
    const teamWeekendCut = isTeamWeekendCut({
      golfers: team.golfers,
      currentRound: teamRound,
    });
    const teamLiveWindowGolfers = getTeamLiveWindowGolfers({
      golfers: team.golfers,
      currentRound: teamRound,
      isRoundRunning: teamRoundRunning,
      coursePar: context.course.par,
    });
    const teamLiveTodayMean = getTeamLiveWindowMean({
      golfers: teamLiveWindowGolfers,
      currentRound: teamRound,
      isRoundRunning: teamRoundRunning,
      coursePar: context.course.par,
      metric: "today",
    });
    const teamLiveThruMean = getTeamLiveWindowMean({
      golfers: teamLiveWindowGolfers,
      currentRound: teamRound,
      isRoundRunning: teamRoundRunning,
      coursePar: context.course.par,
      metric: "thru",
    });

    updatedTeams.push({
      existingTeam: team,
      nextTeam: {
        ...team,
        position: teamWeekendCut ? "CUT" : team.position,
        score: getTeamAggregateScore({
          roundOne,
          roundTwo,
          roundThree,
          roundFour,
          liveToday: teamLiveTodayMean,
          coursePar: context.course.par,
          currentRound: teamRound,
          isRoundRunning: teamRoundRunning,
        }),
        today:
          typeof teamLiveTodayMean === "number"
            ? roundToDecimalPlace(teamLiveTodayMean, 1)
            : undefined,
        thru:
          typeof teamLiveThruMean === "number"
            ? roundToDecimalPlace(teamLiveThruMean, 1)
            : undefined,
        round: teamRound,
        roundOneTeeTime: earliestTimeStr(
          team.golfers.map(
            (golfer) =>
              golfer.field?.teetimes.find((teetime) => teetime.round_num === 1)
                ?.teetime ??
              golfer.historical?.round_1?.teetime ??
              (typeof golfer.tournamentGolfer?.roundOneTeeTime === "number"
                ? golfer.tournamentGolfer.roundOneTeeTime
                : (parseDataGolfTeeTimeToMs(
                    golfer.tournamentGolfer?.roundOneTeeTime as string,
                  ) ?? undefined)),
          ),
        ),
        roundOne,
        roundTwoTeeTime: earliestTimeStr(
          team.golfers.map(
            (golfer) =>
              golfer.field?.teetimes.find((teetime) => teetime.round_num === 2)
                ?.teetime ??
              golfer.historical?.round_2?.teetime ??
              (typeof golfer.tournamentGolfer?.roundTwoTeeTime === "number"
                ? golfer.tournamentGolfer.roundTwoTeeTime
                : (parseDataGolfTeeTimeToMs(
                    golfer.tournamentGolfer?.roundTwoTeeTime as string,
                  ) ?? undefined)),
          ),
        ),
        roundTwo,
        roundThreeTeeTime: teamWeekendCut
          ? undefined
          : earliestTimeStr(
              team.golfers
                .map(
                  (golfer) =>
                    golfer.field?.teetimes.find(
                      (teetime) => teetime.round_num === 3,
                    )?.teetime ??
                    golfer.historical?.round_3?.teetime ??
                    (typeof golfer.tournamentGolfer?.roundThreeTeeTime ===
                    "number"
                      ? golfer.tournamentGolfer.roundThreeTeeTime
                      : (parseDataGolfTeeTimeToMs(
                          golfer.tournamentGolfer?.roundThreeTeeTime as string,
                        ) ?? undefined)),
                )
                .sort((a, b) => (a ?? 0) - (b ?? 0))
                .slice(-5),
            ),
        roundThree,
        roundFourTeeTime: teamWeekendCut
          ? undefined
          : earliestTimeStr(
              team.golfers
                .map(
                  (golfer) =>
                    golfer.field?.teetimes.find(
                      (teetime) => teetime.round_num === 4,
                    )?.teetime ??
                    golfer.historical?.round_4?.teetime ??
                    (typeof golfer.tournamentGolfer?.roundFourTeeTime ===
                    "number"
                      ? golfer.tournamentGolfer.roundFourTeeTime
                      : (parseDataGolfTeeTimeToMs(
                          golfer.tournamentGolfer?.roundFourTeeTime as string,
                        ) ?? undefined)),
                )
                .sort((a, b) => (a ?? 0) - (b ?? 0))
                .slice(-5),
            ),
        roundFour,
      },
    });
  }

  let teamUpdates = 0;
  for (const { existingTeam, nextTeam } of updatedTeams) {
    const teamsAhead = updatedTeams.filter(
      ({ nextTeam: comparedTeam }) =>
        comparedTeam.tour?._id === nextTeam.tour?._id &&
        (comparedTeam.score ?? 0) < (nextTeam.score ?? 0),
    ).length;
    const teamsAheadPast = updatedTeams.filter(
      ({ nextTeam: comparedTeam }) =>
        comparedTeam.tour?._id === nextTeam.tour?._id &&
        (comparedTeam.score ?? 0) - (comparedTeam.today ?? 0) <
          (nextTeam.score ?? 0) - (nextTeam.today ?? 0),
    ).length;
    const teamsTied = updatedTeams.filter(
      ({ nextTeam: comparedTeam }) =>
        comparedTeam.tour?._id === nextTeam.tour?._id &&
        (comparedTeam.score ?? 0) === (nextTeam.score ?? 0),
    ).length;
    const teamsTiedPast = updatedTeams.filter(
      ({ nextTeam: comparedTeam }) =>
        comparedTeam.tour?._id === nextTeam.tour?._id &&
        (comparedTeam.score ?? 0) - (comparedTeam.today ?? 0) ===
          (nextTeam.score ?? 0) - (nextTeam.today ?? 0),
    ).length;

    const nextTeamUpdate = {
      makeCut: nextTeam.makeCut,
      score: nextTeam.score,
      topTen: nextTeam.topTen,
      topFive: nextTeam.topFive,
      topThree: nextTeam.topThree,
      win: nextTeam.win,
      today: nextTeam.today,
      thru: nextTeam.thru,
      round: nextTeam.round,
      roundOneTeeTime: nextTeam.roundOneTeeTime,
      roundOne: nextTeam.roundOne,
      roundTwoTeeTime: nextTeam.roundTwoTeeTime,
      roundTwo: nextTeam.roundTwo,
      roundThreeTeeTime: nextTeam.roundThreeTeeTime,
      roundThree: nextTeam.roundThree,
      roundFourTeeTime: nextTeam.roundFourTeeTime,
      roundFour: nextTeam.roundFour,
      earnings: awardTeamEarnings(
        context.tier?.payouts ?? [],
        teamsAhead,
        teamsTied,
      ),
      points: awardTeamPlayoffPoints(
        context.tier?.points ?? [],
        teamsAhead,
        teamsTied,
      ),
      position:
        nextTeam.position === "CUT"
          ? "CUT"
          : teamsTied > 1
            ? `T${teamsAhead + 1}`
            : `${teamsAhead + 1}`,
      pastPosition:
        teamsTiedPast > 1 ? `T${teamsAheadPast + 1}` : `${teamsAheadPast + 1}`,
    };
    const changedTeamFields = getChangedFields(
      existingTeam as unknown as Record<string, unknown>,
      nextTeamUpdate,
    );

    if (!hasChangedFields(changedTeamFields)) {
      continue;
    }

    await ctx.runMutation(internal.functions.teams.updateTeamInternal, {
      team: {
        _id: nextTeam._id,
        ...changedTeamFields,
      },
    });
    teamUpdates += 1;
  }

  const finalTournamentRound = getTournamentSyncCurrentRound({
    teams: updatedTeams.map(({ nextTeam }) => nextTeam),
    existingRound: context.tournament.currentRound,
  });
  const finalTournamentLivePlay = completionCandidate
    ? false
    : getTournamentSyncLivePlay({
        teams: updatedTeams.map(({ nextTeam }) => nextTeam),
        datagolfLivePlay,
      });
  const finalizationReady =
    completionCandidate &&
    stats.golfers.every(
      (golfer) => getTournamentGolferSyncRound(golfer) >= 5,
    ) &&
    updatedTeams.every(({ nextTeam }) => (nextTeam.round ?? 0) >= 5);
  const finalStatus: TournamentLifecycleStatus =
    context.tournament.status === "completed"
      ? "completed"
      : completionCandidate && finalizationReady
        ? "completed"
        : baseStatus;
  const lifecycleUpdates = getChangedTournamentLifecycleFields({
    tournament: context.tournament,
    startDate: firstTeeTime,
    status: finalStatus,
  });
  const changedTournamentFields = getChangedFields(
    context.tournament as unknown as Record<string, unknown>,
    {
      currentRound: finalTournamentRound,
      livePlay: finalTournamentLivePlay,
      ...(lifecycleUpdates ?? {}),
    },
  );

  if (hasChangedFields(changedTournamentFields)) {
    await ctx.runMutation(internal.crons.sync.updateTournamentInfo, {
      tournament: {
        _id: context.tournament._id,
        ...changedTournamentFields,
      },
    });
  }

  return {
    ok: true,
    skipped: false,
    reason: "completed_update",
    tournamentId: context.tournament._id,
    tournamentName: context.tournament.name,
    currentRound: finalTournamentRound,
    livePlay: finalTournamentLivePlay,
    status: finalStatus,
    finalized: finalizationReady,
    golfersUpdated: golferUpdates,
    teamsUpdated: teamUpdates,
  } as const;
}

// Level 4B: sync engine and entry points

/** Runs sync gating, data loading, and the correct tournament sync path for the current context. */
async function runTournamentSyncEngine(args: {
  ctx: ActionCtx;
  context: TournamentContext;
  nowMs: number;
  logPrefix: string;
  bypassCadence: boolean;
}) {
  const hasGolfers =
    args.context.type === "next"
      ? await args.ctx.runQuery(internal.crons.sync.getTournamentHasGolfers, {
          tournamentId: args.context.tournament._id,
        })
      : true;

  const gate = getTournamentSyncGate({
    context: args.context,
    nowMs: args.nowMs,
    bypassCadence: args.bypassCadence,
    hasGolfers,
  });
  if (gate.shouldSkip) {
    console.log(`${args.logPrefix}: skipped (${gate.reason})`, {
      tournamentId: args.context.tournament._id,
      tournamentName: args.context.tournament.name,
      localDay: gate.localDay,
      localHour: gate.localHour,
    });
    return {
      ok: true,
      skipped: true,
      reason: gate.reason,
      tournamentId: args.context.tournament._id,
      tournamentName: args.context.tournament.name,
    } as const;
  }

  if (args.context.type === "next") {
    const stats = await getTournamentStats(args.ctx, args.context, {
      includeTeams: true,
      includeTeamTours: false,
      includeRankings: true,
    });
    if (!stats) {
      console.log(`${args.logPrefix}: skipped (no_active_tournament)`);
      return {
        ok: true,
        skipped: true,
        reason: "no_active_tournament",
      } as const;
    }

    return await syncUpcomingTournament({
      ctx: args.ctx,
      context: args.context,
      stats,
      nowMs: args.nowMs,
      logPrefix: args.logPrefix,
    });
  }

  const stats = await getTournamentStats(args.ctx, args.context, {
    includeTeams: true,
    includeTeamTours: true,
    includeRankings: false,
  });
  if (!stats) {
    console.log(`${args.logPrefix}: skipped (no_active_tournament)`);
    return {
      ok: true,
      skipped: true,
      reason: "no_active_tournament",
    } as const;
  }

  return await syncLiveTournament({
    ctx: args.ctx,
    context: args.context,
    stats,
    nowMs: args.nowMs,
  });
}

/** Cron entry point that discovers the current tournament context and runs the normal sync cadence. */
export const runTournamentSync: ReturnType<typeof internalAction> =
  internalAction({
    handler: async (ctx) => {
      const activeTournamentData = await ctx.runQuery(
        internal.crons.sync.getActiveTournamentSyncContext,
      );
      if (!activeTournamentData.ok) {
        console.log("runTournamentSync: skipped (no_active_tournament)");
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }

      return await runTournamentSyncEngine({
        ctx,
        context: {
          type: activeTournamentData.type,
          tournament: activeTournamentData.tournament,
          course: activeTournamentData.course,
          tier: activeTournamentData.tier,
        },
        nowMs: Date.now(),
        logPrefix: "runTournamentSync",
        bypassCadence: false,
      });
    },
  });

/** Manual backfill entry point that forces a sync for a specific tournament id. */
export const updatePreviousTournament: ReturnType<typeof internalAction> =
  internalAction({
    args: { tournamentId: v.id("tournaments") },
    handler: async (ctx, args) => {
      const activeTournamentData = await ctx.runQuery(
        internal.crons.sync.getTournamentSyncContextById,
        { tournamentId: args.tournamentId },
      );
      if (!activeTournamentData.ok) {
        console.log("updatePreviousTournament: skipped (no_active_tournament)");
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }

      return await runTournamentSyncEngine({
        ctx,
        context: {
          type: activeTournamentData.type,
          tournament: activeTournamentData.tournament,
          course: activeTournamentData.course,
          tier: activeTournamentData.tier,
        },
        nowMs: Date.now(),
        logPrefix: "updatePreviousTournament",
        bypassCadence: true,
      });
    },
  });
