import { internalAction, type ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type {
  DataGolfFieldPlayer,
  DataGolfHistoricalRoundDataResponse,
  DataGolfLiveModelPredictionsResponse,
} from "../types/datagolf";
import {
  isRoundRunningFromLiveStats,
  normalizePlayerNameFromDataGolf,
  parseDataGolfTeeTimeToMs,
} from "../utils/datagolf";
import {
  awardTeamEarnings,
  awardTeamPlayoffPoints,
  buildUsageRateByGolferApiId,
  earliestTimeStr,
  roundToDecimalPlace,
} from "../utils";
import { EnhancedGolfer } from "../types/types";
import { v } from "convex/values";

type TournamentLifecycleStatus = "upcoming" | "active" | "completed";
type TournamentSyncType = "active" | "next" | "recent";
type TournamentContext = {
  type: TournamentSyncType;
  tournament: Doc<"tournaments">;
  course: Doc<"courses">;
  tier: Doc<"tiers">;
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

const UPCOMING_SYNC_INTERVAL_MS = 1000 * 60 * 60 * 4;
const UPCOMING_SYNC_START_HOUR = 6;
const UPCOMING_SYNC_END_HOUR = 21;
const LIVE_SYNC_START_HOUR = 6;
const LIVE_SYNC_END_HOUR = 22;

function getGolferRoundOneTeeTimeMs(golfer: EnhancedGolfer): number | undefined {
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

function getHoleCount(
  thru: string | number | null | undefined,
): number | undefined {
  if (typeof thru === "number" && Number.isFinite(thru)) {
    return thru;
  }

  const raw = String(thru ?? "").trim().toUpperCase();
  if (!raw) {
    return undefined;
  }
  if (raw === "F") {
    return 18;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isTerminalTournamentPosition(
  position: string | null | undefined,
): boolean {
  return ["CUT", "MC", "MDF", "WD", "DQ", "DNS", "DNF"].includes(
    String(position ?? "").trim().toUpperCase(),
  );
}

function getEffectiveTournamentPosition(
  golfer: EnhancedGolfer,
): string | undefined {
  const position =
    golfer.live?.current_pos ??
    golfer.historical?.fin_text ??
    golfer.tournamentGolfer?.position;
  const normalized = String(position ?? "").trim().toUpperCase();

  return normalized || undefined;
}

function isNonRankingTournamentPosition(position: string | undefined): boolean {
  return ["CUT", "WD", "DQ", ""].includes(position ?? "");
}

function isWithdrawnOrDisqualifiedPosition(
  position: string | undefined,
): boolean {
  return position === "WD" || position === "DQ";
}

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

function isWeekendEligibleTeamPosition(position: string | undefined): boolean {
  return !["CUT", "WD", "DQ"].includes(position ?? "");
}

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
      hasTeamCompletedTournamentRound({ golfers: team.golfers, roundNumber: 1 }),
    )
  ) {
    derivedRound = 2;
  }

  if (
    teamRounds.some((round) => round >= 3) &&
    args.teams.every((team) =>
      hasTeamCompletedTournamentRound({ golfers: team.golfers, roundNumber: 2 }),
    )
  ) {
    derivedRound = 3;
  }

  if (
    teamRounds.some((round) => round >= 4) &&
    args.teams.every((team) =>
      hasTeamCompletedTournamentRound({ golfers: team.golfers, roundNumber: 3 }),
    )
  ) {
    derivedRound = 4;
  }

  return Math.max(storedRound, derivedRound);
}

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
  const startedByPlay = args.golfers.some((golfer) => hasGolferStartedPlay(golfer));

  return startedByClock || startedByPlay ? "active" : "upcoming";
}

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

function isHistoricalEventCompleted(
  historicalData: DataGolfHistoricalRoundDataResponse | undefined,
): boolean {
  return (
    historicalData?.event_completed === "true" ||
    historicalData?.event_completed === "1"
  );
}

function shouldIncludeLiveTodayInScore(args: {
  currentRound: number;
  isRoundRunning: boolean;
}): boolean {
  return (
    args.isRoundRunning && args.currentRound >= 1 && args.currentRound <= 4
  );
}

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

function isTeamRoundRunning(golfers: EnhancedGolfer[]): boolean {
  return golfers.some((golfer) => {
    if (getTournamentGolferSyncRound(golfer) >= 5) {
      return false;
    }

    const thru = getHoleCount(golfer.live?.thru);
    return typeof thru === "number" && thru > 0 && thru < 18;
  });
}

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

function isWithinLocalWindow(args: {
  localHour: number;
  startHour: number;
  endHour: number;
}): boolean {
  return args.localHour >= args.startHour && args.localHour < args.endHour;
}

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

async function getTournamentStats(
  ctx: ActionCtx,
  context: TournamentContext,
): Promise<TournamentStats | null> {
  const tournamentStats = await ctx.runAction(
    internal.functions.utils.getAllDataForTournament,
    {
      tournament: {
        _id: context.tournament._id,
        name: context.tournament.name,
        endDate: context.tournament.endDate,
        apiId: context.tournament.apiId,
        seasonId: context.tournament.seasonId,
      },
      tzOffset: context.course.timeZoneOffset ?? -18000000,
    },
  );

  if (!tournamentStats.ok) {
    return null;
  }

  return {
    teams: tournamentStats.teams,
    golfers: tournamentStats.golfers,
    fieldData: tournamentStats.fieldData,
    liveData: tournamentStats.liveData,
    historicalData: tournamentStats.historicalData,
  };
}

async function repairIncompleteTeamRosters(args: {
  ctx: ActionCtx;
  teams: TournamentSyncTeam[];
  golfers: EnhancedGolfer[];
}): Promise<void> {
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

    await args.ctx.runMutation(api.functions.teams.updateTeamRoster, {
      teamId: team._id,
      apiIds: nextApiIds,
    });
  }
}

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
    await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
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

  await repairIncompleteTeamRosters({
    ctx,
    teams: stats.teams,
    golfers: stats.golfers,
  });

  const golferApiIds = new Set(stats.golfers.map((golfer) => golfer.golfer?.apiId));
  const newGolfers = (stats.fieldData.field ?? [])
    .filter((fieldGolfer) => fieldGolfer.dg_id && !golferApiIds.has(fieldGolfer.dg_id))
    .map((fieldGolfer) => {
      const focusGolfer = stats.golfers.find(
        (golfer) => golfer.golfer?.apiId === fieldGolfer.dg_id,
      );
      return {
        dg_id: fieldGolfer.dg_id,
        player_name: normalizePlayerNameFromDataGolf(fieldGolfer.player_name),
        country: fieldGolfer.country,
        world_rank: focusGolfer?.ranking?.owgr_rank ?? undefined,
        dg_skill_estimate:
          focusGolfer?.ranking?.dg_skill_estimate ?? undefined,
        r1_teetime:
          fieldGolfer.teetimes.find((teetime) => teetime.round_num === 1)
            ?.teetime ?? undefined,
        r2_teetime:
          fieldGolfer.teetimes.find((teetime) => teetime.round_num === 2)
            ?.teetime ?? undefined,
      };
    });

  if (newGolfers.length > 0) {
    await ctx.runMutation(internal.functions.golfers.createMissingTournamentGolfers, {
      tournamentId: context.tournament._id,
      golfers: newGolfers,
    });
  }

  await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
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
  } as const;
}

async function syncLiveTournament(args: {
  ctx: ActionCtx;
  context: TournamentContext;
  stats: TournamentStats;
  nowMs: number;
}) {
  const { ctx, context, stats, nowMs } = args;
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
            golfer.live?.current_pos ?? golfer.historical?.fin_text ?? undefined,
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

    await ctx.runMutation(internal.functions.golfers.updateTournamentGolfer, {
      tournamentGolfer: {
        _id: golfer.tournamentGolfer._id,
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
        endHole: golfer.live?.end_hole ?? golfer.tournamentGolfer?.endHole ?? undefined,
        makeCut: golfer.live?.make_cut ?? golfer.tournamentGolfer?.makeCut ?? undefined,
        topTen: golfer.live?.top_10 ?? golfer.tournamentGolfer?.topTen ?? undefined,
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
            : parseDataGolfTeeTimeToMs(
                golfer.tournamentGolfer.roundOneTeeTime as string,
              ) ?? undefined),
        roundTwoTeeTime:
          golfer.field?.teetimes.find((teetime) => teetime.round_num === 2)
            ?.teetime ??
          golfer.historical?.round_2?.teetime ??
          (typeof golfer.tournamentGolfer.roundTwoTeeTime === "number"
            ? golfer.tournamentGolfer.roundTwoTeeTime
            : parseDataGolfTeeTimeToMs(
                golfer.tournamentGolfer.roundTwoTeeTime as string,
              ) ?? undefined),
        roundThreeTeeTime:
          golfer.field?.teetimes.find((teetime) => teetime.round_num === 3)
            ?.teetime ??
          golfer.historical?.round_3?.teetime ??
          (typeof golfer.tournamentGolfer.roundThreeTeeTime === "number"
            ? golfer.tournamentGolfer.roundThreeTeeTime
            : parseDataGolfTeeTimeToMs(
                golfer.tournamentGolfer.roundThreeTeeTime as string,
              ) ?? undefined),
        roundFourTeeTime:
          golfer.field?.teetimes.find((teetime) => teetime.round_num === 4)
            ?.teetime ??
          golfer.historical?.round_4?.teetime ??
          (typeof golfer.tournamentGolfer.roundFourTeeTime === "number"
            ? golfer.tournamentGolfer.roundFourTeeTime
            : parseDataGolfTeeTimeToMs(
                golfer.tournamentGolfer.roundFourTeeTime as string,
              ) ?? undefined),
        usage: usageMap.get(golfer.golfer.apiId ?? -1) ?? 0,
        round: getTournamentGolferSyncRound(golfer),
      },
    });
  }

  const updatedTeams: TournamentSyncTeam[] = [];
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
              : parseDataGolfTeeTimeToMs(
                  golfer.tournamentGolfer?.roundOneTeeTime as string,
                ) ?? undefined),
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
              : parseDataGolfTeeTimeToMs(
                  golfer.tournamentGolfer?.roundTwoTeeTime as string,
                ) ?? undefined),
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
                    : parseDataGolfTeeTimeToMs(
                        golfer.tournamentGolfer?.roundThreeTeeTime as string,
                      ) ?? undefined),
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
                    : parseDataGolfTeeTimeToMs(
                        golfer.tournamentGolfer?.roundFourTeeTime as string,
                      ) ?? undefined),
              )
              .sort((a, b) => (a ?? 0) - (b ?? 0))
              .slice(-5),
          ),
      roundFour,
    });
  }

  for (const team of updatedTeams) {
    const teamsAhead = updatedTeams.filter(
      (updatedTeam) =>
        updatedTeam.tour?._id === team.tour?._id &&
        (updatedTeam.score ?? 0) < (team.score ?? 0),
    ).length;
    const teamsAheadPast = updatedTeams.filter(
      (updatedTeam) =>
        updatedTeam.tour?._id === team.tour?._id &&
        (updatedTeam.score ?? 0) - (updatedTeam.today ?? 0) <
          (team.score ?? 0) - (team.today ?? 0),
    ).length;
    const teamsTied = updatedTeams.filter(
      (updatedTeam) =>
        updatedTeam.tour?._id === team.tour?._id &&
        (updatedTeam.score ?? 0) === (team.score ?? 0),
    ).length;
    const teamsTiedPast = updatedTeams.filter(
      (updatedTeam) =>
        updatedTeam.tour?._id === team.tour?._id &&
        (updatedTeam.score ?? 0) - (updatedTeam.today ?? 0) ===
          (team.score ?? 0) - (team.today ?? 0),
    ).length;

    await ctx.runMutation(api.functions.teams.updateTeam, {
      team: {
        _id: team._id,
        makeCut: team.makeCut,
        score: team.score,
        topTen: team.topTen,
        topFive: team.topFive,
        topThree: team.topThree,
        win: team.win,
        today: team.today,
        thru: team.thru,
        round: team.round,
        roundOneTeeTime: team.roundOneTeeTime,
        roundOne: team.roundOne,
        roundTwoTeeTime: team.roundTwoTeeTime,
        roundTwo: team.roundTwo,
        roundThreeTeeTime: team.roundThreeTeeTime,
        roundThree: team.roundThree,
        roundFourTeeTime: team.roundFourTeeTime,
        roundFour: team.roundFour,
        earnings: awardTeamEarnings(context.tier, teamsAhead, teamsTied),
        points: awardTeamPlayoffPoints(context.tier, teamsAhead, teamsTied),
        position:
          team.position === "CUT"
            ? "CUT"
            : teamsTied > 1
              ? `T${teamsAhead + 1}`
              : `${teamsAhead + 1}`,
        pastPosition:
          teamsTiedPast > 1
            ? `T${teamsAheadPast + 1}`
            : `${teamsAheadPast + 1}`,
      },
    });
  }

  const finalTournamentRound = getTournamentSyncCurrentRound({
    teams: updatedTeams,
    existingRound: context.tournament.currentRound,
  });
  const finalTournamentLivePlay = completionCandidate
    ? false
    : getTournamentSyncLivePlay({
        teams: updatedTeams,
        datagolfLivePlay,
      });
  const finalizationReady =
    completionCandidate &&
    stats.golfers.every((golfer) => getTournamentGolferSyncRound(golfer) >= 5) &&
    updatedTeams.every((team) => (team.round ?? 0) >= 5);
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

  await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
    tournament: {
      _id: context.tournament._id,
      currentRound: finalTournamentRound,
      livePlay: finalTournamentLivePlay,
      leaderboardLastUpdatedAt: nowMs,
      ...lifecycleUpdates,
    },
  });

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
  } as const;
}

async function runTournamentSyncEngine(args: {
  ctx: ActionCtx;
  context: TournamentContext;
  nowMs: number;
  logPrefix: string;
  bypassCadence: boolean;
}) {
  const stats = await getTournamentStats(args.ctx, args.context);
  if (!stats) {
    console.log(`${args.logPrefix}: skipped (no_active_tournament)`);
    return {
      ok: true,
      skipped: true,
      reason: "no_active_tournament",
    } as const;
  }

  const gate = getTournamentSyncGate({
    context: args.context,
    nowMs: args.nowMs,
    bypassCadence: args.bypassCadence,
    hasGolfers: stats.golfers.length > 0,
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
    return await syncUpcomingTournament({
      ctx: args.ctx,
      context: args.context,
      stats,
      nowMs: args.nowMs,
      logPrefix: args.logPrefix,
    });
  }

  return await syncLiveTournament({
    ctx: args.ctx,
    context: args.context,
    stats,
    nowMs: args.nowMs,
  });
}

export const runTournamentSync: ReturnType<typeof internalAction> =
  internalAction({
    handler: async (ctx) => {
      const activeTournamentData = await ctx.runQuery(
        internal.functions.utils.getActiveTournamentData,
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

export const updatePreviousTournament: ReturnType<typeof internalAction> =
  internalAction({
    args: { tournamentId: v.id("tournaments") },
    handler: async (ctx, args) => {
      const activeTournamentData = await ctx.runQuery(
        internal.functions.utils.getTournamentDataById,
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
