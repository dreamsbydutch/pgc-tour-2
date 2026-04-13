import {
  action,
  internalAction,
  internalMutation,
  mutation,
} from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type {
  DataGolfFieldPlayer,
  DataGolfRankedPlayer,
} from "../types/datagolf";
import { EXCLUDED_GOLFER_IDS, GROUP_LIMITS } from "./_constants";
import {
  checkCompatabilityOfEventNames,
  isRoundRunningFromLiveStats,
  normalizePlayerNameFromDataGolf,
  parseDataGolfTeeTimeToMs,
} from "../utils/datagolf";
import {
  awardTeamEarnings,
  awardTeamPlayoffPoints,
  buildUsageRateByGolferApiId,
  earliestTimeStr,
  parsePositionNumber,
  roundToDecimalPlace,
} from "../utils";
import { determineGroupIndex } from "../utils/golfers";
import { EnhancedGolfer } from "../types/types";
import { v } from "convex/values";

type TournamentLifecycleStatus = "upcoming" | "active" | "completed";

type TournamentSyncTeam = Doc<"teams"> & {
  golfers: EnhancedGolfer[];
  tour?: Doc<"tours">;
  tourCard?: Doc<"tourCards">;
};

type TeamTournamentRank = {
  teamsAhead: number;
  teamsTied: number;
  position: string;
};

/**
 * Returns the earliest round-one tee time available for a synced golfer.
 */
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

function getGolferEventEarnings(golfer: EnhancedGolfer): number | undefined {
  const earnings = golfer.historicalEvent?.earnings;
  return typeof earnings === "number" && Number.isFinite(earnings)
    ? earnings
    : undefined;
}

function getTeamGolferEventEarningsTotal(team: TournamentSyncTeam): {
  total: number;
  golferCount: number;
} {
  let total = 0;
  let golferCount = 0;

  for (const golfer of team.golfers) {
    const earnings = getGolferEventEarnings(golfer);
    total += earnings ?? 0;
    golferCount += 1;
  }

  return { total, golferCount };
}

function getTeamTournamentRank(args: {
  team: TournamentSyncTeam;
  teams: TournamentSyncTeam[];
  tournamentCompleted: boolean;
}): TeamTournamentRank {
  const sameTour = (team: TournamentSyncTeam) =>
    team.tour?._id === args.team.tour?._id;
  const teamScore = args.team.score ?? 0;
  const teamsAhead = args.teams.filter(
    (team) => sameTour(team) && (team.score ?? 0) < teamScore,
  ).length;
  const teamsTied = args.teams.filter(
    (team) => sameTour(team) && (team.score ?? 0) === teamScore,
  ).length;

  if (args.team.position === "CUT") {
    return { teamsAhead, teamsTied, position: "CUT" };
  }

  if (!args.tournamentCompleted || teamsAhead !== 0 || teamsTied <= 1) {
    return {
      teamsAhead,
      teamsTied,
      position: teamsTied > 1 ? `T${teamsAhead + 1}` : `${teamsAhead + 1}`,
    };
  }

  const firstPlaceTeams = args.teams.filter(
    (team) => sameTour(team) && (team.score ?? 0) === teamScore,
  );
  const tiebreakRows = firstPlaceTeams.map((team) => ({
    team,
    ...getTeamGolferEventEarningsTotal(team),
  }));

  if (tiebreakRows.some((row) => row.golferCount < 10)) {
    return { teamsAhead, teamsTied, position: `T${teamsAhead + 1}` };
  }

  const highestEarnings = Math.max(...tiebreakRows.map((row) => row.total));
  const winners = tiebreakRows.filter((row) => row.total === highestEarnings);
  if (winners.length !== 1) {
    return { teamsAhead, teamsTied, position: `T${teamsAhead + 1}` };
  }

  if (winners[0].team._id === args.team._id) {
    return { teamsAhead: 0, teamsTied: 1, position: "1" };
  }

  const tiedSecondCount = firstPlaceTeams.length - 1;
  return {
    teamsAhead: 1,
    teamsTied: tiedSecondCount,
    position: tiedSecondCount > 1 ? "T2" : "2",
  };
}

/**
 * Returns the first round-one tee time across a tournament field feed.
 */
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

/**
 * Normalizes live "thru" values into a hole count.
 */
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

/**
 * Treats terminal player states as completed for tournament lifecycle purposes.
 */
function isTerminalTournamentPosition(
  position: string | null | undefined,
): boolean {
  return ["CUT", "MC", "MDF", "WD", "DQ", "DNS", "DNF"].includes(
    String(position ?? "")
      .trim()
      .toUpperCase(),
  );
}

/**
 * Returns the best available tournament position for sync decisions.
 */
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

/**
 * Returns whether the position should be treated like a non-ranking terminal state.
 */
function isNonRankingTournamentPosition(position: string | undefined): boolean {
  return ["CUT", "WD", "DQ", ""].includes(position ?? "");
}

/**
 * Returns whether the golfer withdrew or was disqualified.
 */
function isWithdrawnOrDisqualifiedPosition(
  position: string | undefined,
): boolean {
  return position === "WD" || position === "DQ";
}

/**
 * Returns the stored score for a completed round when available.
 */
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

/**
 * Returns the persisted round value used by tournament sync, including WD/DQ penalties.
 */
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

/**
 * Returns the WD/DQ penalty for the current round when it should be surfaced immediately.
 */
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

/**
 * Returns the live today value used during tournament sync, including WD/DQ current-round penalties.
 */
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

/**
 * Returns the live thru value used during tournament sync, including WD/DQ current-round penalties.
 */
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

/**
 * Returns whether a golfer should participate in team live today/thru windows.
 */
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

/**
 * Returns whether a golfer is still eligible to contribute to a team's weekend score.
 */
function isWeekendEligibleTeamPosition(position: string | undefined): boolean {
  return !["CUT", "WD", "DQ"].includes(position ?? "");
}

/**
 * Returns whether a team is cut from weekend scoring for rounds three and four.
 */
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

/**
 * Returns the golfers that should contribute to a team's live today/thru window.
 */
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

/**
 * Returns the raw team live window mean used for score/today/thru calculations.
 */
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

/**
 * Returns whether a team has finished a round strongly enough to publish its round score.
 */
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

/**
 * Returns the published team round average once that round is complete.
 */
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

/**
 * Returns whether any synced golfer shows evidence that tournament play has started.
 */
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

/**
 * Returns whether a golfer has completed the tournament or reached a terminal state.
 */
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

/**
 * Derives the persisted golfer round as a monotonic state machine.
 */
export function getTournamentGolferSyncRound(golfer: EnhancedGolfer): number {
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

/**
 * Returns whether a golfer has completed the specified tournament round.
 */
export function hasGolferCompletedTournamentRound(args: {
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

/**
 * Derives the persisted team round from the furthest-progressed team golfer.
 */
export function getTournamentTeamSyncRound(args: {
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

/**
 * Returns whether a team has completed the specified tournament round.
 */
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

/**
 * Derives the persisted tournament currentRound from team progression.
 */
export function getTournamentSyncCurrentRound(args: {
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

/**
 * Returns whether any team still has golfers actively playing under thru 18.
 */
export function getTournamentSyncLivePlay(args: {
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

/**
 * Derives a monotonic tournament lifecycle status from tee times and synced scoring state.
 */
function deriveTournamentLifecycleStatus(args: {
  golfers: EnhancedGolfer[];
  nowMs: number;
  existingStatus: Doc<"tournaments">["status"];
  openingTeeTimeMs?: number;
  eventCompleted?: boolean;
}): TournamentLifecycleStatus {
  if (args.existingStatus === "completed") {
    return "completed";
  }

  const completed =
    args.eventCompleted === true ||
    (args.golfers.length > 0 &&
      args.golfers.every((golfer) => hasGolferCompletedTournament(golfer)));
  if (completed) {
    return "completed";
  }

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

/**
 * Returns only the tournament lifecycle fields that have actually changed.
 */
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

/**
 * Fetches the latest DataGolf rankings and applies OWGR/country/name updates into `golfers`.
 *
 * This is an `internalAction` because it needs to call the DataGolf API.
 */
export const updateGolfersWorldRankFromDataGolfInput: ReturnType<
  typeof internalAction
> = internalAction({
  handler: async (ctx) => {
    let rankings: unknown;
    try {
      rankings = await ctx.runAction(
        api.functions.datagolf.fetchDataGolfRankings,
        {},
      );
    } catch (err) {
      return {
        ok: false,
        skipped: false,
        reason: "datagolf_fetch_failed",
        error: err instanceof Error ? err.message : String(err),
      } as const;
    }
    const rankingsList = Array.isArray(
      (rankings as { rankings?: unknown }).rankings,
    )
      ? ((rankings as { rankings: unknown[] })
          .rankings as DataGolfRankedPlayer[])
      : [];
    if (rankingsList.length === 0) {
      return {
        ok: true,
        skipped: true,
        reason: "no_rankings",
        rankingsFetched: 0,
      } as const;
    }
    const result = await ctx.runMutation(
      internal.functions.golfers.applyGolfersWorldRankFromDataGolfInput,
      {
        rankings: rankingsList,
      },
    );

    return {
      ...result,
      rankingsFetched: rankingsList.length,
    } as const;
  },
});
export const updateGolfersWorldRankFromDataGolfInput_Public: ReturnType<
  typeof action
> = action({
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.functions.cronJobs.updateGolfersWorldRankFromDataGolfInput,
      {},
    );
  },
});

/**
 * Creates groups and tournament golfers for the next scheduled tournament.
 *
 * What it does:
 * - Loads the "next" tournament.
 * - Uses DataGolf field updates + rankings to build a ranked field.
 * - Splits the field into groups based on configured group limits.
 * - Inserts tournament golfers/groups via the golfers module.
 * - For playoffs beyond the first event, duplicates golfers/teams from the previous playoff event.
 *
 * Skip behavior:
 * - Returns `{ skipped: true }` when there is no next tournament, the DataGolf event name is missing,
 *   or the event name doesn't match the tournament name.
 */
export const runCreateGroupsForNextTournament: ReturnType<
  typeof internalAction
> = internalAction({
  handler: async (ctx): Promise<unknown> => {
    const activeTournamentData = await ctx.runQuery(
      internal.functions.utils.getActiveTournamentData,
    );
    if (!activeTournamentData.ok) {
      console.log(
        "runCreateGroupsForNextTournament: skipped (no_active_tournament)",
      );
      return {
        ok: true,
        skipped: true,
        reason: "no_active_tournament",
      } as const;
    }
    const {
      tournament,
      playoffTournaments,
      isPlayoff,
      eventIndex,
      type: tournamentType,
    } = activeTournamentData;
    if (tournamentType !== "next") {
      console.log(
        "runCreateGroupsForNextTournament: skipped (no_next_tournament)",
        {
          tournamentId: tournament._id,
          tournamentName: tournament.name,
          tournamentType,
        },
      );
      return {
        ok: true,
        skipped: true,
        reason: "no_next_tournament",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        tournamentType,
      } as const;
    }

    if (isPlayoff && (eventIndex ?? 0) > 1 && playoffTournaments) {
      const createResult = await ctx.runMutation(
        internal.functions.tournaments.duplicateFromPreviousPlayoff,
        {
          currentTournamentId: tournament._id ?? "",
          previousPlayoffTournamentId:
            playoffTournaments[(eventIndex ?? 2) - 2]?._id ?? "",
        },
      );

      return {
        ok: true,
        tournamentId: tournament._id ?? "",
        createGroups: createResult,
      };
    }

    const tournamentForDataGolf = {
      _id: tournament._id,
      name: tournament.name,
      apiId: tournament.apiId,
      seasonId: tournament.seasonId,
    };
    let fieldUpdates: unknown;
    let rankings: unknown;
    try {
      const [fieldResult, rankingsResult] = await Promise.allSettled([
        ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
          tournament: tournamentForDataGolf,
        }),
        ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
      ]);
      if (fieldResult.status === "rejected") {
        throw fieldResult.reason;
      }
      if (rankingsResult.status === "rejected") {
        throw rankingsResult.reason;
      }
      fieldUpdates = fieldResult.value;
      rankings = rankingsResult.value;
    } catch (err) {
      return {
        ok: false,
        skipped: false,
        reason: "datagolf_fetch_failed",
        tournamentId: tournament?._id ?? null,
        error: err instanceof Error ? err.message : String(err),
      } as const;
    }
    const dataGolfEventName = (fieldUpdates as { event_name?: unknown })
      ?.event_name;
    if (typeof dataGolfEventName !== "string" || !dataGolfEventName) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_datagolf_event_name",
        tournamentId: tournament?._id ?? "",
        tournamentName: tournament?.name ?? "",
      } as const;
    }
    const compatible = checkCompatabilityOfEventNames(
      tournament?.name ?? "",
      dataGolfEventName,
    );
    if (!compatible.ok) {
      return {
        ok: true,
        skipped: true,
        reason: "event_name_mismatch",
        tournamentId: tournament?._id ?? "",
        tournamentName: tournament?.name ?? "",
        dataGolfEventName,
        score: compatible.score,
        intersection: compatible.intersection,
        expectedTokens: compatible.expectedTokens,
        actualTokens: compatible.actualTokens,
      } as const;
    }

    const field = Array.isArray((fieldUpdates as { field?: unknown }).field)
      ? ((fieldUpdates as { field: unknown[] }).field as DataGolfFieldPlayer[])
      : [];
    const rankingsList = Array.isArray(
      (rankings as { rankings?: unknown }).rankings,
    )
      ? ((rankings as { rankings: unknown[] })
          .rankings as DataGolfRankedPlayer[])
      : [];
    const byDgId = new Map<number, DataGolfRankedPlayer>();
    for (const r of rankingsList) byDgId.set(r.dg_id, r);
    const processed: (DataGolfFieldPlayer & {
      ranking?: DataGolfRankedPlayer;
    })[] = field
      .filter((g) => !EXCLUDED_GOLFER_IDS.has(g.dg_id))
      .map((g) => ({ ...g, ranking: byDgId.get(g.dg_id) }))
      .sort(
        (a, b) =>
          (b.ranking?.dg_skill_estimate ?? -50) -
          (a.ranking?.dg_skill_estimate ?? -50),
      );

    const groups: (DataGolfFieldPlayer & {
      ranking?: DataGolfRankedPlayer;
    })[][] = [[], [], [], [], []];
    processed.forEach((g, index) => {
      const gi = determineGroupIndex(
        index,
        processed.length,
        groups,
        GROUP_LIMITS,
      );
      groups[gi]!.push(g);
    });

    const createResult = await ctx.runMutation(
      internal.functions.golfers.createTournamentGolfers,
      {
        tournamentId: tournament._id,
        groups: groups.map((group, idx) => ({
          groupNumber: idx + 1,
          golfers: group.map((g) => ({
            dgId: g.dg_id,
            playerName: normalizePlayerNameFromDataGolf(g.player_name),
            country: g.country,
            worldRank: g.ranking?.owgr_rank,
            ...(typeof g.teetimes.find((tt) => tt.round_num === 1)?.teetime ===
            "number"
              ? {
                  r1TeeTime: g.teetimes.find((tt) => tt.round_num === 1)
                    ?.teetime,
                }
              : {}),
            ...(typeof g.teetimes.find((tt) => tt.round_num === 2)?.teetime ===
            "number"
              ? {
                  r2TeeTime: g.teetimes.find((tt) => tt.round_num === 2)
                    ?.teetime,
                }
              : {}),
            skillEstimate: g.ranking?.dg_skill_estimate,
          })),
        })),
      },
    );

    return {
      ok: true,
      tournamentId: tournament?._id ?? "",
      createGroups: createResult,
    };
  },
});
export const runCreateGroupsForNextTournament_Public: ReturnType<
  typeof action
> = action({
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.functions.cronJobs.runCreateGroupsForNextTournament,
      {},
    );
  },
});

/**
 * Recomputes season standings for all tour cards.
 *
 * What it does:
 * - Loads the current season.
 * - Aggregates completed team results into per-tour-card totals (points, earnings, wins, top  tens, cuts).
 * - Assigns positions within each tour (with tie prefixes) and updates playoff qualification flags.
 */
export const recomputeStandings: ReturnType<typeof internalMutation> =
  internalMutation({
    handler: async (ctx) => {
      const currentSeason:
        | { ok: true; season: Doc<"seasons"> }
        | { ok: false } = await ctx.runQuery(
        internal.functions.utils.getCurrentSeason,
      );

      if (!currentSeason.ok) {
        return {
          ok: true,
          skipped: true,
          reason: "no_current_season",
        } as const;
      }
      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_season", (q) =>
          q.eq("seasonId", currentSeason.season._id),
        )
        .collect();
      const tourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) =>
          q.eq("seasonId", currentSeason.season._id as Id<"seasons">),
        )
        .collect();
      if (tourCards.length === 0) {
        return {
          ok: true,
          skipped: true,
          reason: "no_tour_cards",
          seasonId: currentSeason.season._id,
        } as const;
      }
      const calculations = await Promise.all(
        tourCards.map(async (tc) => {
          const teams = await ctx.db
            .query("teams")
            .withIndex("by_tour_card", (q) => q.eq("tourCardId", tc._id))
            .collect();

          const completed = teams.filter(
            (t) =>
              tournaments.find((tr) => tr._id === t.tournamentId)?.status ===
              "completed",
          );
          const points = completed.reduce(
            (sum, t) => sum + Math.round(t.points ?? 0),
            0,
          );
          const earnings = completed.reduce(
            (sum, t) => sum + (t.earnings ?? 0),
            0,
          );

          return {
            tourCardId: tc._id,
            tourId: tc.tourId,
            win: completed.filter((t) => {
              const posNum = parsePositionNumber(t.position ?? null);
              return posNum !== null && posNum === 1;
            }).length,
            topTen: completed.filter((t) => {
              const posNum = parsePositionNumber(t.position ?? null);
              return posNum !== null && posNum <= 10;
            }).length,
            madeCut: completed.filter((t) => t.position !== "CUT").length,
            appearances: completed.length,
            points: Math.round(points),
            earnings: Math.round(earnings),
            pastPoints: Math.round(
              points - (completed[completed.length - 1]?.points ?? 0),
            ),
            pastEarnings: Math.round(
              earnings - (completed[completed.length - 1]?.earnings ?? 0),
            ),
            totalPoints: Math.round(
              teams.reduce((sum, t) => sum + (t.points ?? 0), 0),
            ),
            totalEarnings: Math.round(
              teams.reduce((sum, t) => sum + Math.round(t.earnings ?? 0), 0),
            ),
          };
        }),
      );

      const byTour = new Map<Id<"tours">, typeof calculations>();
      for (const calc of calculations) {
        const list = byTour.get(calc.tourId) ?? [];
        list.push(calc);
        byTour.set(calc.tourId, list);
      }

      let updated = 0;

      for (const list of byTour.values()) {
        const tour = await ctx.db.get(list[0].tourId);
        if (!tour) continue;
        for (const calc of list) {
          const samePointsCount = list.filter(
            (a) => a.points === calc.points,
          ).length;
          const betterPointsCount = list.filter(
            (a) => a.points > calc.points,
          ).length;
          const position = `${samePointsCount > 1 ? "T" : ""}${betterPointsCount + 1}`;

          const playoff =
            betterPointsCount < tour.playoffSpots[0]
              ? 1
              : betterPointsCount < tour.playoffSpots[1] + tour.playoffSpots[0]
                ? 2
                : 0;

          await ctx.db.patch(calc.tourCardId, {
            points: calc.points,
            earnings: calc.earnings,
            wins: calc.win,
            topTen: calc.topTen,
            madeCut: calc.madeCut,
            appearances: calc.appearances,
            currentPosition: position,
            playoff,
            updatedAt: Date.now(),
          });

          updated += 1;
        }
      }

      return {
        ok: true,
        skipped: false,
        seasonId: currentSeason.season._id,
        tourCardsUpdated: updated,
      } as const;
    },
  });
export const recomputeStandings_Public: ReturnType<typeof mutation> = mutation({
  handler: async (ctx) => {
    return await ctx.runMutation(
      internal.functions.cronJobs.recomputeStandings,
      {},
    );
  },
});

export const runTournamentSync: ReturnType<typeof internalAction> =
  internalAction({
    handler: async (ctx) => {
      const now = new Date();
      if (now.getHours() <= 10 && now.getHours() >= 2) {
        console.log("runTournamentSync: skipped (outside_of_time_window)", {
          currentHour: now.getHours(),
        });
        return {
          ok: true,
          skipped: true,
          reason: "outside_of_time_window",
          currentHour: now.getHours(),
        } as const;
      }
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
      const tournamentStats = await ctx.runAction(
        internal.functions.utils.getAllDataForTournament,
        {
          tournament: {
            _id: activeTournamentData.tournament._id,
            name: activeTournamentData.tournament.name,
            endDate: activeTournamentData.tournament.endDate,
            apiId: activeTournamentData.tournament.apiId,
            seasonId: activeTournamentData.tournament.seasonId,
          },
          tzOffset: activeTournamentData.course.timeZoneOffset ?? -18000000,
        },
      );
      if (!tournamentStats.ok) {
        console.log("runTournamentSync: skipped (no_active_tournament)");
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }

      const {
        tournament,
        course,
        tier,
        type: tournamentType,
      } = activeTournamentData;
      const { teams, golfers, fieldData, liveData, historicalData } =
        tournamentStats;

      if (tournamentType === "recent") {
        console.log("runTournamentSync: skipped (recent_tournament)", {
          tournamentId: tournament._id,
          tournamentName: tournament.name,
        });
        return {
          ok: true,
          skipped: true,
          reason: "recent_tournament",
          tournamentId: tournament._id,
          tournamentName: tournament.name,
        } as const;
      }
      for (const t of teams) {
        if (t.golfers?.length < 10) {
          const groupCounts = [
            {
              group: 1,
              count:
                t.golfers?.filter((g) => g.tournamentGolfer?.group === 1)
                  .length ?? 0,
            },
            {
              group: 2,
              count:
                t.golfers?.filter((g) => g.tournamentGolfer?.group === 2)
                  .length ?? 0,
            },
            {
              group: 3,
              count:
                t.golfers?.filter((g) => g.tournamentGolfer?.group === 3)
                  .length ?? 0,
            },
            {
              group: 4,
              count:
                t.golfers?.filter((g) => g.tournamentGolfer?.group === 4)
                  .length ?? 0,
            },
            {
              group: 5,
              count:
                t.golfers?.filter((g) => g.tournamentGolfer?.group === 5)
                  .length ?? 0,
            },
          ];

          for (const { group, count } of groupCounts) {
            if (count < 2) {
              const availableGolfers = golfers
                .filter(
                  (g) =>
                    g.tournamentGolfer?.group === group &&
                    g.golfer?.apiId &&
                    !t.golfers?.some(
                      (tg) => tg.golfer?.apiId === g.golfer?.apiId,
                    ),
                )
                .sort((a, b) => {
                  const aRank =
                    a.ranking?.owgr_rank ?? Number.POSITIVE_INFINITY;
                  const bRank =
                    b.ranking?.owgr_rank ?? Number.POSITIVE_INFINITY;
                  return aRank - bRank;
                });
              if (count === 2) {
                await ctx.runMutation(api.functions.teams.updateTeamRoster, {
                  teamId: t._id,
                  apiIds: [
                    ...t.golfers.map((g) => g.golfer?.apiId ?? -1),
                    availableGolfers[0].golfer?.apiId ?? -1,
                    availableGolfers[1].golfer?.apiId ?? -1,
                  ],
                });
              } else {
                await ctx.runMutation(api.functions.teams.updateTeamRoster, {
                  teamId: t._id,
                  apiIds: [
                    ...t.golfers.map((g) => g.golfer?.apiId ?? -1),
                    availableGolfers[0].golfer?.apiId ?? -1,
                  ],
                });
              }
            }
          }
        }
      }
      if (tournamentType === "next") {
        const openingTeeTime =
          getFieldRoundOneTeeTimeMs(fieldData.field) ??
          earliestTimeStr(
            golfers.map((golfer) => getGolferRoundOneTeeTimeMs(golfer)),
          ) ??
          tournament.startDate;
        const nextTournamentStatus = deriveTournamentLifecycleStatus({
          golfers,
          nowMs: now.getTime(),
          existingStatus: tournament.status,
          openingTeeTimeMs: openingTeeTime,
          eventCompleted:
            historicalData?.event_completed === "true" ||
            historicalData?.event_completed === "1",
        });
        const lifecycleUpdates = getChangedTournamentLifecycleFields({
          tournament,
          startDate: openingTeeTime,
          status: nextTournamentStatus,
        });
        if (lifecycleUpdates) {
          await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
            tournament: {
              _id: tournament._id,
              ...lifecycleUpdates,
            },
          });
        }
        if (
          Math.abs(openingTeeTime - now.getTime()) >
          1000 * 60 * 60 * 24 * 6
        ) {
          console.log(
            "runTournamentSync: skipped (next_tournament_not_starting_soon)",
            {
              tournamentId: tournament._id,
              tournamentName: tournament.name,
              startDate: openingTeeTime,
            },
          );
          return {
            ok: true,
            skipped: true,
            reason: "next_tournament_not_starting_soon",
            tournamentId: tournament._id,
            tournamentName: tournament.name,
          } as const;
        }
        if (nextTournamentStatus === "active") {
          console.log(
            "runTournamentSync: skipped (next_tournament_toggled_to_active)",
            {
              tournamentId: tournament._id,
              tournamentName: tournament.name,
              startDate: openingTeeTime,
            },
          );
          await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
            tournament: {
              _id: tournament._id,
              status: "active",
              startDate: openingTeeTime,
            },
          });
          return {
            ok: true,
            skipped: true,
            reason: "next_tournament_toggled_to_active",
            tournamentId: tournament._id,
            tournamentName: tournament.name,
          } as const;
        }
        if (golfers.length > 0) {
          const golferApiIds = new Set(golfers.map((g) => g.golfer?.apiId));
          const newGolfers = fieldData.field
            .filter((fg) => fg.dg_id && !golferApiIds.has(fg.dg_id))
            .map((fg) => {
              const focusGolfer = golfers.find(
                (g) => g.golfer?.apiId === fg.dg_id,
              );
              return {
                dg_id: fg.dg_id!,
                player_name: normalizePlayerNameFromDataGolf(fg.player_name),
                country: fg.country,
                world_rank: focusGolfer?.ranking?.owgr_rank ?? undefined,
                dg_skill_estimate:
                  focusGolfer?.ranking?.dg_skill_estimate ?? undefined,
                r1_teetime:
                  fg.teetimes.find((tt) => tt.round_num === 1)?.teetime ??
                  undefined,
                r2_teetime:
                  fg.teetimes.find((tt) => tt.round_num === 2)?.teetime ??
                  undefined,
              };
            });
          if (newGolfers.length > 0) {
            await ctx.runMutation(
              internal.functions.golfers.createMissingTournamentGolfers,
              { tournamentId: tournament._id, golfers: newGolfers },
            );
          }
          return {
            ok: true,
            skipped: true,
            reason: "next_tournament_already_has_golfers",
            tournamentId: tournament._id,
            tournamentName: tournament.name,
            golfersCount: golfers.length,
          } as const;
        }
        return {
          ok: true,
          skipped: false,
          reason: "pre_tournament_completed",
          tournamentId: tournament._id,
          tournamentName: tournament.name,
          golfersCreated: golfers.length,
        };
      }
      let currentRound = liveData.info
        ? liveData.info.current_round
        : historicalData?.event_completed
          ? 5
          : 0;
      let isRoundRunning = liveData.info
        ? isRoundRunningFromLiveStats(
            golfers.map((g) => ({
              current_pos:
                g.live?.current_pos ?? g.historical?.fin_text ?? undefined,
              thru: parseFloat(g.live?.thru ?? ""),
            })),
          )
        : false;
      const firstTeeTime =
        earliestTimeStr(
          golfers.map((golfer) => getGolferRoundOneTeeTimeMs(golfer)),
        ) ?? tournament.startDate;
      const tournamentStatus = deriveTournamentLifecycleStatus({
        golfers,
        nowMs: now.getTime(),
        existingStatus: tournament.status,
        openingTeeTimeMs: firstTeeTime,
        eventCompleted:
          historicalData?.event_completed === "true" ||
          historicalData?.event_completed === "1",
      });
      const lifecycleUpdates = getChangedTournamentLifecycleFields({
        tournament,
        startDate: firstTeeTime,
        status: tournamentStatus,
      });
      const tournamentCurrentRound = getTournamentSyncCurrentRound({
        teams,
        existingRound: tournament.currentRound,
      });
      const tournamentLivePlay = getTournamentSyncLivePlay({
        teams,
        datagolfLivePlay: isRoundRunning,
      });
      await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
        tournament: {
          _id: tournament._id,
          currentRound: tournamentCurrentRound,
          livePlay: tournamentLivePlay,
          ...lifecycleUpdates,
        },
      });
      const usageMap = buildUsageRateByGolferApiId({ teams });

      for (const g of golfers) {
        if (g.golfer?._id && g.tournamentGolfer?._id) {
          const golferPosition = getEffectiveTournamentPosition(g);
          const roundOneScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 1,
            currentRound,
            isRoundRunning,
            coursePar: course.par,
          });
          const roundTwoScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 2,
            currentRound,
            isRoundRunning,
            coursePar: course.par,
          });
          const roundThreeScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 3,
            currentRound,
            isRoundRunning,
            coursePar: course.par,
          });
          const roundFourScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 4,
            currentRound,
            isRoundRunning,
            coursePar: course.par,
          });
          const betterGolfers = golfers.filter((og) => {
            const otherPosition = getEffectiveTournamentPosition(og);
            return (
              (isNonRankingTournamentPosition(otherPosition)
                ? 999
                : (og.live?.current_score ?? 0)) <
              (isNonRankingTournamentPosition(golferPosition)
                ? 999
                : (g.live?.current_score ?? 0))
            );
          }).length;
          const betterGolfersPast = golfers.filter((og) => {
            const otherPosition = getEffectiveTournamentPosition(og);
            return (
              (isNonRankingTournamentPosition(otherPosition)
                ? 999
                : (og.live?.current_score ?? 0) - (og.live?.today ?? 0)) <
              (isNonRankingTournamentPosition(golferPosition)
                ? 999
                : (g.live?.current_score ?? 0) - (g.live?.today ?? 0))
            );
          }).length;
          const tiedGolfers = golfers.filter((og) => {
            const otherPosition = getEffectiveTournamentPosition(og);
            return (
              (isNonRankingTournamentPosition(otherPosition)
                ? 999
                : (og.live?.current_score ?? 0)) ===
              (isNonRankingTournamentPosition(golferPosition)
                ? 999
                : (g.live?.current_score ?? 0))
            );
          }).length;
          await ctx.runMutation(
            internal.functions.golfers.updateTournamentGolfer,
            {
              tournamentGolfer: {
                _id: g.tournamentGolfer._id,
                tournamentId: tournament._id,
                golferId: g.golfer._id,
                position: isNonRankingTournamentPosition(golferPosition)
                  ? golferPosition
                  : tiedGolfers > 1
                    ? `T${betterGolfers + 1}`
                    : `${betterGolfers + 1}`,
                posChange: betterGolfersPast - betterGolfers,
                score:
                  g.live?.current_score ??
                  (g.historical
                    ? roundToDecimalPlace(
                        (g.historical.round_1?.score ?? 0) -
                          (g.historical.round_1?.course_par ?? 0) +
                          ((g.historical.round_2?.score ?? 0) -
                            (g.historical.round_2?.course_par ?? 0)) +
                          ((g.historical.round_3?.score ?? 0) -
                            (g.historical.round_3?.course_par ?? 0)) +
                          ((g.historical.round_4?.score ?? 0) -
                            (g.historical.round_4?.course_par ?? 0)),
                      )
                    : g.tournamentGolfer.score
                      ? roundToDecimalPlace(g.tournamentGolfer.score)
                      : undefined),
                endHole:
                  g.live?.end_hole ?? g.tournamentGolfer?.endHole ?? undefined,
                makeCut:
                  g.live?.make_cut ?? g.tournamentGolfer?.makeCut ?? undefined,
                topTen:
                  g.live?.top_10 ?? g.tournamentGolfer?.topTen ?? undefined,
                win: g.live?.win ?? g.tournamentGolfer?.win ?? undefined,
                today: getTournamentTodayValue({
                  golfer: g,
                  currentRound,
                  isRoundRunning,
                  coursePar: course.par,
                }),
                thru: getTournamentThruValue({
                  golfer: g,
                  currentRound,
                  isRoundRunning,
                  coursePar: course.par,
                }),
                roundOne: roundOneScore,
                roundTwo: roundTwoScore,
                roundThree: roundThreeScore,
                roundFour: roundFourScore,
                roundOneTeeTime:
                  g.field?.teetimes.find(
                    (tt: {
                      course_code: string;
                      course_name: string;
                      course_num: number;
                      round_num: number;
                      start_hole: number;
                      teetime: number | undefined;
                      wave: "early" | "late";
                    }) => tt.round_num === 1,
                  )?.teetime ??
                  (g.historical?.round_1?.teetime
                    ? g.historical?.round_1?.teetime
                    : typeof g.tournamentGolfer?.roundOneTeeTime === "number"
                      ? g.tournamentGolfer?.roundOneTeeTime
                      : (parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundOneTeeTime as string,
                        ) ?? undefined)),
                roundTwoTeeTime:
                  g.field?.teetimes.find(
                    (tt: {
                      course_code: string;
                      course_name: string;
                      course_num: number;
                      round_num: number;
                      start_hole: number;
                      teetime: number | undefined;
                      wave: "early" | "late";
                    }) => tt.round_num === 2,
                  )?.teetime ??
                  (g.historical?.round_2?.teetime
                    ? g.historical?.round_2?.teetime
                    : typeof g.tournamentGolfer?.roundTwoTeeTime === "number"
                      ? g.tournamentGolfer?.roundTwoTeeTime
                      : (parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundTwoTeeTime as string,
                        ) ?? undefined)),
                roundThreeTeeTime:
                  g.field?.teetimes.find(
                    (tt: {
                      course_code: string;
                      course_name: string;
                      course_num: number;
                      round_num: number;
                      start_hole: number;
                      teetime: number | undefined;
                      wave: "early" | "late";
                    }) => tt.round_num === 3,
                  )?.teetime ??
                  (g.historical?.round_3?.teetime
                    ? g.historical?.round_3?.teetime
                    : typeof g.tournamentGolfer?.roundThreeTeeTime === "number"
                      ? g.tournamentGolfer?.roundThreeTeeTime
                      : (parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundThreeTeeTime as string,
                        ) ?? undefined)),
                roundFourTeeTime:
                  g.field?.teetimes.find(
                    (tt: {
                      course_code: string;
                      course_name: string;
                      course_num: number;
                      round_num: number;
                      start_hole: number;
                      teetime: number | undefined;
                      wave: "early" | "late";
                    }) => tt.round_num === 4,
                  )?.teetime ??
                  (g.historical?.round_4?.teetime
                    ? g.historical?.round_4?.teetime
                    : typeof g.tournamentGolfer?.roundFourTeeTime === "number"
                      ? g.tournamentGolfer?.roundFourTeeTime
                      : (parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundFourTeeTime as string,
                        ) ?? undefined)),
                usage: usageMap.get(g.golfer?.apiId ?? -1) ?? 0,
                round: getTournamentGolferSyncRound(g),
              },
            },
          );
        }
      }
      const updatedTeams: TournamentSyncTeam[] = [];
      for (const t of teams) {
        currentRound = getTournamentTeamSyncRound({
          golfers: t.golfers,
          existingRound: t.round,
        });
        isRoundRunning =
          t.golfers.filter(
            (g) =>
              !(
                g.live?.thru === "F" ||
                g.live?.thru === "18" ||
                g.live?.thru === "0"
              ),
          ).length > 0;
        const roundOne = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 1,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
        });
        const roundTwo = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 2,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
        });
        const roundThree = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 3,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
        });
        const roundFour = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 4,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
        });
        const teamWeekendCut = isTeamWeekendCut({
          golfers: t.golfers,
          currentRound,
        });
        const teamLiveWindowGolfers = getTeamLiveWindowGolfers({
          golfers: t.golfers,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
        });
        const teamLiveTodayMean = getTeamLiveWindowMean({
          golfers: teamLiveWindowGolfers,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
          metric: "today",
        });
        const teamLiveThruMean = getTeamLiveWindowMean({
          golfers: teamLiveWindowGolfers,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
          metric: "thru",
        });

        updatedTeams.push({
          ...t,
          position: teamWeekendCut ? "CUT" : t.position,
          score: roundToDecimalPlace(
            (roundOne && roundOne > 0 ? roundOne - course.par : 0) +
              (roundTwo && roundTwo > 0 ? roundTwo - course.par : 0) +
              (roundThree && roundThree > 0 ? roundThree - course.par : 0) +
              (roundFour && roundFour > 0 ? roundFour - course.par : 0) +
              (isRoundRunning ? (teamLiveTodayMean ?? 0) : 0),
            1,
          ),
          today:
            typeof teamLiveTodayMean === "number"
              ? roundToDecimalPlace(teamLiveTodayMean, 1)
              : undefined,
          thru:
            typeof teamLiveThruMean === "number"
              ? roundToDecimalPlace(teamLiveThruMean, 1)
              : undefined,
          round: currentRound,
          roundOneTeeTime: earliestTimeStr(
            t.golfers.map(
              (g) =>
                g.field?.teetimes.find(
                  (tt: {
                    course_code: string;
                    course_name: string;
                    course_num: number;
                    round_num: number;
                    start_hole: number;
                    teetime: number | undefined;
                    wave: "early" | "late";
                  }) => tt.round_num === 1,
                )?.teetime ??
                (g.historical?.round_1?.teetime
                  ? g.historical?.round_1?.teetime
                  : ((typeof g.tournamentGolfer?.roundOneTeeTime === "number"
                      ? g.tournamentGolfer.roundOneTeeTime
                      : parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundOneTeeTime as string,
                        )) ?? undefined)),
            ),
          ),
          roundOne,
          roundTwoTeeTime: earliestTimeStr(
            t.golfers.map(
              (g) =>
                g.field?.teetimes.find(
                  (tt: {
                    course_code: string;
                    course_name: string;
                    course_num: number;
                    round_num: number;
                    start_hole: number;
                    teetime: number | undefined;
                    wave: "early" | "late";
                  }) => tt.round_num === 2,
                )?.teetime ??
                (g.historical?.round_2?.teetime
                  ? g.historical?.round_2?.teetime
                  : ((typeof g.tournamentGolfer?.roundTwoTeeTime === "number"
                      ? g.tournamentGolfer.roundTwoTeeTime
                      : parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundTwoTeeTime as string,
                        )) ?? undefined)),
            ),
          ),
          roundTwo,
          roundThreeTeeTime: teamWeekendCut
            ? undefined
            : earliestTimeStr(
                t.golfers
                  .map(
                    (g) =>
                      g.field?.teetimes.find(
                        (tt: {
                          course_code: string;
                          course_name: string;
                          course_num: number;
                          round_num: number;
                          start_hole: number;
                          teetime: number | undefined;
                          wave: "early" | "late";
                        }) => tt.round_num === 3,
                      )?.teetime ??
                      (g.historical?.round_3?.teetime
                        ? g.historical?.round_3?.teetime
                        : ((typeof g.tournamentGolfer?.roundThreeTeeTime ===
                          "number"
                            ? g.tournamentGolfer.roundThreeTeeTime
                            : parseDataGolfTeeTimeToMs(
                                g.tournamentGolfer?.roundThreeTeeTime as string,
                              )) ?? undefined)),
                  )
                  .sort((a, b) => (a ?? 0) - (b ?? 0))
                  .slice(-5),
              ),
          roundThree,
          roundFourTeeTime: teamWeekendCut
            ? undefined
            : earliestTimeStr(
                t.golfers
                  .map(
                    (g) =>
                      g.field?.teetimes.find(
                        (tt: {
                          course_code: string;
                          course_name: string;
                          course_num: number;
                          round_num: number;
                          start_hole: number;
                          teetime: number | undefined;
                          wave: "early" | "late";
                        }) => tt.round_num === 4,
                      )?.teetime ??
                      (g.historical?.round_4?.teetime
                        ? g.historical?.round_4?.teetime
                        : ((typeof g.tournamentGolfer?.roundFourTeeTime ===
                          "number"
                            ? g.tournamentGolfer.roundFourTeeTime
                            : parseDataGolfTeeTimeToMs(
                                g.tournamentGolfer?.roundFourTeeTime as string,
                              )) ?? undefined)),
                  )
                  .sort((a, b) => (a ?? 0) - (b ?? 0))
                  .slice(-5),
              ),
          roundFour,
        });
      }
      for (const t of updatedTeams) {
        if (t._id) {
          const teamsAheadPast = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id &&
              (ut.score ?? 0) - (ut.today ?? 0) <
                (t.score ?? 0) - (t.today ?? 0),
          ).length;
          const teamsTiedPast = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id &&
              (ut.score ?? 0) - (ut.today ?? 0) ===
                (t.score ?? 0) - (t.today ?? 0),
          ).length;
          const teamRank = getTeamTournamentRank({
            team: t,
            teams: updatedTeams,
            tournamentCompleted: tournamentStatus === "completed",
          });
          await ctx.runMutation(api.functions.teams.updateTeam, {
            team: {
              _id: t._id,
              makeCut: t.makeCut,
              score: t.score,
              topTen: t.topTen,
              topFive: t.topFive,
              topThree: t.topThree,
              win: t.win,
              today: t.today,
              thru: t.thru,
              round: t.round,
              roundOneTeeTime: t.roundOneTeeTime,
              roundOne: t.roundOne,
              roundTwoTeeTime: t.roundTwoTeeTime,
              roundTwo: t.roundTwo,
              roundThreeTeeTime: t.roundThreeTeeTime,
              roundThree: t.roundThree,
              roundFourTeeTime: t.roundFourTeeTime,
              roundFour: t.roundFour,
              earnings: awardTeamEarnings(
                tier,
                teamRank.teamsAhead,
                teamRank.teamsTied,
              ),
              points: awardTeamPlayoffPoints(
                tier,
                teamRank.teamsAhead,
                teamRank.teamsTied,
              ),
              position: teamRank.position,
              pastPosition:
                teamsTiedPast > 1
                  ? `T${teamsAheadPast + 1}`
                  : `${teamsAheadPast + 1}`,
            },
          });
        }
      }

      return {
        ok: true,
        skipped: false,
        reason: "completed update",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        currentRound: tournament.currentRound,
        livePlay: tournament.livePlay,
        status: tournament.status,
      };
    },
  });
export const runTournamentSync_Public: ReturnType<typeof action> = action({
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.functions.cronJobs.runTournamentSync,
      {},
    );
  },
});

export const updatePreviousTournament: ReturnType<typeof internalAction> =
  internalAction({
    args: { tournamentId: v.id("tournaments") },
    handler: async (ctx, args) => {
      const now = new Date();
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
      const tournamentStats = await ctx.runAction(
        internal.functions.utils.getAllDataForTournament,
        {
          tournament: {
            _id: activeTournamentData.tournament._id,
            name: activeTournamentData.tournament.name,
            endDate: activeTournamentData.tournament.endDate,
            apiId: activeTournamentData.tournament.apiId,
            seasonId: activeTournamentData.tournament.seasonId,
          },
          tzOffset: activeTournamentData.course.timeZoneOffset ?? -18000000,
        },
      );
      if (!tournamentStats.ok) {
        console.log("updatePreviousTournament: skipped (no_active_tournament)");
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }

      const {
        tournament,
        course,
        tier,
        type: tournamentType,
      } = activeTournamentData;
      const { teams, golfers, fieldData, liveData, historicalData } =
        tournamentStats;

      for (const t of teams) {
        if (t.golfers?.length < 10) {
          const groupCounts = [
            {
              group: 1,
              count:
                t.golfers?.filter((g) => g.tournamentGolfer?.group === 1)
                  .length ?? 0,
            },
            {
              group: 2,
              count:
                t.golfers?.filter((g) => g.tournamentGolfer?.group === 2)
                  .length ?? 0,
            },
            {
              group: 3,
              count:
                t.golfers?.filter((g) => g.tournamentGolfer?.group === 3)
                  .length ?? 0,
            },
            {
              group: 4,
              count:
                t.golfers?.filter((g) => g.tournamentGolfer?.group === 4)
                  .length ?? 0,
            },
            {
              group: 5,
              count:
                t.golfers?.filter((g) => g.tournamentGolfer?.group === 5)
                  .length ?? 0,
            },
          ];

          for (const { group, count } of groupCounts) {
            if (count < 2) {
              const availableGolfers = golfers
                .filter(
                  (g) =>
                    g.tournamentGolfer?.group === group &&
                    g.golfer?.apiId &&
                    !t.golfers?.some(
                      (tg) => tg.golfer?.apiId === g.golfer?.apiId,
                    ),
                )
                .sort((a, b) => {
                  const aRank =
                    a.ranking?.owgr_rank ?? Number.POSITIVE_INFINITY;
                  const bRank =
                    b.ranking?.owgr_rank ?? Number.POSITIVE_INFINITY;
                  return aRank - bRank;
                });
              if (count === 2) {
                await ctx.runMutation(api.functions.teams.updateTeamRoster, {
                  teamId: t._id,
                  apiIds: [
                    ...t.golfers.map((g) => g.golfer?.apiId ?? -1),
                    availableGolfers[0].golfer?.apiId ?? -1,
                    availableGolfers[1].golfer?.apiId ?? -1,
                  ],
                });
              } else {
                await ctx.runMutation(api.functions.teams.updateTeamRoster, {
                  teamId: t._id,
                  apiIds: [
                    ...t.golfers.map((g) => g.golfer?.apiId ?? -1),
                    availableGolfers[0].golfer?.apiId ?? -1,
                  ],
                });
              }
            }
          }
        }
      }
      if (tournamentType === "next") {
        const openingTeeTime =
          getFieldRoundOneTeeTimeMs(fieldData.field) ??
          earliestTimeStr(
            golfers.map((golfer) => getGolferRoundOneTeeTimeMs(golfer)),
          ) ??
          tournament.startDate;
        const nextTournamentStatus = deriveTournamentLifecycleStatus({
          golfers,
          nowMs: now.getTime(),
          existingStatus: tournament.status,
          openingTeeTimeMs: openingTeeTime,
          eventCompleted:
            historicalData?.event_completed === "true" ||
            historicalData?.event_completed === "1",
        });
        const lifecycleUpdates = getChangedTournamentLifecycleFields({
          tournament,
          startDate: openingTeeTime,
          status: nextTournamentStatus,
        });
        if (lifecycleUpdates) {
          await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
            tournament: {
              _id: tournament._id,
              ...lifecycleUpdates,
            },
          });
        }
        if (
          Math.abs(openingTeeTime - now.getTime()) >
          1000 * 60 * 60 * 24 * 6
        ) {
          console.log(
            "runTournamentSync: skipped (next_tournament_not_starting_soon)",
            {
              tournamentId: tournament._id,
              tournamentName: tournament.name,
              startDate: openingTeeTime,
            },
          );
          return {
            ok: true,
            skipped: true,
            reason: "next_tournament_not_starting_soon",
            tournamentId: tournament._id,
            tournamentName: tournament.name,
          } as const;
        }
        if (nextTournamentStatus === "active") {
          console.log(
            "runTournamentSync: skipped (next_tournament_toggled_to_active)",
            {
              tournamentId: tournament._id,
              tournamentName: tournament.name,
              startDate: openingTeeTime,
            },
          );
          await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
            tournament: {
              _id: tournament._id,
              status: "active",
              startDate: openingTeeTime,
            },
          });
          return {
            ok: true,
            skipped: true,
            reason: "next_tournament_toggled_to_active",
            tournamentId: tournament._id,
            tournamentName: tournament.name,
          } as const;
        }
        if (golfers.length > 0) {
          const golferApiIds = new Set(golfers.map((g) => g.golfer?.apiId));
          const newGolfers = fieldData.field
            .filter((fg) => fg.dg_id && !golferApiIds.has(fg.dg_id))
            .map((fg) => {
              const focusGolfer = golfers.find(
                (g) => g.golfer?.apiId === fg.dg_id,
              );
              return {
                dg_id: fg.dg_id!,
                player_name: normalizePlayerNameFromDataGolf(fg.player_name),
                country: fg.country,
                world_rank: focusGolfer?.ranking?.owgr_rank ?? undefined,
                dg_skill_estimate:
                  focusGolfer?.ranking?.dg_skill_estimate ?? undefined,
                r1_teetime:
                  fg.teetimes.find((tt) => tt.round_num === 1)?.teetime ??
                  undefined,
                r2_teetime:
                  fg.teetimes.find((tt) => tt.round_num === 2)?.teetime ??
                  undefined,
              };
            });
          if (newGolfers.length > 0) {
            await ctx.runMutation(
              internal.functions.golfers.createMissingTournamentGolfers,
              { tournamentId: tournament._id, golfers: newGolfers },
            );
          }
          return {
            ok: true,
            skipped: true,
            reason: "next_tournament_already_has_golfers",
            tournamentId: tournament._id,
            tournamentName: tournament.name,
            golfersCount: golfers.length,
          } as const;
        }
        return {
          ok: true,
          skipped: false,
          reason: "pre_tournament_completed",
          tournamentId: tournament._id,
          tournamentName: tournament.name,
          golfersCreated: golfers.length,
        };
      }
      let currentRound = liveData.info
        ? liveData.info.current_round
        : historicalData?.event_completed
          ? 5
          : 0;
      let isRoundRunning = liveData.info
        ? isRoundRunningFromLiveStats(
            golfers.map((g) => ({
              current_pos:
                g.live?.current_pos ?? g.historical?.fin_text ?? undefined,
              thru: parseFloat(g.live?.thru ?? ""),
            })),
          )
        : false;
      const firstTeeTime =
        earliestTimeStr(
          golfers.map((golfer) => getGolferRoundOneTeeTimeMs(golfer)),
        ) ?? tournament.startDate;
      const tournamentStatus = deriveTournamentLifecycleStatus({
        golfers,
        nowMs: now.getTime(),
        existingStatus: tournament.status,
        openingTeeTimeMs: firstTeeTime,
        eventCompleted:
          historicalData?.event_completed === "true" ||
          historicalData?.event_completed === "1",
      });
      const lifecycleUpdates = getChangedTournamentLifecycleFields({
        tournament,
        startDate: firstTeeTime,
        status: tournamentStatus,
      });
      const tournamentCurrentRound = getTournamentSyncCurrentRound({
        teams,
        existingRound: tournament.currentRound,
      });
      const tournamentLivePlay = getTournamentSyncLivePlay({
        teams,
        datagolfLivePlay: isRoundRunning,
      });
      await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
        tournament: {
          _id: tournament._id,
          currentRound: tournamentCurrentRound,
          livePlay: tournamentLivePlay,
          ...lifecycleUpdates,
        },
      });
      const usageMap = buildUsageRateByGolferApiId({ teams });

      for (const g of golfers) {
        if (g.golfer?._id && g.tournamentGolfer?._id) {
          const golferPosition = getEffectiveTournamentPosition(g);
          const roundOneScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 1,
            currentRound,
            isRoundRunning,
            coursePar: course.par,
          });
          const roundTwoScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 2,
            currentRound,
            isRoundRunning,
            coursePar: course.par,
          });
          const roundThreeScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 3,
            currentRound,
            isRoundRunning,
            coursePar: course.par,
          });
          const roundFourScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 4,
            currentRound,
            isRoundRunning,
            coursePar: course.par,
          });
          const betterGolfers = golfers.filter((og) => {
            const otherPosition = getEffectiveTournamentPosition(og);
            return (
              (isNonRankingTournamentPosition(otherPosition)
                ? 999
                : (og.live?.current_score ?? 0)) <
              (isNonRankingTournamentPosition(golferPosition)
                ? 999
                : (g.live?.current_score ?? 0))
            );
          }).length;
          const betterGolfersPast = golfers.filter((og) => {
            const otherPosition = getEffectiveTournamentPosition(og);
            return (
              (isNonRankingTournamentPosition(otherPosition)
                ? 999
                : (og.live?.current_score ?? 0) - (og.live?.today ?? 0)) <
              (isNonRankingTournamentPosition(golferPosition)
                ? 999
                : (g.live?.current_score ?? 0) - (g.live?.today ?? 0))
            );
          }).length;
          const tiedGolfers = golfers.filter((og) => {
            const otherPosition = getEffectiveTournamentPosition(og);
            return (
              (isNonRankingTournamentPosition(otherPosition)
                ? 999
                : (og.live?.current_score ?? 0)) ===
              (isNonRankingTournamentPosition(golferPosition)
                ? 999
                : (g.live?.current_score ?? 0))
            );
          }).length;
          await ctx.runMutation(
            internal.functions.golfers.updateTournamentGolfer,
            {
              tournamentGolfer: {
                _id: g.tournamentGolfer._id,
                tournamentId: tournament._id,
                golferId: g.golfer._id,
                position: isNonRankingTournamentPosition(golferPosition)
                  ? golferPosition
                  : tiedGolfers > 1
                    ? `T${betterGolfers + 1}`
                    : `${betterGolfers + 1}`,
                posChange: betterGolfersPast - betterGolfers,
                score:
                  g.live?.current_score ??
                  (g.historical
                    ? roundToDecimalPlace(
                        (g.historical.round_1?.score ?? 0) -
                          (g.historical.round_1?.course_par ?? 0) +
                          ((g.historical.round_2?.score ?? 0) -
                            (g.historical.round_2?.course_par ?? 0)) +
                          ((g.historical.round_3?.score ?? 0) -
                            (g.historical.round_3?.course_par ?? 0)) +
                          ((g.historical.round_4?.score ?? 0) -
                            (g.historical.round_4?.course_par ?? 0)),
                      )
                    : g.tournamentGolfer.score
                      ? roundToDecimalPlace(g.tournamentGolfer.score)
                      : undefined),
                endHole:
                  g.live?.end_hole ?? g.tournamentGolfer?.endHole ?? undefined,
                makeCut:
                  g.live?.make_cut ?? g.tournamentGolfer?.makeCut ?? undefined,
                topTen:
                  g.live?.top_10 ?? g.tournamentGolfer?.topTen ?? undefined,
                win: g.live?.win ?? g.tournamentGolfer?.win ?? undefined,
                today: getTournamentTodayValue({
                  golfer: g,
                  currentRound,
                  isRoundRunning,
                  coursePar: course.par,
                }),
                thru: getTournamentThruValue({
                  golfer: g,
                  currentRound,
                  isRoundRunning,
                  coursePar: course.par,
                }),
                roundOne: roundOneScore,
                roundTwo: roundTwoScore,
                roundThree: roundThreeScore,
                roundFour: roundFourScore,
                roundOneTeeTime:
                  g.field?.teetimes.find(
                    (tt: {
                      course_code: string;
                      course_name: string;
                      course_num: number;
                      round_num: number;
                      start_hole: number;
                      teetime: number | undefined;
                      wave: "early" | "late";
                    }) => tt.round_num === 1,
                  )?.teetime ??
                  (g.historical?.round_1?.teetime
                    ? g.historical?.round_1?.teetime
                    : typeof g.tournamentGolfer?.roundOneTeeTime === "number"
                      ? g.tournamentGolfer?.roundOneTeeTime
                      : (parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundOneTeeTime as string,
                        ) ?? undefined)),
                roundTwoTeeTime:
                  g.field?.teetimes.find(
                    (tt: {
                      course_code: string;
                      course_name: string;
                      course_num: number;
                      round_num: number;
                      start_hole: number;
                      teetime: number | undefined;
                      wave: "early" | "late";
                    }) => tt.round_num === 2,
                  )?.teetime ??
                  (g.historical?.round_2?.teetime
                    ? g.historical?.round_2?.teetime
                    : typeof g.tournamentGolfer?.roundTwoTeeTime === "number"
                      ? g.tournamentGolfer?.roundTwoTeeTime
                      : (parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundTwoTeeTime as string,
                        ) ?? undefined)),
                roundThreeTeeTime:
                  g.field?.teetimes.find(
                    (tt: {
                      course_code: string;
                      course_name: string;
                      course_num: number;
                      round_num: number;
                      start_hole: number;
                      teetime: number | undefined;
                      wave: "early" | "late";
                    }) => tt.round_num === 3,
                  )?.teetime ??
                  (g.historical?.round_3?.teetime
                    ? g.historical?.round_3?.teetime
                    : typeof g.tournamentGolfer?.roundThreeTeeTime === "number"
                      ? g.tournamentGolfer?.roundThreeTeeTime
                      : (parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundThreeTeeTime as string,
                        ) ?? undefined)),
                roundFourTeeTime:
                  g.field?.teetimes.find(
                    (tt: {
                      course_code: string;
                      course_name: string;
                      course_num: number;
                      round_num: number;
                      start_hole: number;
                      teetime: number | undefined;
                      wave: "early" | "late";
                    }) => tt.round_num === 4,
                  )?.teetime ??
                  (g.historical?.round_4?.teetime
                    ? g.historical?.round_4?.teetime
                    : typeof g.tournamentGolfer?.roundFourTeeTime === "number"
                      ? g.tournamentGolfer?.roundFourTeeTime
                      : (parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundFourTeeTime as string,
                        ) ?? undefined)),
                usage: usageMap.get(g.golfer?.apiId ?? -1) ?? 0,
                round: getTournamentGolferSyncRound(g),
              },
            },
          );
        }
      }
      const updatedTeams: TournamentSyncTeam[] = [];
      for (const t of teams) {
        currentRound = getTournamentTeamSyncRound({
          golfers: t.golfers,
          existingRound: t.round,
        });
        isRoundRunning =
          t.golfers.filter(
            (g) =>
              !(
                g.live?.thru === "F" ||
                g.live?.thru === "18" ||
                g.live?.thru === "0"
              ),
          ).length > 0;
        const roundOne = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 1,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
        });
        const roundTwo = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 2,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
        });
        const roundThree = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 3,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
        });
        const roundFour = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 4,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
        });
        const teamWeekendCut = isTeamWeekendCut({
          golfers: t.golfers,
          currentRound,
        });
        const teamLiveWindowGolfers = getTeamLiveWindowGolfers({
          golfers: t.golfers,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
        });
        const teamLiveTodayMean = getTeamLiveWindowMean({
          golfers: teamLiveWindowGolfers,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
          metric: "today",
        });
        const teamLiveThruMean = getTeamLiveWindowMean({
          golfers: teamLiveWindowGolfers,
          currentRound,
          isRoundRunning,
          coursePar: course.par,
          metric: "thru",
        });

        updatedTeams.push({
          ...t,
          position: teamWeekendCut ? "CUT" : t.position,
          score: roundToDecimalPlace(
            (roundOne && roundOne > 0 ? roundOne - course.par : 0) +
              (roundTwo && roundTwo > 0 ? roundTwo - course.par : 0) +
              (roundThree && roundThree > 0 ? roundThree - course.par : 0) +
              (roundFour && roundFour > 0 ? roundFour - course.par : 0) +
              1,
          ),
          today:
            typeof teamLiveTodayMean === "number"
              ? roundToDecimalPlace(teamLiveTodayMean, 1)
              : undefined,
          thru:
            typeof teamLiveThruMean === "number"
              ? roundToDecimalPlace(teamLiveThruMean, 1)
              : undefined,
          round: currentRound,
          roundOneTeeTime: earliestTimeStr(
            t.golfers.map(
              (g) =>
                g.field?.teetimes.find(
                  (tt: {
                    course_code: string;
                    course_name: string;
                    course_num: number;
                    round_num: number;
                    start_hole: number;
                    teetime: number | undefined;
                    wave: "early" | "late";
                  }) => tt.round_num === 1,
                )?.teetime ??
                (g.historical?.round_1?.teetime
                  ? g.historical?.round_1?.teetime
                  : ((typeof g.tournamentGolfer?.roundOneTeeTime === "number"
                      ? g.tournamentGolfer.roundOneTeeTime
                      : parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundOneTeeTime as string,
                        )) ?? undefined)),
            ),
          ),
          roundOne,
          roundTwoTeeTime: earliestTimeStr(
            t.golfers.map(
              (g) =>
                g.field?.teetimes.find(
                  (tt: {
                    course_code: string;
                    course_name: string;
                    course_num: number;
                    round_num: number;
                    start_hole: number;
                    teetime: number | undefined;
                    wave: "early" | "late";
                  }) => tt.round_num === 2,
                )?.teetime ??
                (g.historical?.round_2?.teetime
                  ? g.historical?.round_2?.teetime
                  : ((typeof g.tournamentGolfer?.roundTwoTeeTime === "number"
                      ? g.tournamentGolfer.roundTwoTeeTime
                      : parseDataGolfTeeTimeToMs(
                          g.tournamentGolfer?.roundTwoTeeTime as string,
                        )) ?? undefined)),
            ),
          ),
          roundTwo,
          roundThreeTeeTime: teamWeekendCut
            ? undefined
            : earliestTimeStr(
                t.golfers
                  .map(
                    (g) =>
                      g.field?.teetimes.find(
                        (tt: {
                          course_code: string;
                          course_name: string;
                          course_num: number;
                          round_num: number;
                          start_hole: number;
                          teetime: number | undefined;
                          wave: "early" | "late";
                        }) => tt.round_num === 3,
                      )?.teetime ??
                      (g.historical?.round_3?.teetime
                        ? g.historical?.round_3?.teetime
                        : ((typeof g.tournamentGolfer?.roundThreeTeeTime ===
                          "number"
                            ? g.tournamentGolfer.roundThreeTeeTime
                            : parseDataGolfTeeTimeToMs(
                                g.tournamentGolfer?.roundThreeTeeTime as string,
                              )) ?? undefined)),
                  )
                  .sort((a, b) => (a ?? 0) - (b ?? 0))
                  .slice(-5),
              ),
          roundThree,
          roundFourTeeTime: teamWeekendCut
            ? undefined
            : earliestTimeStr(
                t.golfers
                  .map(
                    (g) =>
                      g.field?.teetimes.find(
                        (tt: {
                          course_code: string;
                          course_name: string;
                          course_num: number;
                          round_num: number;
                          start_hole: number;
                          teetime: number | undefined;
                          wave: "early" | "late";
                        }) => tt.round_num === 4,
                      )?.teetime ??
                      (g.historical?.round_4?.teetime
                        ? g.historical?.round_4?.teetime
                        : ((typeof g.tournamentGolfer?.roundFourTeeTime ===
                          "number"
                            ? g.tournamentGolfer.roundFourTeeTime
                            : parseDataGolfTeeTimeToMs(
                                g.tournamentGolfer?.roundFourTeeTime as string,
                              )) ?? undefined)),
                  )
                  .sort((a, b) => (a ?? 0) - (b ?? 0))
                  .slice(-5),
              ),
          roundFour,
        });
      }
      for (const t of updatedTeams) {
        if (t._id) {
          const teamsAheadPast = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id &&
              (ut.score ?? 0) - (ut.today ?? 0) <
                (t.score ?? 0) - (t.today ?? 0),
          ).length;
          const teamsTiedPast = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id &&
              (ut.score ?? 0) - (ut.today ?? 0) ===
                (t.score ?? 0) - (t.today ?? 0),
          ).length;
          const teamRank = getTeamTournamentRank({
            team: t,
            teams: updatedTeams,
            tournamentCompleted: tournamentStatus === "completed",
          });
          await ctx.runMutation(api.functions.teams.updateTeam, {
            team: {
              _id: t._id,
              makeCut: t.makeCut,
              score: t.score,
              topTen: t.topTen,
              topFive: t.topFive,
              topThree: t.topThree,
              win: t.win,
              today: t.today,
              thru: t.thru,
              round: t.round,
              roundOneTeeTime: t.roundOneTeeTime,
              roundOne: t.roundOne,
              roundTwoTeeTime: t.roundTwoTeeTime,
              roundTwo: t.roundTwo,
              roundThreeTeeTime: t.roundThreeTeeTime,
              roundThree: t.roundThree,
              roundFourTeeTime: t.roundFourTeeTime,
              roundFour: t.roundFour,
              earnings: awardTeamEarnings(
                tier,
                teamRank.teamsAhead,
                teamRank.teamsTied,
              ),
              points: awardTeamPlayoffPoints(
                tier,
                teamRank.teamsAhead,
                teamRank.teamsTied,
              ),
              position: teamRank.position,
              pastPosition:
                teamsTiedPast > 1
                  ? `T${teamsAheadPast + 1}`
                  : `${teamsAheadPast + 1}`,
            },
          });
        }
      }

      return {
        ok: true,
        skipped: false,
        reason: "completed update",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        currentRound: tournament.currentRound,
        livePlay: tournament.livePlay,
        status: tournament.status,
      };
    },
  });
export const updatePreviousTournament_Public: ReturnType<typeof action> =
  action({
    args: { tournamentId: v.id("tournaments") },
    handler: async (ctx, args) => {
      return await ctx.runAction(
        internal.functions.cronJobs.updatePreviousTournament,
        { tournamentId: args.tournamentId },
      );
    },
  });
