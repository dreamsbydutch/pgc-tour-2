import {
  action,
  internalAction,
  internalMutation,
  mutation,
} from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type {
  DataGolfFieldPlayer,
  DataGolfRankedPlayer,
} from "../types/datagolf";
import {
  EXCLUDED_GOLFER_IDS,
  GROUP_LIMITS,
  PLAYOFF_SILVER_PAYOUT_OFFSET,
  PRE_TOURNAMENT_PICK_WINDOW_MS,
  TOURNAMENT_PREFLIGHT_INTERVAL_MS,
} from "./_constants";
import {
  checkCompatabilityOfEventNames,
  normalizePlayerNameFromDataGolf,
  parseDataGolfTeeTimeToMs,
} from "../utils/datagolf";
import {
  awardTeamEarnings,
  awardTeamPlayoffPoints,
  buildUsageRateByGolferApiId,
  earliestTimeStr,
  roundToDecimalPlace,
  selectionCountByPlayoffTournamentRound,
} from "../utils";
import {
  recomputeStandingsRanksForSeason,
  recomputeStandingsRowForCard,
  upsertStandingsContributionForTeam,
} from "../utils/standings";
export { buildTourCardStandingsTotals } from "../utils/standings";
import { determineGroupIndex } from "../utils/golfers";
import { EnhancedGolfer } from "../types/types";
import type { TournamentGolferUpdate } from "./golfers";
import type { TeamUpdate } from "./teams";
import { v } from "convex/values";
import {
  getCurrentMember,
  requireAdmin,
  requireAdminForAction,
} from "../utils/auth";
import { writeAuditLog } from "../utils/audit";

type TournamentLifecycleStatus = "upcoming" | "active" | "completed";
type RoundNumber = 1 | 2 | 3 | 4;

type TournamentSyncTeam = Doc<"teams"> & {
  golfers: EnhancedGolfer[];
  tour?: Doc<"tours">;
  tourCard?: Doc<"tourCards">;
};

type TournamentRoundProgress = {
  started: boolean;
  completed: boolean;
  live: boolean;
};

type TournamentTimelineState = {
  currentRound: number;
  livePlay: boolean;
  status: TournamentLifecycleStatus;
  rounds: Record<RoundNumber, TournamentRoundProgress>;
  overlapRound?: RoundNumber;
};

type TeamRoundWindowMetrics = {
  today?: number;
  thru?: number;
};

const TOURNAMENT_ROUNDS: RoundNumber[] = [1, 2, 3, 4];
const SYNC_WRITE_BATCH_SIZE = 25;
const UNCHANGED_SYNC_HEARTBEAT_MS = 30 * 60_000;

export function chunkSyncUpdates<T>(
  updates: T[],
  size = SYNC_WRITE_BATCH_SIZE,
) {
  const chunks: T[][] = [];
  for (let index = 0; index < updates.length; index += size) {
    chunks.push(updates.slice(index, index + size));
  }
  return chunks;
}

export function getAdaptiveSyncDelayMs(args: {
  livePlay?: boolean;
  status?: string;
  activatedTournament?: boolean;
  failureCount?: number;
}): number | null {
  if ((args.failureCount ?? 0) > 0) {
    const retryMinutes = [8, 16, 30][Math.min((args.failureCount ?? 1) - 1, 2)];
    return retryMinutes * 60_000;
  }
  if (args.livePlay === true) return 4 * 60_000;
  if (args.activatedTournament || args.status === "active") {
    return 12 * 60_000;
  }
  return null;
}

/**
 * Refreshes ESPN only after Data Golf has successfully persisted the same
 * tournament. ESPN remains non-authoritative, so its failure is logged without
 * rolling back the completed Data Golf update.
 */
async function syncEspnAfterDataGolfUpdate(
  ctx: ActionCtx,
  tournamentId: Id<"tournaments">,
): Promise<void> {
  try {
    const result = await ctx.runAction(
      internal.functions.espnGolf.syncTournamentScorecards,
      {
        tournamentId,
      },
    );
    if (!result.ok) {
      console.warn("ESPN scorecard sync failed after Data Golf update", {
        tournamentId,
        result,
      });
    }
  } catch (error) {
    console.warn("ESPN scorecard sync threw after Data Golf update", {
      tournamentId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

type TeamTournamentRank = {
  teamsAhead: number;
  teamsTied: number;
  position: string;
};

type FirstPlaceTiebreakResolution =
  | {
      status: "no_tie";
      tourKey: string;
      tiedTeamIds: Id<"teams">[];
    }
  | {
      status: "resolved";
      tourKey: string;
      tiedTeamIds: Id<"teams">[];
      winnerTeamId: Id<"teams">;
    }
  | {
      status: "unresolved_missing_earnings";
      tourKey: string;
      tiedTeamIds: Id<"teams">[];
    }
  | {
      status: "unresolved_equal_earnings";
      tourKey: string;
      tiedTeamIds: Id<"teams">[];
    };

type FirstPlaceTiebreakSummary = {
  byTourKey: Map<string, FirstPlaceTiebreakResolution>;
  unresolved: Array<
    Extract<
      FirstPlaceTiebreakResolution,
      | { status: "unresolved_missing_earnings" }
      | { status: "unresolved_equal_earnings" }
    >
  >;
};

type TournamentCompletionHoldReason =
  | "first_place_tiebreak_missing_earnings"
  | "first_place_tiebreak_equal_earnings";

function isDataGolfEventCompleted(value: unknown): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  if (normalized === "true" || normalized === "1") return true;

  return Number.isFinite(Date.parse(normalized));
}

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

function getCurrentFeedRoundOneTeeTimeMs(
  golfer: EnhancedGolfer,
): number | undefined {
  const fieldTeeTime = golfer.field?.teetimes.find(
    (teetime) => teetime.round_num === 1,
  )?.teetime;
  if (typeof fieldTeeTime === "number") {
    return fieldTeeTime;
  }

  const historicalTeeTime = golfer.historical?.round_1?.teetime;
  return typeof historicalTeeTime === "number" ? historicalTeeTime : undefined;
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
  earningsCount: number;
} {
  let total = 0;
  let golferCount = 0;
  let earningsCount = 0;

  for (const golfer of team.golfers) {
    const earnings = getGolferEventEarnings(golfer);
    total += earnings ?? 0;
    golferCount += 1;
    earningsCount += typeof earnings === "number" ? 1 : 0;
  }

  return { total, golferCount, earningsCount };
}

function getTeamCompetitionKey(
  team: Pick<TournamentSyncTeam, "tour" | "tourCard" | "playoff">,
  isPlayoff = false,
): string {
  if (isPlayoff) {
    return `playoff:${team.playoff ?? 0}`;
  }
  return String(team.tour?._id ?? team.tourCard?.tourId ?? "");
}

function isNonRankingTeamPosition(
  position: string | null | undefined,
): boolean {
  return ["CUT", "WD", "DQ"].includes(
    String(position ?? "")
      .trim()
      .toUpperCase(),
  );
}

export function buildFirstPlaceTiebreakSummary(args: {
  teams: TournamentSyncTeam[];
  isPlayoff?: boolean;
}): FirstPlaceTiebreakSummary {
  const teamsByTourKey = new Map<string, TournamentSyncTeam[]>();

  for (const team of args.teams) {
    const tourKey = getTeamCompetitionKey(team, args.isPlayoff);
    const existing = teamsByTourKey.get(tourKey) ?? [];
    existing.push(team);
    teamsByTourKey.set(tourKey, existing);
  }

  const byTourKey = new Map<string, FirstPlaceTiebreakResolution>();
  const unresolved: FirstPlaceTiebreakSummary["unresolved"] = [];

  for (const [tourKey, teams] of teamsByTourKey.entries()) {
    const scoredTeams = teams.filter(
      (team) =>
        team.position !== "CUT" &&
        typeof team.score === "number" &&
        Number.isFinite(team.score),
    );

    if (scoredTeams.length === 0) {
      byTourKey.set(tourKey, {
        status: "no_tie",
        tourKey,
        tiedTeamIds: [],
      });
      continue;
    }

    const bestScore = Math.min(
      ...scoredTeams.map((team) => team.score as number),
    );
    const firstPlaceTeams = scoredTeams.filter(
      (team) => (team.score as number) === bestScore,
    );
    const tiedTeamIds = firstPlaceTeams.map((team) => team._id);

    if (firstPlaceTeams.length <= 1) {
      byTourKey.set(tourKey, {
        status: "no_tie",
        tourKey,
        tiedTeamIds,
      });
      continue;
    }

    const tiebreakRows = firstPlaceTeams.map((team) => ({
      team,
      ...getTeamGolferEventEarningsTotal(team),
    }));

    if (
      tiebreakRows.some(
        (row) => row.golferCount === 0 || row.earningsCount < row.golferCount,
      )
    ) {
      const resolution = {
        status: "unresolved_missing_earnings",
        tourKey,
        tiedTeamIds,
      } as const;
      byTourKey.set(tourKey, resolution);
      unresolved.push(resolution);
      continue;
    }

    const highestEarnings = Math.max(...tiebreakRows.map((row) => row.total));
    const winners = tiebreakRows.filter((row) => row.total === highestEarnings);
    if (winners.length !== 1) {
      const resolution = {
        status: "unresolved_equal_earnings",
        tourKey,
        tiedTeamIds,
      } as const;
      byTourKey.set(tourKey, resolution);
      unresolved.push(resolution);
      continue;
    }

    byTourKey.set(tourKey, {
      status: "resolved",
      tourKey,
      tiedTeamIds,
      winnerTeamId: winners[0].team._id,
    });
  }

  return { byTourKey, unresolved };
}

function getTournamentCompletionHoldReason(
  summary: FirstPlaceTiebreakSummary,
): TournamentCompletionHoldReason | undefined {
  if (
    summary.unresolved.some(
      (resolution) => resolution.status === "unresolved_missing_earnings",
    )
  ) {
    return "first_place_tiebreak_missing_earnings";
  }
  if (
    summary.unresolved.some(
      (resolution) => resolution.status === "unresolved_equal_earnings",
    )
  ) {
    return "first_place_tiebreak_equal_earnings";
  }

  return undefined;
}

export function derivePersistedTournamentState(args: {
  timeline: TournamentTimelineState;
  firstPlaceTiebreakSummary: FirstPlaceTiebreakSummary;
}): {
  currentRound: number;
  livePlay: boolean;
  status: TournamentLifecycleStatus;
  holdReason?: TournamentCompletionHoldReason;
} {
  const holdReason = getTournamentCompletionHoldReason(
    args.firstPlaceTiebreakSummary,
  );
  if (args.timeline.status !== "completed" || !holdReason) {
    return {
      currentRound: args.timeline.currentRound,
      livePlay: args.timeline.livePlay,
      status: args.timeline.status,
    };
  }

  return {
    currentRound: 4,
    livePlay: false,
    status: "active",
    holdReason,
  };
}

export function getTeamTournamentRank(args: {
  team: TournamentSyncTeam;
  teams: TournamentSyncTeam[];
  firstPlaceTiebreakSummary?: FirstPlaceTiebreakSummary;
  tournamentCompleted: boolean;
  isPlayoff?: boolean;
}): TeamTournamentRank {
  const sameTour = (team: TournamentSyncTeam) =>
    getTeamCompetitionKey(team, args.isPlayoff) ===
    getTeamCompetitionKey(args.team, args.isPlayoff);
  const isRankEligibleTeam = (team: TournamentSyncTeam) =>
    sameTour(team) && !isNonRankingTeamPosition(team.position);
  const teamScore = args.team.score ?? 0;
  const teamsAhead = args.teams.filter(
    (team) => isRankEligibleTeam(team) && (team.score ?? 0) < teamScore,
  ).length;
  const teamsTied = args.teams.filter(
    (team) => isRankEligibleTeam(team) && (team.score ?? 0) === teamScore,
  ).length;

  if (isNonRankingTeamPosition(args.team.position)) {
    return {
      teamsAhead,
      teamsTied,
      position: String(args.team.position ?? "")
        .trim()
        .toUpperCase(),
    };
  }

  if (!args.tournamentCompleted || teamsAhead !== 0 || teamsTied <= 1) {
    return {
      teamsAhead,
      teamsTied,
      position: teamsTied > 1 ? `T${teamsAhead + 1}` : `${teamsAhead + 1}`,
    };
  }

  const firstPlaceResolution = args.firstPlaceTiebreakSummary?.byTourKey.get(
    getTeamCompetitionKey(args.team, args.isPlayoff),
  );
  if (!firstPlaceResolution || firstPlaceResolution.status !== "resolved") {
    return { teamsAhead, teamsTied, position: `T${teamsAhead + 1}` };
  }
  if (firstPlaceResolution.winnerTeamId === args.team._id) {
    return { teamsAhead: 0, teamsTied: 1, position: "1" };
  }

  const tiedSecondCount = firstPlaceResolution.tiedTeamIds.length - 1;
  return {
    teamsAhead: 1,
    teamsTied: tiedSecondCount,
    position: tiedSecondCount > 1 ? "T2" : "2",
  };
}

function applyComputedTeamPositions(args: {
  teams: TournamentSyncTeam[];
  firstPlaceTiebreakSummary?: FirstPlaceTiebreakSummary;
  tournamentCompleted: boolean;
  isPlayoff?: boolean;
}): TournamentSyncTeam[] {
  return args.teams.map((team) => ({
    ...team,
    position: getTeamTournamentRank({
      team,
      teams: args.teams,
      firstPlaceTiebreakSummary: args.firstPlaceTiebreakSummary,
      tournamentCompleted: args.tournamentCompleted,
      isPlayoff: args.isPlayoff,
    }).position,
  }));
}

/**
 * Returns the first round-one tee time across a tournament field feed.
 */
export function getFieldRoundOneTeeTimeMs(
  field: DataGolfFieldPlayer[] | undefined,
): number | undefined {
  return earliestTimeStr(
    (field ?? []).map(
      (golfer) =>
        golfer.teetimes.find((teetime) => teetime.round_num === 1)?.teetime,
    ),
  );
}

export function shouldRunTournamentPreflight(args: {
  tournamentType?: "active" | "next" | "recent";
  tournamentStatus?: string;
  startDate?: number;
  endDate?: number;
  nowMs: number;
}) {
  return (
    (args.tournamentType === "next" || args.tournamentType === "active") &&
    args.tournamentStatus === "upcoming" &&
    typeof args.startDate === "number" &&
    typeof args.endDate === "number" &&
    args.startDate - args.nowMs <= PRE_TOURNAMENT_PICK_WINDOW_MS &&
    args.endDate >= args.nowMs
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

export function shouldApplyPreStartNonStarterReplacement(args: {
  isPlayoff: boolean;
  eventIndex?: number;
}): boolean {
  return !args.isPlayoff || args.eventIndex === 1;
}

/** Playoff legs one and two are checkpoints; only the final awards results. */
export function shouldAwardTournamentResults(args: {
  isPlayoff: boolean;
  eventIndex?: number;
}): boolean {
  return !args.isPlayoff || args.eventIndex === 3;
}

/** Silver payouts always occupy positions 76-150 in the playoff payout table. */
export function getTournamentPayoutAheadCount(args: {
  isPlayoff: boolean;
  playoff?: number;
  teamsAhead: number;
}): number {
  return (
    args.teamsAhead +
    (args.isPlayoff && args.playoff === 2 ? PLAYOFF_SILVER_PAYOUT_OFFSET : 0)
  );
}

function hasTournamentPlayEvidence(golfer: EnhancedGolfer): boolean {
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

function isTerminalNonPlayingFeedState(position: string | undefined): boolean {
  return ["WD", "DQ", "DNS", "DNF"].includes(position ?? "");
}

function hasDisappearedFromActiveFeeds(golfer: EnhancedGolfer): boolean {
  return !golfer.field && !golfer.live && !golfer.historical;
}

function isPreStartNonStarter(args: {
  golfer: EnhancedGolfer;
  allowPreStartNonStarterReplacement: boolean;
}): boolean {
  if (!args.allowPreStartNonStarterReplacement) {
    return false;
  }

  const effectivePosition = getEffectiveTournamentPosition(args.golfer);

  return (
    typeof getCurrentFeedRoundOneTeeTimeMs(args.golfer) !== "number" &&
    (isTerminalNonPlayingFeedState(effectivePosition) ||
      hasDisappearedFromActiveFeeds(args.golfer)) &&
    !hasTournamentPlayEvidence(args.golfer)
  );
}

function getTournamentSyncPosition(args: {
  golfer: EnhancedGolfer;
  allowPreStartNonStarterReplacement: boolean;
}): string | undefined {
  if (isPreStartNonStarter(args)) {
    return "WD";
  }

  return getEffectiveTournamentPosition(args.golfer);
}

/**
 * Returns the same best-available score for persistence and leaderboard rank.
 * Data Golf can omit live.current_score while still returning historical round
 * totals, so missing live data must never be treated as even par.
 */
export function getEffectiveGolferLeaderboardScore(
  golfer: EnhancedGolfer,
): number | undefined {
  if (
    typeof golfer.live?.current_score === "number" &&
    Number.isFinite(golfer.live.current_score)
  ) {
    return golfer.live.current_score;
  }

  const completedHistoricalRounds = [
    golfer.historical?.round_1,
    golfer.historical?.round_2,
    golfer.historical?.round_3,
    golfer.historical?.round_4,
  ].filter(
    (round): round is NonNullable<typeof round> =>
      typeof round?.score === "number" &&
      round.score > 0 &&
      typeof round.course_par === "number" &&
      round.course_par > 0,
  );
  if (completedHistoricalRounds.length > 0) {
    return roundToDecimalPlace(
      completedHistoricalRounds.reduce(
        (total, round) => total + round.score - round.course_par,
        0,
      ),
    );
  }

  return typeof golfer.tournamentGolfer?.score === "number" &&
    Number.isFinite(golfer.tournamentGolfer.score)
    ? roundToDecimalPlace(golfer.tournamentGolfer.score)
    : undefined;
}

export function getGolferLeaderboardRankMetrics(args: {
  golfer: EnhancedGolfer;
  golfers: EnhancedGolfer[];
  allowPreStartNonStarterReplacement: boolean;
}): { betterGolfers: number; betterGolfersPast: number; tiedGolfers: number } {
  const rankingScore = (golfer: EnhancedGolfer): number => {
    const position = getTournamentSyncPosition({
      golfer,
      allowPreStartNonStarterReplacement:
        args.allowPreStartNonStarterReplacement,
    });
    return isNonRankingTournamentPosition(position)
      ? 999
      : (getEffectiveGolferLeaderboardScore(golfer) ??
          Number.POSITIVE_INFINITY);
  };
  const priorRankingScore = (golfer: EnhancedGolfer): number => {
    const score = rankingScore(golfer);
    if (!Number.isFinite(score)) return score;
    const today = golfer.live?.today ?? golfer.tournamentGolfer?.today ?? 0;
    return score - today;
  };
  const score = rankingScore(args.golfer);
  const priorScore = priorRankingScore(args.golfer);
  return {
    betterGolfers: args.golfers.filter((golfer) => rankingScore(golfer) < score)
      .length,
    betterGolfersPast: args.golfers.filter(
      (golfer) => priorRankingScore(golfer) < priorScore,
    ).length,
    tiedGolfers: args.golfers.filter((golfer) => rankingScore(golfer) === score)
      .length,
  };
}

function getGolferReplacementRank(golfer: EnhancedGolfer): number {
  return (
    golfer.tournamentGolfer?.worldRank ??
    golfer.ranking?.owgr_rank ??
    golfer.golfer?.worldRank ??
    Number.POSITIVE_INFINITY
  );
}

function getTeamGolfersByApiIds(
  golfers: EnhancedGolfer[],
  golferApiIds: number[],
): EnhancedGolfer[] {
  return golferApiIds
    .map((apiId) =>
      golfers.find(
        (golfer) =>
          golfer.golfer?.apiId === apiId &&
          (golfer.tournamentGolfer?.group ?? 0) > 0,
      ),
    )
    .filter((golfer): golfer is EnhancedGolfer => Boolean(golfer));
}

function getReplacementCandidateForGroup(args: {
  golfers: EnhancedGolfer[];
  group: number;
  excludedApiIds: Set<number>;
  allowPreStartNonStarterReplacement: boolean;
}): EnhancedGolfer | undefined {
  return args.golfers
    .filter((golfer) => {
      const apiId = golfer.golfer?.apiId;
      if (!apiId || args.excludedApiIds.has(apiId)) {
        return false;
      }
      if (golfer.tournamentGolfer?.group !== args.group) {
        return false;
      }
      if (
        isPreStartNonStarter({
          golfer,
          allowPreStartNonStarterReplacement:
            args.allowPreStartNonStarterReplacement,
        })
      ) {
        return false;
      }

      return !isNonRankingTournamentPosition(
        getTournamentSyncPosition({
          golfer,
          allowPreStartNonStarterReplacement:
            args.allowPreStartNonStarterReplacement,
        }),
      );
    })
    .sort(
      (a, b) => getGolferReplacementRank(a) - getGolferReplacementRank(b),
    )[0];
}

async function applyPreStartNonStarterRosterReplacements(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    teams: TournamentSyncTeam[];
    golfers: EnhancedGolfer[];
    allowPreStartNonStarterReplacement: boolean;
  },
): Promise<void> {
  if (!args.allowPreStartNonStarterReplacement) {
    return;
  }

  for (const team of args.teams) {
    const rosteredGolfers = team.golfers ?? [];
    const nonStarters = rosteredGolfers.filter((golfer) =>
      isPreStartNonStarter({
        golfer,
        allowPreStartNonStarterReplacement:
          args.allowPreStartNonStarterReplacement,
      }),
    );

    if (nonStarters.length === 0) {
      continue;
    }

    const nextApiIds = [...team.golferIds];
    const originalRosterKey = nextApiIds.join(",");

    for (const golfer of nonStarters) {
      const removedApiId = golfer.golfer?.apiId;
      const removedGroup = golfer.tournamentGolfer?.group;
      if (!removedApiId || !removedGroup) {
        continue;
      }

      const replaceIndex = nextApiIds.findIndex(
        (apiId) => apiId === removedApiId,
      );
      if (replaceIndex === -1) {
        continue;
      }

      const excludedApiIds = new Set(nextApiIds);
      excludedApiIds.delete(removedApiId);

      const replacement = getReplacementCandidateForGroup({
        golfers: args.golfers,
        group: removedGroup,
        excludedApiIds,
        allowPreStartNonStarterReplacement:
          args.allowPreStartNonStarterReplacement,
      });
      const replacementApiId = replacement?.golfer?.apiId;
      if (!replacementApiId) {
        continue;
      }

      nextApiIds[replaceIndex] = replacementApiId;
    }

    if (nextApiIds.join(",") === originalRosterKey) {
      continue;
    }

    await ctx.runMutation(internal.functions.teams.updateTeamRoster, {
      teamId: team._id,
      apiIds: nextApiIds,
    });
    team.golferIds = nextApiIds;
    team.golfers = getTeamGolfersByApiIds(args.golfers, nextApiIds);
  }
}

/**
 * Returns the stored score for a completed round when available.
 */
function getCompletedRoundScore(
  golfer: EnhancedGolfer,
  roundNumber: RoundNumber,
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

function getGolferLiveRound(golfer: EnhancedGolfer): number {
  return typeof golfer.live?.round === "number" &&
    Number.isFinite(golfer.live.round)
    ? golfer.live.round
    : 0;
}

function isGolferActivelyPlayingRound(
  golfer: EnhancedGolfer,
  roundNumber: RoundNumber,
): boolean {
  return (
    getGolferLiveRound(golfer) === roundNumber &&
    (() => {
      const thru = getHoleCount(golfer.live?.thru);
      return typeof thru === "number" && thru > 0 && thru < 18;
    })()
  );
}

function hasGolferStartedTournamentRound(
  golfer: EnhancedGolfer,
  roundNumber: RoundNumber,
): boolean {
  if (typeof getCompletedRoundScore(golfer, roundNumber) === "number") {
    return true;
  }

  const position = getEffectiveTournamentPosition(golfer);
  const liveRound = getGolferLiveRound(golfer);
  const thru = getHoleCount(golfer.live?.thru);

  if (liveRound > roundNumber) {
    return true;
  }

  if (liveRound === roundNumber) {
    if (typeof thru === "number" && thru > 0) {
      return true;
    }
    if (isTerminalTournamentPosition(position)) {
      return true;
    }
  }

  return false;
}

export function hasGolferCompletedTournamentRound(args: {
  golfer: EnhancedGolfer;
  roundNumber: RoundNumber;
}): boolean {
  const position = getEffectiveTournamentPosition(args.golfer);
  if (isTerminalTournamentPosition(position)) {
    return true;
  }

  if (
    typeof getCompletedRoundScore(args.golfer, args.roundNumber) === "number"
  ) {
    return true;
  }

  const liveRound = getGolferLiveRound(args.golfer);
  const thru = getHoleCount(args.golfer.live?.thru);

  if (liveRound > args.roundNumber) {
    return true;
  }

  return liveRound === args.roundNumber && thru === 18;
}

function buildTournamentRoundProgress(
  golfers: EnhancedGolfer[],
): Record<RoundNumber, TournamentRoundProgress> {
  return {
    1: {
      started: golfers.some((golfer) =>
        hasGolferStartedTournamentRound(golfer, 1),
      ),
      completed:
        golfers.length > 0 &&
        golfers.every((golfer) =>
          hasGolferCompletedTournamentRound({ golfer, roundNumber: 1 }),
        ),
      live: golfers.some((golfer) => isGolferActivelyPlayingRound(golfer, 1)),
    },
    2: {
      started: golfers.some((golfer) =>
        hasGolferStartedTournamentRound(golfer, 2),
      ),
      completed:
        golfers.length > 0 &&
        golfers.every((golfer) =>
          hasGolferCompletedTournamentRound({ golfer, roundNumber: 2 }),
        ),
      live: golfers.some((golfer) => isGolferActivelyPlayingRound(golfer, 2)),
    },
    3: {
      started: golfers.some((golfer) =>
        hasGolferStartedTournamentRound(golfer, 3),
      ),
      completed:
        golfers.length > 0 &&
        golfers.every((golfer) =>
          hasGolferCompletedTournamentRound({ golfer, roundNumber: 3 }),
        ),
      live: golfers.some((golfer) => isGolferActivelyPlayingRound(golfer, 3)),
    },
    4: {
      started: golfers.some((golfer) =>
        hasGolferStartedTournamentRound(golfer, 4),
      ),
      completed:
        golfers.length > 0 &&
        golfers.every((golfer) =>
          hasGolferCompletedTournamentRound({ golfer, roundNumber: 4 }),
        ),
      live: golfers.some((golfer) => isGolferActivelyPlayingRound(golfer, 4)),
    },
  };
}

export function deriveTournamentTimelineState(args: {
  golfers: EnhancedGolfer[];
  existingStatus?: Doc<"tournaments">["status"];
  existingRound?: number;
  eventCompleted?: boolean;
}): TournamentTimelineState {
  const rounds = buildTournamentRoundProgress(args.golfers);
  const tournamentCompleted =
    args.existingStatus === "completed" ||
    args.eventCompleted === true ||
    (args.golfers.length > 0 &&
      args.golfers.every((golfer) => hasGolferCompletedTournament(golfer)));

  if (tournamentCompleted) {
    return {
      currentRound:
        args.existingStatus === "completed" &&
        typeof args.existingRound === "number" &&
        Number.isFinite(args.existingRound) &&
        args.existingRound > 4
          ? args.existingRound
          : 4,
      livePlay: false,
      status: "completed",
      rounds,
    };
  }

  const startedByPlay = args.golfers.some((golfer) =>
    hasGolferStartedPlay(golfer),
  );
  if (!startedByPlay) {
    return {
      currentRound: 0,
      livePlay: false,
      status: "upcoming",
      rounds,
    };
  }

  let currentRound: number;
  if (!rounds[1].completed) {
    currentRound = 1;
  } else if (!rounds[2].started) {
    currentRound = 1;
  } else if (!rounds[2].completed) {
    currentRound = 2;
  } else if (!rounds[3].started) {
    currentRound = 2;
  } else if (!rounds[3].completed) {
    currentRound = 3;
  } else if (!rounds[4].started) {
    currentRound = 3;
  } else {
    currentRound = 4;
  }

  const livePlay = TOURNAMENT_ROUNDS.some((round) => rounds[round].live);
  const overlapRound =
    currentRound >= 1 &&
    currentRound < 4 &&
    rounds[currentRound as RoundNumber].started &&
    !rounds[currentRound as RoundNumber].completed &&
    rounds[(currentRound + 1) as RoundNumber].started
      ? ((currentRound + 1) as RoundNumber)
      : undefined;

  return {
    currentRound,
    livePlay,
    status: "active",
    rounds,
    overlapRound,
  };
}

export function isRoundPublishedForTimeline(
  timeline: Pick<
    TournamentTimelineState,
    "currentRound" | "livePlay" | "status"
  >,
  roundNumber: RoundNumber,
): boolean {
  if (timeline.status === "completed") {
    return true;
  }

  if ((timeline.currentRound ?? 0) > roundNumber) {
    return true;
  }

  return timeline.currentRound === roundNumber && timeline.livePlay === false;
}

/**
 * Returns the persisted round value used by tournament sync, including WD/DQ penalties.
 */
function getTournamentRoundScore(args: {
  golfer: EnhancedGolfer;
  roundNumber: RoundNumber;
  timeline: Pick<
    TournamentTimelineState,
    "currentRound" | "livePlay" | "status"
  >;
  coursePar: number;
  allowPreStartNonStarterReplacement: boolean;
}): number | undefined {
  if (
    isPreStartNonStarter({
      golfer: args.golfer,
      allowPreStartNonStarterReplacement:
        args.allowPreStartNonStarterReplacement,
    })
  ) {
    return undefined;
  }

  const position = getTournamentSyncPosition({
    golfer: args.golfer,
    allowPreStartNonStarterReplacement: args.allowPreStartNonStarterReplacement,
  });
  const completedScore = getCompletedRoundScore(args.golfer, args.roundNumber);

  if (isWithdrawnOrDisqualifiedPosition(position)) {
    if (
      args.roundNumber >= 3 ||
      !isRoundPublishedForTimeline(args.timeline, args.roundNumber)
    ) {
      return undefined;
    }
    if (typeof completedScore === "number") {
      return completedScore;
    }
    return args.coursePar + 8;
  }

  if (!isRoundPublishedForTimeline(args.timeline, args.roundNumber)) {
    return undefined;
  }

  if (typeof completedScore === "number") {
    return completedScore;
  }

  return undefined;
}

/**
 * Returns the score-to-par for a golfer round.
 */
function getRoundScoreToPar(
  score: number | undefined,
  coursePar: number,
): number | undefined {
  return typeof score === "number" ? score - coursePar : undefined;
}

/**
 * Returns round-specific today/thru values for the visible or overlap round window.
 */
export function getTournamentRoundWindowMetrics(args: {
  golfer: EnhancedGolfer;
  roundNumber: RoundNumber;
  roundStarted: boolean;
  timeline: Pick<
    TournamentTimelineState,
    "currentRound" | "livePlay" | "status"
  >;
  coursePar: number;
  allowPreStartNonStarterReplacement: boolean;
}): TeamRoundWindowMetrics {
  if (
    isPreStartNonStarter({
      golfer: args.golfer,
      allowPreStartNonStarterReplacement:
        args.allowPreStartNonStarterReplacement,
    })
  ) {
    return {};
  }

  const position = getTournamentSyncPosition({
    golfer: args.golfer,
    allowPreStartNonStarterReplacement: args.allowPreStartNonStarterReplacement,
  });
  const completedScore = getCompletedRoundScore(args.golfer, args.roundNumber);
  const completedToday = getRoundScoreToPar(completedScore, args.coursePar);
  const liveRound = getGolferLiveRound(args.golfer);
  const thru = getHoleCount(args.golfer.live?.thru);

  if (position === "CUT") {
    if (typeof completedToday === "number") {
      return { today: completedToday, thru: 18 };
    }
    if (liveRound > args.roundNumber) {
      return { today: 0, thru: 18 };
    }
    return {};
  }

  if (isNonRankingTournamentPosition(position)) {
    if (!isWithdrawnOrDisqualifiedPosition(position)) {
      return {};
    }
  }

  if (isWithdrawnOrDisqualifiedPosition(position)) {
    if (args.roundNumber >= 3) {
      return {};
    }
    if (typeof completedToday === "number") {
      return { today: completedToday, thru: 18 };
    }
    return args.roundStarted ? { today: 8, thru: 18 } : {};
  }

  if (liveRound > args.roundNumber) {
    return typeof completedToday === "number"
      ? { today: completedToday, thru: 18 }
      : {};
  }

  if (liveRound === args.roundNumber) {
    if (typeof thru === "number" && thru >= 18) {
      return typeof completedToday === "number"
        ? { today: completedToday, thru: 18 }
        : {
            today: args.golfer.live?.today ?? 0,
            thru: 18,
          };
    }

    return {
      today: args.golfer.live?.today ?? 0,
      thru: typeof thru === "number" ? thru : 0,
    };
  }

  if (
    typeof completedToday === "number" &&
    isRoundPublishedForTimeline(args.timeline, args.roundNumber)
  ) {
    return { today: completedToday, thru: 18 };
  }

  if (!args.roundStarted) {
    return {};
  }

  return { today: 0, thru: 0 };
}

/**
 * Returns whether a golfer should participate in the specified round window.
 */
function shouldIncludeGolferInTeamRoundWindow(args: {
  golfer: EnhancedGolfer;
  roundNumber: RoundNumber;
  roundStarted: boolean;
  timeline: Pick<
    TournamentTimelineState,
    "currentRound" | "livePlay" | "status"
  >;
  coursePar: number;
  allowPreStartNonStarterReplacement: boolean;
}): boolean {
  const position = getTournamentSyncPosition({
    golfer: args.golfer,
    allowPreStartNonStarterReplacement: args.allowPreStartNonStarterReplacement,
  });

  if (position === "CUT" || position === "") {
    return args.roundNumber < 3 && position !== "";
  }

  if (isWithdrawnOrDisqualifiedPosition(position)) {
    return args.roundNumber <= 2 && args.roundStarted;
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
  roundNumber: RoundNumber;
  allowPreStartNonStarterReplacement: boolean;
  eventIndex?: 0 | 1 | 2 | 3;
}): boolean {
  const eventIndex = args.eventIndex ?? 0;
  if (eventIndex <= 1 && args.roundNumber < 3) {
    return false;
  }

  return (
    args.golfers.filter((golfer) =>
      isWeekendEligibleTeamPosition(
        getTournamentSyncPosition({
          golfer,
          allowPreStartNonStarterReplacement:
            args.allowPreStartNonStarterReplacement,
        }),
      ),
    ).length <
    selectionCountByPlayoffTournamentRound(eventIndex, args.roundNumber)
  );
}

/**
 * Returns the golfers that should contribute to a team's live today/thru window.
 */
export function getTeamRoundWindowGolfers(args: {
  golfers: EnhancedGolfer[];
  roundNumber: RoundNumber;
  roundStarted: boolean;
  timeline: Pick<
    TournamentTimelineState,
    "currentRound" | "livePlay" | "status"
  >;
  coursePar: number;
  allowPreStartNonStarterReplacement: boolean;
  eventIndex?: 0 | 1 | 2 | 3;
}): EnhancedGolfer[] {
  if (
    isTeamWeekendCut({
      golfers: args.golfers,
      roundNumber: args.roundNumber,
      allowPreStartNonStarterReplacement:
        args.allowPreStartNonStarterReplacement,
      eventIndex: args.eventIndex,
    })
  ) {
    return [];
  }

  const selectionSize = selectionCountByPlayoffTournamentRound(
    args.eventIndex ?? 0,
    args.roundNumber,
  );

  return args.golfers
    .filter((golfer) =>
      shouldIncludeGolferInTeamRoundWindow({ ...args, golfer }),
    )
    .sort((a, b) => {
      const aMetrics = getTournamentRoundWindowMetrics({ ...args, golfer: a });
      const bMetrics = getTournamentRoundWindowMetrics({ ...args, golfer: b });
      const aToday = aMetrics.today ?? Number.POSITIVE_INFINITY;
      const bToday = bMetrics.today ?? Number.POSITIVE_INFINITY;
      if (aToday !== bToday) {
        return aToday - bToday;
      }

      const aThru = aMetrics.thru ?? Number.POSITIVE_INFINITY;
      const bThru = bMetrics.thru ?? Number.POSITIVE_INFINITY;
      if (aThru !== bThru) {
        return aThru - bThru;
      }

      return (
        (a.golfer?.apiId ?? Number.POSITIVE_INFINITY) -
        (b.golfer?.apiId ?? Number.POSITIVE_INFINITY)
      );
    })
    .slice(0, selectionSize);
}

/**
 * Returns the raw team live window mean used for score/today/thru calculations.
 */
function getTeamRoundWindowMean(args: {
  golfers: EnhancedGolfer[];
  roundNumber: RoundNumber;
  roundStarted: boolean;
  timeline: Pick<
    TournamentTimelineState,
    "currentRound" | "livePlay" | "status"
  >;
  coursePar: number;
  metric: "today" | "thru";
  allowPreStartNonStarterReplacement: boolean;
  eventIndex?: 0 | 1 | 2 | 3;
}): number | undefined {
  if (args.golfers.length === 0) {
    return undefined;
  }

  const selectionSize = selectionCountByPlayoffTournamentRound(
    args.eventIndex ?? 0,
    args.roundNumber,
  );
  const total = args.golfers.reduce((sum, golfer) => {
    const metrics = getTournamentRoundWindowMetrics({ ...args, golfer });
    return (
      sum +
      (args.metric === "today" ? (metrics.today ?? 0) : (metrics.thru ?? 0))
    );
  }, 0);

  return total / selectionSize;
}

/**
 * Returns whether a team has finished a round strongly enough to publish its round score.
 */
function isTeamRoundComplete(args: {
  golfers: EnhancedGolfer[];
  roundNumber: RoundNumber;
  timeline: Pick<
    TournamentTimelineState,
    "currentRound" | "livePlay" | "status"
  >;
  coursePar: number;
  allowPreStartNonStarterReplacement: boolean;
  eventIndex?: 0 | 1 | 2 | 3;
}): boolean {
  if (!isRoundPublishedForTimeline(args.timeline, args.roundNumber)) {
    return false;
  }

  const roundScores = args.golfers.map((golfer) =>
    getTournamentRoundScore({
      golfer,
      roundNumber: args.roundNumber,
      timeline: args.timeline,
      coursePar: args.coursePar,
      allowPreStartNonStarterReplacement:
        args.allowPreStartNonStarterReplacement,
    }),
  );

  const selectionSize = selectionCountByPlayoffTournamentRound(
    args.eventIndex ?? 0,
    args.roundNumber,
  );
  if (selectionSize === 10) {
    return roundScores.every((score) => typeof score === "number");
  }

  if (
    isTeamWeekendCut({
      golfers: args.golfers,
      roundNumber: args.roundNumber,
      allowPreStartNonStarterReplacement:
        args.allowPreStartNonStarterReplacement,
      eventIndex: args.eventIndex,
    })
  ) {
    return false;
  }

  return (
    roundScores.filter((score) => typeof score === "number").length >=
    selectionSize
  );
}

/**
 * Returns the published team round average once that round is complete.
 */
export function getTeamRoundScore(args: {
  golfers: EnhancedGolfer[];
  roundNumber: RoundNumber;
  timeline: Pick<
    TournamentTimelineState,
    "currentRound" | "livePlay" | "status"
  >;
  coursePar: number;
  allowPreStartNonStarterReplacement: boolean;
  eventIndex?: 0 | 1 | 2 | 3;
}): number | undefined {
  if (!isTeamRoundComplete(args)) {
    return undefined;
  }

  const roundScores = args.golfers
    .map((golfer) =>
      getTournamentRoundScore({
        golfer,
        roundNumber: args.roundNumber,
        timeline: args.timeline,
        coursePar: args.coursePar,
        allowPreStartNonStarterReplacement:
          args.allowPreStartNonStarterReplacement,
      }),
    )
    .filter((score): score is number => typeof score === "number");

  const selectionSize = selectionCountByPlayoffTournamentRound(
    args.eventIndex ?? 0,
    args.roundNumber,
  );

  if (selectionSize === 10) {
    return roundToDecimalPlace(
      (roundScores.reduce((sum, score) => sum + score, 0) ?? 0) / selectionSize,
      1,
    );
  }

  return roundToDecimalPlace(
    (roundScores
      .sort((a, b) => (a === 0 ? 500 : a) - (b === 0 ? 500 : b))
      .slice(0, selectionSize)
      .reduce((sum, score) => sum + score, 0) ?? 0) / selectionSize,
    1,
  );
}

function getPublishedTeamScoreToPar(
  team: {
    roundOne?: number | null;
    roundTwo?: number | null;
    roundThree?: number | null;
    roundFour?: number | null;
  },
  roundNumber: RoundNumber,
  coursePar: number,
): number {
  const score =
    roundNumber === 1
      ? team.roundOne
      : roundNumber === 2
        ? team.roundTwo
        : roundNumber === 3
          ? team.roundThree
          : team.roundFour;
  return typeof score === "number" ? score - coursePar : 0;
}

function getTeamPreviousStandingScore(args: {
  team: {
    roundOne?: number | null;
    roundTwo?: number | null;
    roundThree?: number | null;
    roundFour?: number | null;
    playoffCarryoverScore?: number | null;
  };
  timeline: Pick<TournamentTimelineState, "currentRound" | "status">;
  coursePar: number;
}): number {
  const carryover = args.team.playoffCarryoverScore ?? 0;
  if (args.timeline.status === "completed") {
    return (
      carryover +
      getPublishedTeamScoreToPar(args.team, 1, args.coursePar) +
      getPublishedTeamScoreToPar(args.team, 2, args.coursePar) +
      getPublishedTeamScoreToPar(args.team, 3, args.coursePar)
    );
  }

  if (args.timeline.currentRound <= 1) {
    return carryover;
  }

  let total = carryover;
  for (const round of TOURNAMENT_ROUNDS) {
    if (round >= args.timeline.currentRound) {
      break;
    }
    total += getPublishedTeamScoreToPar(args.team, round, args.coursePar);
  }
  return total;
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

  return hasTournamentPlayEvidence(golfer);
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
 * Derives the persisted golfer round from live/current tournament state.
 */
export function getTournamentGolferSyncRound(golfer: EnhancedGolfer): number {
  const storedRound = Number.isFinite(golfer.tournamentGolfer?.round)
    ? Number(golfer.tournamentGolfer?.round)
    : 0;
  if (storedRound > 4) {
    return storedRound;
  }

  const liveRound = getGolferLiveRound(golfer);
  const completedRounds = TOURNAMENT_ROUNDS.filter((round) =>
    hasGolferCompletedTournamentRound({ golfer, roundNumber: round }),
  );
  const furthestCompletedRound =
    completedRounds.length > 0 ? Math.max(...completedRounds) : 0;

  if (liveRound > 0) {
    return Math.max(Math.min(liveRound, 4), furthestCompletedRound);
  }

  return furthestCompletedRound;
}

/**
 * Derives the persisted team round from shared timeline state.
 */
export function getTournamentTeamSyncRound(args: {
  golfers: EnhancedGolfer[];
  existingRound?: number;
  existingStatus?: Doc<"tournaments">["status"];
}): number {
  return deriveTournamentTimelineState({
    golfers: args.golfers,
    existingRound: args.existingRound,
    existingStatus: args.existingStatus,
  }).currentRound;
}

/**
 * Derives the persisted tournament currentRound from team progression.
 */
export function getTournamentSyncCurrentRound(args: {
  teams: Array<{
    golfers: EnhancedGolfer[];
    round?: number;
  }>;
  existingStatus?: Doc<"tournaments">["status"];
  existingRound?: number;
}): number {
  return deriveTournamentTimelineState({
    golfers: args.teams.flatMap((team) => team.golfers),
    existingRound: args.existingRound,
    existingStatus: args.existingStatus,
  }).currentRound;
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
  return (
    args.datagolfLivePlay ||
    deriveTournamentTimelineState({
      golfers: args.teams.flatMap((team) => team.golfers),
    }).livePlay
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
  return deriveTournamentTimelineState({
    golfers: args.golfers,
    existingStatus: args.existingStatus,
    eventCompleted: args.eventCompleted,
  }).status;
}

/**
 * Returns only the tournament lifecycle fields that have actually changed.
 */
function getChangedTournamentLifecycleFields(args: {
  tournament: Doc<"tournaments">;
  startDate?: number;
  endDate?: number;
  status?: TournamentLifecycleStatus;
}): {
  startDate?: number;
  endDate?: number;
  status?: TournamentLifecycleStatus;
} | null {
  const update: {
    startDate?: number;
    endDate?: number;
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

  if (
    typeof args.endDate === "number" &&
    args.endDate !== args.tournament.endDate
  ) {
    update.endDate = args.endDate;
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
        internal.functions.datagolf.fetchDataGolfRankings,
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
    const actorMemberId = await requireAdminForAction(ctx);
    await ctx.runMutation(internal.functions.syncRuns.recordAdminInvocation, {
      memberId: actorMemberId,
      jobName: "update_golfer_world_ranks",
    });
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
        ctx.runAction(internal.functions.datagolf.fetchFieldUpdates, {
          tournament: tournamentForDataGolf,
        }),
        ctx.runAction(internal.functions.datagolf.fetchDataGolfRankings, {}),
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
    const actorMemberId = await requireAdminForAction(ctx);
    await ctx.runMutation(internal.functions.syncRuns.recordAdminInvocation, {
      memberId: actorMemberId,
      jobName: "create_tournament_groups",
    });
    return await ctx.runAction(
      internal.functions.cronJobs.runCreateGroupsForNextTournamentWithRetry,
      { attempt: 0, trigger: "manual", actorMemberId },
    );
  },
});

export const runCreateGroupsForNextTournamentWithRetry: ReturnType<
  typeof internalAction
> = internalAction({
  args: {
    attempt: v.optional(v.number()),
    trigger: v.optional(v.union(v.literal("scheduled"), v.literal("manual"))),
    actorMemberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const attempt = Math.min(Math.max(args.attempt ?? 0, 0), 2);
    const lease = await ctx.runMutation(internal.functions.syncRuns.acquire, {
      jobName: "create_tournament_groups",
      runKey: `create_tournament_groups:${new Date().toISOString().slice(0, 10)}:${attempt}`,
      trigger: args.trigger ?? "scheduled",
      actorMemberId: args.actorMemberId,
      leaseMs: 15 * 60_000,
    });
    if (!lease.acquired) {
      return { ok: true, skipped: true, reason: "already_running" };
    }
    try {
      const result = (await ctx.runAction(
        internal.functions.cronJobs.runCreateGroupsForNextTournament,
        {},
      )) as { skipped?: boolean; reason?: string };
      await ctx.runMutation(internal.functions.syncRuns.finalize, {
        runId: lease.runId,
        status: result.skipped ? "skipped" : "succeeded",
        skipReason: result.skipped ? result.reason : undefined,
      });
      if (result.skipped && attempt < 2) {
        await ctx.scheduler.runAfter(
          60 * 60_000,
          internal.functions.cronJobs.runCreateGroupsForNextTournamentWithRetry,
          { attempt: attempt + 1, trigger: "scheduled" },
        );
      }
      return result;
    } catch (error) {
      await ctx.runMutation(internal.functions.syncRuns.finalize, {
        runId: lease.runId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < 2) {
        await ctx.scheduler.runAfter(
          60 * 60_000,
          internal.functions.cronJobs.runCreateGroupsForNextTournamentWithRetry,
          { attempt: attempt + 1, trigger: "scheduled" },
        );
      }
      throw error;
    }
  },
});

/**
 * Recomputes season standings for all tour cards.
 *
 * What it does:
 * - Loads the requested season, defaulting to the current season.
 * - Aggregates regular-season completed team results into standings stats while keeping playoff earnings included.
 * - Assigns positions within each tour (with tie prefixes) and updates playoff qualification flags.
 */
export const recomputeStandings: ReturnType<typeof internalMutation> =
  internalMutation({
    args: {
      seasonId: v.optional(v.id("seasons")),
    },
    handler: async (ctx, args) => {
      const currentSeason = args.seasonId
        ? null
        : await ctx.runQuery(internal.functions.utils.getCurrentSeason);
      const season = args.seasonId
        ? await ctx.db.get(args.seasonId)
        : currentSeason?.ok
          ? currentSeason.season
          : null;

      if (args.seasonId && !season) {
        return {
          ok: true,
          skipped: true,
          reason: "season_not_found",
          seasonId: args.seasonId,
        } as const;
      }

      if (!season) {
        return {
          ok: true,
          skipped: true,
          reason: "no_current_season",
        } as const;
      }
      const tourCards = await ctx.db
        .query("tourCards")
        .withIndex("by_season", (q) =>
          q.eq("seasonId", season._id as Id<"seasons">),
        )
        .take(500);
      if (tourCards.length === 0) {
        return {
          ok: true,
          skipped: true,
          reason: "no_tour_cards",
          seasonId: season._id,
        } as const;
      }
      for (const tourCard of tourCards) {
        const existingContribution = await ctx.db
          .query("standingsContributions")
          .withIndex("by_tour_card_season", (q) =>
            q.eq("tourCardId", tourCard._id).eq("seasonId", season._id),
          )
          .first();
        if (!existingContribution) {
          const teams = await ctx.db
            .query("teams")
            .withIndex("by_tour_card", (q) => q.eq("tourCardId", tourCard._id))
            .take(100);
          for (const team of teams) {
            await upsertStandingsContributionForTeam(ctx, team);
          }
        }
        await recomputeStandingsRowForCard(ctx, tourCard._id);
      }
      await recomputeStandingsRanksForSeason(ctx, season._id);
      const playoffTeams = await ctx.runMutation(
        internal.functions.teams.reconcilePlayoffTeamsForSeason,
        { seasonId: season._id },
      );

      return {
        ok: true,
        skipped: false,
        seasonId: season._id,
        tourCardsUpdated: tourCards.length,
        playoffTeams,
      } as const;
    },
  });
export const recomputeStandings_Public: ReturnType<typeof mutation> = mutation({
  args: {
    seasonId: v.optional(v.id("seasons")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const actor = await getCurrentMember(ctx);
    await writeAuditLog(ctx, {
      memberId: actor._id,
      entityType: "maintenanceJob",
      entityId: "recompute_standings",
      action: "updated",
      changes: { invokedAt: Date.now() },
    });
    return await ctx.runMutation(
      internal.functions.cronJobs.recomputeStandings,
      {
        seasonId: args.seasonId,
      },
    );
  },
});

export const runTournamentSync: ReturnType<typeof internalAction> =
  internalAction({
    args: {
      force: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
      const now = new Date();
      if (args.force !== true && now.getHours() <= 10 && now.getHours() >= 2) {
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
      if (activeTournamentData.isPlayoff) {
        await ctx.runMutation(
          internal.functions.teams.reconcilePlayoffTeamsForSeason,
          { seasonId: activeTournamentData.tournament.seasonId },
        );
      }
      const syncState = await ctx.runQuery(
        internal.functions.tournamentSyncState.get,
        { tournamentId: activeTournamentData.tournament._id },
      );
      const previousDataGolfMarker =
        syncState?.dataGolfInPlayLastUpdate ??
        activeTournamentData.tournament.dataGolfInPlayLastUpdate;
      if (
        args.force !== true &&
        activeTournamentData.type !== "next" &&
        previousDataGolfMarker !== undefined
      ) {
        const liveProbe = await ctx.runAction(
          internal.functions.datagolf.fetchLiveModelPredictions,
          {
            tournament: {
              _id: activeTournamentData.tournament._id,
              name: activeTournamentData.tournament.name,
              apiId: activeTournamentData.tournament.apiId,
              seasonId: activeTournamentData.tournament.seasonId,
            },
          },
        );
        if (
          "info" in liveProbe &&
          liveProbe.info.last_update === previousDataGolfMarker
        ) {
          await syncEspnAfterDataGolfUpdate(
            ctx,
            activeTournamentData.tournament._id,
          );
          await ctx.runMutation(
            internal.functions.tournamentSyncState.recordUnchangedSuccess,
            {
              tournamentId: activeTournamentData.tournament._id,
              dataGolfInPlayLastUpdate: liveProbe.info.last_update,
              coalesceWithinMs: UNCHANGED_SYNC_HEARTBEAT_MS,
            },
          );
          return {
            ok: true,
            skipped: true,
            reason: "data_golf_unchanged",
            tournamentId: activeTournamentData.tournament._id,
            tournamentName: activeTournamentData.tournament.name,
            currentRound: activeTournamentData.tournament.currentRound,
            livePlay: activeTournamentData.tournament.livePlay ?? false,
            status: activeTournamentData.tournament.status,
          } as const;
        }
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
          includeStatic:
            args.force === true ||
            activeTournamentData.tournament.status !== "active",
          includeHistorical:
            activeTournamentData.tournament.endDate < Date.now() &&
            syncState?.finalDataComplete !== true,
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
        isPlayoff,
        eventIndex,
      } = activeTournamentData;
      const {
        teams,
        golfers,
        fieldData,
        liveData,
        historicalData,
        historicalEventData: _historicalEventData,
      } = tournamentStats;
      const shouldAwardResults = shouldAwardTournamentResults({
        isPlayoff,
        eventIndex,
      });

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
      const allowPreStartNonStarterReplacement =
        shouldApplyPreStartNonStarterReplacement({
          isPlayoff,
          eventIndex,
        });
      await applyPreStartNonStarterRosterReplacements(ctx, {
        teams,
        golfers,
        allowPreStartNonStarterReplacement,
      });
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
                await ctx.runMutation(
                  internal.functions.teams.updateTeamRoster,
                  {
                    teamId: t._id,
                    apiIds: [
                      ...t.golfers.map((g) => g.golfer?.apiId ?? -1),
                      availableGolfers[0].golfer?.apiId ?? -1,
                      availableGolfers[1].golfer?.apiId ?? -1,
                    ],
                  },
                );
              } else {
                await ctx.runMutation(
                  internal.functions.teams.updateTeamRoster,
                  {
                    teamId: t._id,
                    apiIds: [
                      ...t.golfers.map((g) => g.golfer?.apiId ?? -1),
                      availableGolfers[0].golfer?.apiId ?? -1,
                    ],
                  },
                );
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
          eventCompleted: isDataGolfEventCompleted(
            historicalData?.event_completed,
          ),
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
              {
                tournamentId: tournament._id,
                golfers: newGolfers,
              },
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
      const firstTeeTime =
        earliestTimeStr(
          golfers.map((golfer) => getGolferRoundOneTeeTimeMs(golfer)),
        ) ?? tournament.startDate;
      const timeline = deriveTournamentTimelineState({
        golfers,
        existingStatus: tournament.status,
        existingRound: tournament.currentRound,
        eventCompleted: isDataGolfEventCompleted(
          historicalData?.event_completed,
        ),
      });
      const feedCompleted = timeline.status === "completed";
      const visibleRound =
        timeline.currentRound >= 1 && timeline.currentRound <= 4
          ? (timeline.currentRound as RoundNumber)
          : feedCompleted
            ? 4
            : 0;
      const usageMap = buildUsageRateByGolferApiId({ teams });
      const golferUpdates: TournamentGolferUpdate[] = [];

      for (const g of golfers) {
        if (g.golfer?._id && g.tournamentGolfer?._id) {
          const golferIsPreStartNonStarter = isPreStartNonStarter({
            golfer: g,
            allowPreStartNonStarterReplacement,
          });
          const golferPosition = getTournamentSyncPosition({
            golfer: g,
            allowPreStartNonStarterReplacement,
          });
          const roundOneScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 1,
            timeline,
            coursePar: course.par,
            allowPreStartNonStarterReplacement,
          });
          const roundTwoScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 2,
            timeline,
            coursePar: course.par,
            allowPreStartNonStarterReplacement,
          });
          const roundThreeScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 3,
            timeline,
            coursePar: course.par,
            allowPreStartNonStarterReplacement,
          });
          const roundFourScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 4,
            timeline,
            coursePar: course.par,
            allowPreStartNonStarterReplacement,
          });
          const { betterGolfers, betterGolfersPast, tiedGolfers } =
            getGolferLeaderboardRankMetrics({
              golfer: g,
              golfers,
              allowPreStartNonStarterReplacement,
            });
          golferUpdates.push({
            _id: g.tournamentGolfer._id,
            tournamentId: tournament._id,
            golferId: g.golfer._id,
            position: golferIsPreStartNonStarter
              ? "WD"
              : isNonRankingTournamentPosition(golferPosition)
                ? golferPosition
                : tiedGolfers > 1
                  ? `T${betterGolfers + 1}`
                  : `${betterGolfers + 1}`,
            posChange: betterGolfersPast - betterGolfers,
            score: golferIsPreStartNonStarter
              ? undefined
              : getEffectiveGolferLeaderboardScore(g),
            endHole:
              g.live?.end_hole ?? g.tournamentGolfer?.endHole ?? undefined,
            makeCut:
              g.live?.make_cut ?? g.tournamentGolfer?.makeCut ?? undefined,
            topTen: g.live?.top_10 ?? g.tournamentGolfer?.topTen ?? undefined,
            win: g.live?.win ?? g.tournamentGolfer?.win ?? undefined,
            today:
              visibleRound === 0
                ? undefined
                : getTournamentRoundWindowMetrics({
                    golfer: g,
                    roundNumber: visibleRound,
                    roundStarted: timeline.rounds[visibleRound].started,
                    timeline,
                    coursePar: course.par,
                    allowPreStartNonStarterReplacement,
                  }).today,
            thru:
              visibleRound === 0
                ? undefined
                : getTournamentRoundWindowMetrics({
                    golfer: g,
                    roundNumber: visibleRound,
                    roundStarted: timeline.rounds[visibleRound].started,
                    timeline,
                    coursePar: course.par,
                    allowPreStartNonStarterReplacement,
                  }).thru,
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
            round: visibleRound,
          });
        }
      }
      for (const updates of chunkSyncUpdates(golferUpdates)) {
        await ctx.runMutation(
          internal.functions.golfers.applyTournamentGolferUpdatesBatch,
          { updates },
        );
      }
      const activeTournamentUpdatedTeams: TournamentSyncTeam[] = [];
      for (const t of teams) {
        const roundOne = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 1,
          timeline,
          coursePar: course.par,
          allowPreStartNonStarterReplacement,
          eventIndex,
        });
        const roundTwo = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 2,
          timeline,
          coursePar: course.par,
          allowPreStartNonStarterReplacement,
          eventIndex,
        });
        const roundThree = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 3,
          timeline,
          coursePar: course.par,
          allowPreStartNonStarterReplacement,
          eventIndex,
        });
        const roundFour = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 4,
          timeline,
          coursePar: course.par,
          allowPreStartNonStarterReplacement,
          eventIndex,
        });
        const teamWeekendCut = isTeamWeekendCut({
          golfers: t.golfers,
          roundNumber: visibleRound !== 0 ? visibleRound : 1,
          allowPreStartNonStarterReplacement,
          eventIndex,
        });
        const teamVisibleRoundGolfers =
          visibleRound === 0
            ? []
            : getTeamRoundWindowGolfers({
                golfers: t.golfers,
                roundNumber: visibleRound,
                roundStarted: timeline.rounds[visibleRound].started,
                timeline,
                coursePar: course.par,
                allowPreStartNonStarterReplacement,
                eventIndex,
              });
        const teamLiveTodayMean =
          visibleRound === 0
            ? undefined
            : getTeamRoundWindowMean({
                golfers: teamVisibleRoundGolfers,
                roundNumber: visibleRound,
                roundStarted: timeline.rounds[visibleRound].started,
                timeline,
                coursePar: course.par,
                metric: "today",
                allowPreStartNonStarterReplacement,
                eventIndex,
              });
        const teamLiveThruMean =
          visibleRound === 0
            ? undefined
            : getTeamRoundWindowMean({
                golfers: teamVisibleRoundGolfers,
                roundNumber: visibleRound,
                roundStarted: timeline.rounds[visibleRound].started,
                timeline,
                coursePar: course.par,
                metric: "thru",
                allowPreStartNonStarterReplacement,
                eventIndex,
              });
        const overlapTodayMean =
          timeline.overlapRound === undefined
            ? undefined
            : getTeamRoundWindowMean({
                golfers: getTeamRoundWindowGolfers({
                  golfers: t.golfers,
                  roundNumber: timeline.overlapRound,
                  roundStarted: timeline.rounds[timeline.overlapRound].started,
                  timeline,
                  coursePar: course.par,
                  allowPreStartNonStarterReplacement,
                  eventIndex,
                }),
                roundNumber: timeline.overlapRound,
                roundStarted: timeline.rounds[timeline.overlapRound].started,
                timeline,
                coursePar: course.par,
                metric: "today",
                allowPreStartNonStarterReplacement,
                eventIndex,
              });
        const completedScoreTotal =
          getPublishedTeamScoreToPar(
            { roundOne, roundTwo, roundThree, roundFour },
            1,
            course.par,
          ) +
          getPublishedTeamScoreToPar(
            { roundOne, roundTwo, roundThree, roundFour },
            2,
            course.par,
          ) +
          getPublishedTeamScoreToPar(
            { roundOne, roundTwo, roundThree, roundFour },
            3,
            course.par,
          ) +
          getPublishedTeamScoreToPar(
            { roundOne, roundTwo, roundThree, roundFour },
            4,
            course.par,
          );
        const liveScoreTotal =
          (timeline.livePlay ? (teamLiveTodayMean ?? 0) : 0) +
          (timeline.livePlay ? (overlapTodayMean ?? 0) : 0);

        activeTournamentUpdatedTeams.push({
          ...t,
          position: teamWeekendCut ? "CUT" : t.position,
          score:
            timeline.status === "upcoming"
              ? isPlayoff
                ? t.playoffCarryoverScore
                : undefined
              : roundToDecimalPlace(
                  (isPlayoff ? (t.playoffCarryoverScore ?? 0) : 0) +
                    completedScoreTotal +
                    liveScoreTotal,
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
          round: visibleRound,
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
      const firstPlaceTiebreakSummary = buildFirstPlaceTiebreakSummary({
        teams: activeTournamentUpdatedTeams,
        isPlayoff,
      });
      const persistedTournamentState = derivePersistedTournamentState({
        timeline,
        firstPlaceTiebreakSummary,
      });
      const tournamentStatus = persistedTournamentState.status;
      const tournamentCurrentRound = persistedTournamentState.currentRound;
      const tournamentLivePlay = persistedTournamentState.livePlay;
      const teamsWithComputedPositions = applyComputedTeamPositions({
        teams: activeTournamentUpdatedTeams,
        firstPlaceTiebreakSummary,
        tournamentCompleted: tournamentStatus === "completed",
        isPlayoff,
      });

      if (persistedTournamentState.holdReason) {
        console.log(
          "runTournamentSync: holding tournament active for first-place tiebreak",
          {
            tournamentId: tournament._id,
            tournamentName: tournament.name,
            reason: persistedTournamentState.holdReason,
            unresolvedTours: firstPlaceTiebreakSummary.unresolved.map(
              (resolution) => ({
                tourKey: resolution.tourKey,
                status: resolution.status,
                tiedTeamIds: resolution.tiedTeamIds,
              }),
            ),
          },
        );
      }

      const lifecycleUpdates = getChangedTournamentLifecycleFields({
        tournament,
        startDate: firstTeeTime,
        endDate:
          tournamentStatus === "completed" && tournament.status !== "completed"
            ? now.getTime()
            : undefined,
        status: tournamentStatus,
      });
      await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
        tournament: {
          _id: tournament._id,
          currentRound: tournamentCurrentRound,
          livePlay: tournamentLivePlay,
          ...(lifecycleUpdates ?? {}),
        },
      });
      const teamUpdates: TeamUpdate[] = [];
      for (const t of teamsWithComputedPositions) {
        if (t._id) {
          const teamsAheadPast = teamsWithComputedPositions.filter(
            (ut) =>
              getTeamCompetitionKey(ut, isPlayoff) ===
                getTeamCompetitionKey(t, isPlayoff) &&
              getTeamPreviousStandingScore({
                team: ut,
                timeline,
                coursePar: course.par,
              }) <
                getTeamPreviousStandingScore({
                  team: t,
                  timeline,
                  coursePar: course.par,
                }),
          ).length;
          const teamsTiedPast = teamsWithComputedPositions.filter(
            (ut) =>
              getTeamCompetitionKey(ut, isPlayoff) ===
                getTeamCompetitionKey(t, isPlayoff) &&
              getTeamPreviousStandingScore({
                team: ut,
                timeline,
                coursePar: course.par,
              }) ===
                getTeamPreviousStandingScore({
                  team: t,
                  timeline,
                  coursePar: course.par,
                }),
          ).length;
          const teamRank = getTeamTournamentRank({
            team: t,
            teams: teamsWithComputedPositions,
            firstPlaceTiebreakSummary,
            tournamentCompleted: tournamentStatus === "completed",
            isPlayoff,
          });
          teamUpdates.push({
            _id: t._id,
            makeCut: t.makeCut,
            score: t.score,
            topTen: t.topTen,
            topFive: t.topFive,
            topThree: t.topThree,
            win: t.win,
            today: t.today ?? null,
            thru: t.thru ?? null,
            round: t.round,
            roundOneTeeTime: t.roundOneTeeTime ?? null,
            roundOne: t.roundOne ?? null,
            roundTwoTeeTime: t.roundTwoTeeTime ?? null,
            roundTwo: t.roundTwo ?? null,
            roundThreeTeeTime: t.roundThreeTeeTime ?? null,
            roundThree: t.roundThree ?? null,
            roundFourTeeTime: t.roundFourTeeTime ?? null,
            roundFour: t.roundFour ?? null,
            earnings: shouldAwardResults
              ? awardTeamEarnings(
                  tier,
                  getTournamentPayoutAheadCount({
                    isPlayoff,
                    playoff: t.playoff,
                    teamsAhead: teamRank.teamsAhead,
                  }),
                  teamRank.teamsTied,
                )
              : 0,
            points: shouldAwardResults
              ? awardTeamPlayoffPoints(
                  tier,
                  teamRank.teamsAhead,
                  teamRank.teamsTied,
                )
              : 0,
            position: teamRank.position,
            pastPosition:
              teamsTiedPast > 1
                ? `T${teamsAheadPast + 1}`
                : `${teamsAheadPast + 1}`,
          });
        }
      }
      for (const updates of chunkSyncUpdates(teamUpdates)) {
        await ctx.runMutation(internal.functions.teams.applyTeamUpdatesBatch, {
          updates,
        });
      }

      await syncEspnAfterDataGolfUpdate(ctx, tournament._id);
      await ctx.runMutation(
        internal.functions.tournamentSyncState.recordSuccess,
        {
          tournamentId: tournament._id,
          dataGolfInPlayLastUpdate: liveData.info.last_update,
          leaderboardLastUpdatedAt:
            previousDataGolfMarker !== liveData.info.last_update
              ? now.getTime()
              : undefined,
          finalDataComplete:
            tournamentStatus === "completed" &&
            historicalData !== undefined &&
            _historicalEventData !== undefined,
        },
      );
      if (
        tournamentStatus === "completed" &&
        tournament.status !== "completed"
      ) {
        await ctx.runMutation(internal.functions.standings.refreshTournament, {
          tournamentId: tournament._id,
        });
        await ctx.runMutation(
          internal.functions.cronJobs.recomputeStandings,
          {},
        );
        await ctx.runMutation(
          internal.functions.readModels.rebuildMajorChampionBadgesForTournament,
          { tournamentId: tournament._id },
        );
        await ctx.runMutation(
          internal.functions.readModels.refreshAppState,
          {},
        );
        await ctx.runMutation(
          internal.functions.notifications.publishFinalResults,
          { tournamentId: tournament._id },
        );
      }

      return {
        ok: true,
        skipped: false,
        reason: persistedTournamentState.holdReason ?? "completed update",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        currentRound: tournamentCurrentRound,
        livePlay: tournamentLivePlay,
        status: tournamentStatus,
      };
    },
  });

export const runTournamentSyncWithLease: ReturnType<typeof internalAction> =
  internalAction({
    args: {
      force: v.optional(v.boolean()),
      trigger: v.optional(v.union(v.literal("scheduled"), v.literal("manual"))),
      actorMemberId: v.optional(v.id("members")),
    },
    handler: async (ctx, args): Promise<unknown> => {
      const now = Date.now();
      const trigger = args.trigger ?? "scheduled";
      const lease = await ctx.runMutation(internal.functions.syncRuns.acquire, {
        jobName: "tournament_sync",
        runKey: `tournament_sync:${Math.floor(now / (4 * 60_000))}`,
        trigger,
        actorMemberId: args.actorMemberId,
        leaseMs: 10 * 60_000,
      });
      if (!lease.acquired) {
        return {
          ok: true,
          skipped: true,
          reason: "already_running",
          runId: lease.runId,
        };
      }
      try {
        const result = (await ctx.runAction(
          internal.functions.cronJobs.runTournamentSync,
          { force: args.force },
        )) as {
          skipped?: boolean;
          reason?: string;
          tournamentId?: Id<"tournaments">;
        };
        await ctx.runMutation(internal.functions.syncRuns.finalize, {
          runId: lease.runId,
          status: result.skipped ? "skipped" : "succeeded",
          skipReason: result.skipped ? result.reason : undefined,
          coalesceWithinMs:
            trigger === "scheduled" &&
            result.skipped &&
            result.reason === "data_golf_unchanged"
              ? UNCHANGED_SYNC_HEARTBEAT_MS
              : undefined,
        });
        return result;
      } catch (error) {
        await ctx.runMutation(internal.functions.syncRuns.finalize, {
          runId: lease.runId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  });

/**
 * Refreshes only the next event's opening tee time while picks are open.
 * The cron remains cheap between events because it exits before calling DataGolf.
 */
export const runTournamentPreflight: ReturnType<typeof internalAction> =
  internalAction({
    args: {},
    handler: async (ctx): Promise<unknown> => {
      const now = Date.now();
      const tournamentData = await ctx.runQuery(
        internal.functions.utils.getActiveTournamentData,
        {},
      );
      if (
        !tournamentData.ok ||
        !shouldRunTournamentPreflight({
          tournamentType: tournamentData.type,
          tournamentStatus: tournamentData.tournament.status,
          startDate: tournamentData.tournament.startDate,
          endDate: tournamentData.tournament.endDate,
          nowMs: now,
        })
      ) {
        return {
          ok: true,
          skipped: true,
          reason: tournamentData.ok
            ? "outside_preflight_window"
            : "no_tournament",
        } as const;
      }

      const tournament = tournamentData.tournament;
      const lease = await ctx.runMutation(internal.functions.syncRuns.acquire, {
        jobName: "tournament_preflight",
        runKey: `tournament_preflight:${Math.floor(now / TOURNAMENT_PREFLIGHT_INTERVAL_MS)}`,
        trigger: "scheduled",
        tournamentId: tournament._id,
        leaseMs: 10 * 60_000,
      });
      if (!lease.acquired) {
        return {
          ok: true,
          skipped: true,
          reason: "already_running",
          runId: lease.runId,
        } as const;
      }

      try {
        const fieldData = await ctx.runAction(
          internal.functions.datagolf.fetchFieldUpdates,
          {
            tournament: {
              _id: tournament._id,
              name: tournament.name,
              apiId: tournament.apiId,
              seasonId: tournament.seasonId,
            },
          },
        );
        if (!("field" in fieldData)) {
          await ctx.runMutation(internal.functions.syncRuns.finalize, {
            runId: lease.runId,
            status: "skipped",
            skipReason: fieldData.reason,
          });
          return fieldData;
        }

        const openingTeeTime = getFieldRoundOneTeeTimeMs(fieldData.field);
        if (openingTeeTime === undefined) {
          await ctx.runMutation(internal.functions.syncRuns.finalize, {
            runId: lease.runId,
            status: "skipped",
            skipReason: "missing_round_one_tee_time",
          });
          return {
            ok: true,
            skipped: true,
            reason: "missing_round_one_tee_time",
            tournamentId: tournament._id,
          } as const;
        }

        const update = await ctx.runMutation(
          internal.functions.utils.updateTournamentInfo,
          {
            tournament: {
              _id: tournament._id,
              startDate: openingTeeTime,
            },
          },
        );
        if (update.changed || openingTeeTime <= Date.now()) {
          await ctx.runMutation(
            internal.functions.readModels.refreshAppState,
            {},
          );
        }
        if (openingTeeTime <= Date.now()) {
          await ctx.scheduler.runAfter(
            0,
            internal.functions.cronJobs.runAdaptiveTournamentSync,
            {
              chainId: `tournament:${tournament._id}`,
              repair: true,
              tournamentId: tournament._id,
              scheduledFor: openingTeeTime,
            },
          );
        }

        await ctx.runMutation(internal.functions.syncRuns.finalize, {
          runId: lease.runId,
          status: update.changed ? "succeeded" : "skipped",
          changedRows: update.changed ? 1 : 0,
          skipReason: update.changed ? undefined : "tee_time_unchanged",
          coalesceWithinMs: update.changed ? undefined : 6 * 60 * 60_000,
        });
        return {
          ok: true,
          skipped: !update.changed,
          reason: update.changed
            ? "opening_tee_time_updated"
            : "tee_time_unchanged",
          tournamentId: tournament._id,
          previousStartDate: tournament.startDate,
          startDate: openingTeeTime,
        } as const;
      } catch (error) {
        await ctx.runMutation(internal.functions.syncRuns.finalize, {
          runId: lease.runId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  });

export const runAdaptiveTournamentSync: ReturnType<typeof internalAction> =
  internalAction({
    args: {
      chainId: v.string(),
      repair: v.boolean(),
      tournamentId: v.optional(v.id("tournaments")),
      scheduledFor: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<unknown> => {
      const claim = await ctx.runMutation(
        internal.functions.readModels.claimLiveSyncChain,
        args,
      );
      if (!claim.claimed) {
        return { ok: true, skipped: true, reason: claim.reason };
      }
      if (args.chainId === "repair" && !claim.activeTournamentId) {
        await ctx.runMutation(
          internal.functions.readModels.finishLiveSyncChain,
          { chainId: args.chainId },
        );
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        };
      }
      let result: {
        skipped?: boolean;
        reason?: string;
        status?: string;
        livePlay?: boolean;
      };
      try {
        result = (await ctx.runAction(
          internal.functions.cronJobs.runTournamentSyncWithLease,
          { trigger: "scheduled" },
        )) as typeof result;
      } catch (error) {
        if (!claim.activeTournamentId) {
          await ctx.runMutation(
            internal.functions.readModels.finishLiveSyncChain,
            { chainId: args.chainId },
          );
          throw error;
        }
        const failureCount = await ctx.runMutation(
          internal.functions.tournamentSyncState.recordFailure,
          {
            tournamentId: claim.activeTournamentId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        const delay = getAdaptiveSyncDelayMs({ failureCount });
        await ctx.scheduler.runAfter(
          delay ?? 30 * 60_000,
          internal.functions.cronJobs.runAdaptiveTournamentSync,
          {
            chainId: args.chainId,
            repair: false,
            ...(args.tournamentId
              ? {
                  tournamentId: args.tournamentId,
                  scheduledFor: args.scheduledFor,
                }
              : {}),
          },
        );
        return {
          ok: false,
          reason: "sync_failed_retry_scheduled",
          failureCount,
        };
      }
      const activatedTournament =
        result.reason === "next_tournament_toggled_to_active";
      if (activatedTournament) {
        await ctx.runMutation(
          internal.functions.readModels.refreshAppState,
          {},
        );
      }
      const nextDelay = getAdaptiveSyncDelayMs({
        activatedTournament,
        status: result.status,
        livePlay: result.livePlay,
      });
      if (nextDelay !== null) {
        await ctx.scheduler.runAfter(
          nextDelay,
          internal.functions.cronJobs.runAdaptiveTournamentSync,
          {
            chainId: args.chainId,
            repair: false,
            ...(args.tournamentId
              ? {
                  tournamentId: args.tournamentId,
                  scheduledFor: args.scheduledFor,
                }
              : {}),
          },
        );
      } else {
        await ctx.runMutation(
          internal.functions.readModels.finishLiveSyncChain,
          { chainId: args.chainId },
        );
      }
      return result;
    },
  });

export const runTournamentSync_Public: ReturnType<typeof action> = action({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actorMemberId = await requireAdminForAction(ctx);
    await ctx.runMutation(internal.functions.syncRuns.recordAdminInvocation, {
      memberId: actorMemberId,
      jobName: "tournament_sync",
    });
    return await ctx.runAction(
      internal.functions.cronJobs.runTournamentSyncWithLease,
      { force: args.force, trigger: "manual", actorMemberId },
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
      if (activeTournamentData.isPlayoff) {
        await ctx.runMutation(
          internal.functions.teams.reconcilePlayoffTeamsForSeason,
          { seasonId: activeTournamentData.tournament.seasonId },
        );
      }
      const syncState = await ctx.runQuery(
        internal.functions.tournamentSyncState.get,
        { tournamentId: activeTournamentData.tournament._id },
      );
      await ctx.runMutation(
        internal.functions.tournamentSyncState.recordAttempt,
        { tournamentId: activeTournamentData.tournament._id },
      );
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
          includeStatic: false,
          includeHistorical: syncState?.finalDataComplete !== true,
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
        isPlayoff,
        eventIndex,
      } = activeTournamentData;
      const {
        teams,
        golfers,
        fieldData,
        liveData,
        historicalData,
        historicalEventData: _historicalEventData,
      } = tournamentStats;
      const shouldAwardResults = shouldAwardTournamentResults({
        isPlayoff,
        eventIndex,
      });

      const allowPreStartNonStarterReplacement =
        shouldApplyPreStartNonStarterReplacement({
          isPlayoff,
          eventIndex,
        });
      await applyPreStartNonStarterRosterReplacements(ctx, {
        teams,
        golfers,
        allowPreStartNonStarterReplacement,
      });

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
                await ctx.runMutation(
                  internal.functions.teams.updateTeamRoster,
                  {
                    teamId: t._id,
                    apiIds: [
                      ...t.golfers.map((g) => g.golfer?.apiId ?? -1),
                      availableGolfers[0].golfer?.apiId ?? -1,
                      availableGolfers[1].golfer?.apiId ?? -1,
                    ],
                  },
                );
              } else {
                await ctx.runMutation(
                  internal.functions.teams.updateTeamRoster,
                  {
                    teamId: t._id,
                    apiIds: [
                      ...t.golfers.map((g) => g.golfer?.apiId ?? -1),
                      availableGolfers[0].golfer?.apiId ?? -1,
                    ],
                  },
                );
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
          eventCompleted: isDataGolfEventCompleted(
            historicalData?.event_completed,
          ),
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
              {
                tournamentId: tournament._id,
                golfers: newGolfers,
              },
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
      const firstTeeTime =
        earliestTimeStr(
          golfers.map((golfer) => getGolferRoundOneTeeTimeMs(golfer)),
        ) ?? tournament.startDate;
      const timeline = deriveTournamentTimelineState({
        golfers,
        existingStatus: tournament.status,
        existingRound: tournament.currentRound,
        eventCompleted: isDataGolfEventCompleted(
          historicalData?.event_completed,
        ),
      });
      const feedCompleted = timeline.status === "completed";
      const visibleRound =
        timeline.currentRound >= 1 && timeline.currentRound <= 4
          ? (timeline.currentRound as RoundNumber)
          : feedCompleted
            ? 4
            : 0;
      const usageMap = buildUsageRateByGolferApiId({ teams });
      const golferUpdates: TournamentGolferUpdate[] = [];

      for (const g of golfers) {
        if (g.golfer?._id && g.tournamentGolfer?._id) {
          const golferIsPreStartNonStarter = isPreStartNonStarter({
            golfer: g,
            allowPreStartNonStarterReplacement,
          });
          const golferPosition = getTournamentSyncPosition({
            golfer: g,
            allowPreStartNonStarterReplacement,
          });
          const roundOneScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 1,
            timeline,
            coursePar: course.par,
            allowPreStartNonStarterReplacement,
          });
          const roundTwoScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 2,
            timeline,
            coursePar: course.par,
            allowPreStartNonStarterReplacement,
          });
          const roundThreeScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 3,
            timeline,
            coursePar: course.par,
            allowPreStartNonStarterReplacement,
          });
          const roundFourScore = getTournamentRoundScore({
            golfer: g,
            roundNumber: 4,
            timeline,
            coursePar: course.par,
            allowPreStartNonStarterReplacement,
          });
          const { betterGolfers, betterGolfersPast, tiedGolfers } =
            getGolferLeaderboardRankMetrics({
              golfer: g,
              golfers,
              allowPreStartNonStarterReplacement,
            });
          golferUpdates.push({
            _id: g.tournamentGolfer._id,
            tournamentId: tournament._id,
            golferId: g.golfer._id,
            position: golferIsPreStartNonStarter
              ? "WD"
              : isNonRankingTournamentPosition(golferPosition)
                ? golferPosition
                : tiedGolfers > 1
                  ? `T${betterGolfers + 1}`
                  : `${betterGolfers + 1}`,
            posChange: betterGolfersPast - betterGolfers,
            score: golferIsPreStartNonStarter
              ? undefined
              : getEffectiveGolferLeaderboardScore(g),
            endHole:
              g.live?.end_hole ?? g.tournamentGolfer?.endHole ?? undefined,
            makeCut:
              g.live?.make_cut ?? g.tournamentGolfer?.makeCut ?? undefined,
            topTen: g.live?.top_10 ?? g.tournamentGolfer?.topTen ?? undefined,
            win: g.live?.win ?? g.tournamentGolfer?.win ?? undefined,
            today:
              visibleRound === 0
                ? undefined
                : getTournamentRoundWindowMetrics({
                    golfer: g,
                    roundNumber: visibleRound,
                    roundStarted: timeline.rounds[visibleRound].started,
                    timeline,
                    coursePar: course.par,
                    allowPreStartNonStarterReplacement,
                  }).today,
            thru:
              visibleRound === 0
                ? undefined
                : getTournamentRoundWindowMetrics({
                    golfer: g,
                    roundNumber: visibleRound,
                    roundStarted: timeline.rounds[visibleRound].started,
                    timeline,
                    coursePar: course.par,
                    allowPreStartNonStarterReplacement,
                  }).thru,
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
            round: visibleRound,
          });
        }
      }
      for (const updates of chunkSyncUpdates(golferUpdates)) {
        await ctx.runMutation(
          internal.functions.golfers.applyTournamentGolferUpdatesBatch,
          { updates },
        );
      }
      const updatedTeams: TournamentSyncTeam[] = [];
      for (const t of teams) {
        const roundOne = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 1,
          timeline,
          coursePar: course.par,
          allowPreStartNonStarterReplacement,
          eventIndex,
        });
        const roundTwo = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 2,
          timeline,
          coursePar: course.par,
          allowPreStartNonStarterReplacement,
          eventIndex,
        });
        const roundThree = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 3,
          timeline,
          coursePar: course.par,
          allowPreStartNonStarterReplacement,
          eventIndex,
        });
        const roundFour = getTeamRoundScore({
          golfers: t.golfers,
          roundNumber: 4,
          timeline,
          coursePar: course.par,
          allowPreStartNonStarterReplacement,
          eventIndex,
        });
        const teamWeekendCut = isTeamWeekendCut({
          golfers: t.golfers,
          roundNumber: visibleRound !== 0 ? visibleRound : 1,
          allowPreStartNonStarterReplacement,
          eventIndex,
        });
        const teamVisibleRoundGolfers =
          visibleRound === 0
            ? []
            : getTeamRoundWindowGolfers({
                golfers: t.golfers,
                roundNumber: visibleRound,
                roundStarted: timeline.rounds[visibleRound].started,
                timeline,
                coursePar: course.par,
                allowPreStartNonStarterReplacement,
                eventIndex,
              });
        const teamLiveTodayMean =
          visibleRound === 0
            ? undefined
            : getTeamRoundWindowMean({
                golfers: teamVisibleRoundGolfers,
                roundNumber: visibleRound,
                roundStarted: timeline.rounds[visibleRound].started,
                timeline,
                coursePar: course.par,
                metric: "today",
                allowPreStartNonStarterReplacement,
                eventIndex,
              });
        const teamLiveThruMean =
          visibleRound === 0
            ? undefined
            : getTeamRoundWindowMean({
                golfers: teamVisibleRoundGolfers,
                roundNumber: visibleRound,
                roundStarted: timeline.rounds[visibleRound].started,
                timeline,
                coursePar: course.par,
                metric: "thru",
                allowPreStartNonStarterReplacement,
                eventIndex,
              });
        const overlapTodayMean =
          timeline.overlapRound === undefined
            ? undefined
            : getTeamRoundWindowMean({
                golfers: getTeamRoundWindowGolfers({
                  golfers: t.golfers,
                  roundNumber: timeline.overlapRound,
                  roundStarted: timeline.rounds[timeline.overlapRound].started,
                  timeline,
                  coursePar: course.par,
                  allowPreStartNonStarterReplacement,
                  eventIndex,
                }),
                roundNumber: timeline.overlapRound,
                roundStarted: timeline.rounds[timeline.overlapRound].started,
                timeline,
                coursePar: course.par,
                metric: "today",
                allowPreStartNonStarterReplacement,
                eventIndex,
              });
        const completedScoreTotal =
          getPublishedTeamScoreToPar(
            { roundOne, roundTwo, roundThree, roundFour },
            1,
            course.par,
          ) +
          getPublishedTeamScoreToPar(
            { roundOne, roundTwo, roundThree, roundFour },
            2,
            course.par,
          ) +
          getPublishedTeamScoreToPar(
            { roundOne, roundTwo, roundThree, roundFour },
            3,
            course.par,
          ) +
          getPublishedTeamScoreToPar(
            { roundOne, roundTwo, roundThree, roundFour },
            4,
            course.par,
          );
        const liveScoreTotal =
          (timeline.livePlay ? (teamLiveTodayMean ?? 0) : 0) +
          (timeline.livePlay ? (overlapTodayMean ?? 0) : 0);

        updatedTeams.push({
          ...t,
          position: teamWeekendCut ? "CUT" : t.position,
          score:
            timeline.status === "upcoming"
              ? isPlayoff
                ? t.playoffCarryoverScore
                : undefined
              : roundToDecimalPlace(
                  (isPlayoff ? (t.playoffCarryoverScore ?? 0) : 0) +
                    completedScoreTotal +
                    liveScoreTotal,
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
          round: visibleRound,
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
      const firstPlaceTiebreakSummary = buildFirstPlaceTiebreakSummary({
        teams: updatedTeams,
        isPlayoff,
      });
      const persistedTournamentState = derivePersistedTournamentState({
        timeline,
        firstPlaceTiebreakSummary,
      });
      const tournamentStatus = persistedTournamentState.status;
      const tournamentCurrentRound = persistedTournamentState.currentRound;
      const tournamentLivePlay = persistedTournamentState.livePlay;
      const teamsWithComputedPositions = applyComputedTeamPositions({
        teams: updatedTeams,
        firstPlaceTiebreakSummary,
        tournamentCompleted: tournamentStatus === "completed",
        isPlayoff,
      });

      if (persistedTournamentState.holdReason) {
        console.log(
          "updatePreviousTournament: holding tournament active for first-place tiebreak",
          {
            tournamentId: tournament._id,
            tournamentName: tournament.name,
            reason: persistedTournamentState.holdReason,
            unresolvedTours: firstPlaceTiebreakSummary.unresolved.map(
              (resolution) => ({
                tourKey: resolution.tourKey,
                status: resolution.status,
                tiedTeamIds: resolution.tiedTeamIds,
              }),
            ),
          },
        );
      }

      const lifecycleUpdates = getChangedTournamentLifecycleFields({
        tournament,
        startDate: firstTeeTime,
        endDate:
          tournamentStatus === "completed" && tournament.status !== "completed"
            ? now.getTime()
            : undefined,
        status: tournamentStatus,
      });
      await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
        tournament: {
          _id: tournament._id,
          currentRound: tournamentCurrentRound,
          livePlay: tournamentLivePlay,
          ...(lifecycleUpdates ?? {}),
        },
      });

      const teamUpdates: TeamUpdate[] = [];
      for (const t of teamsWithComputedPositions) {
        if (t._id) {
          const teamsAheadPast = teamsWithComputedPositions.filter(
            (ut) =>
              getTeamCompetitionKey(ut, isPlayoff) ===
                getTeamCompetitionKey(t, isPlayoff) &&
              getTeamPreviousStandingScore({
                team: ut,
                timeline,
                coursePar: course.par,
              }) <
                getTeamPreviousStandingScore({
                  team: t,
                  timeline,
                  coursePar: course.par,
                }),
          ).length;
          const teamsTiedPast = teamsWithComputedPositions.filter(
            (ut) =>
              getTeamCompetitionKey(ut, isPlayoff) ===
                getTeamCompetitionKey(t, isPlayoff) &&
              getTeamPreviousStandingScore({
                team: ut,
                timeline,
                coursePar: course.par,
              }) ===
                getTeamPreviousStandingScore({
                  team: t,
                  timeline,
                  coursePar: course.par,
                }),
          ).length;
          const teamRank = getTeamTournamentRank({
            team: t,
            teams: teamsWithComputedPositions,
            firstPlaceTiebreakSummary,
            tournamentCompleted: tournamentStatus === "completed",
            isPlayoff,
          });
          teamUpdates.push({
            _id: t._id,
            makeCut: t.makeCut,
            score: t.score,
            topTen: t.topTen,
            topFive: t.topFive,
            topThree: t.topThree,
            win: t.win,
            today: t.today ?? null,
            thru: t.thru ?? null,
            round: t.round,
            roundOneTeeTime: t.roundOneTeeTime ?? null,
            roundOne: t.roundOne ?? null,
            roundTwoTeeTime: t.roundTwoTeeTime ?? null,
            roundTwo: t.roundTwo ?? null,
            roundThreeTeeTime: t.roundThreeTeeTime ?? null,
            roundThree: t.roundThree ?? null,
            roundFourTeeTime: t.roundFourTeeTime ?? null,
            roundFour: t.roundFour ?? null,
            earnings: shouldAwardResults
              ? awardTeamEarnings(
                  tier,
                  getTournamentPayoutAheadCount({
                    isPlayoff,
                    playoff: t.playoff,
                    teamsAhead: teamRank.teamsAhead,
                  }),
                  teamRank.teamsTied,
                )
              : 0,
            points: shouldAwardResults
              ? awardTeamPlayoffPoints(
                  tier,
                  teamRank.teamsAhead,
                  teamRank.teamsTied,
                )
              : 0,
            position: teamRank.position,
            pastPosition:
              teamsTiedPast > 1
                ? `T${teamsAheadPast + 1}`
                : `${teamsAheadPast + 1}`,
          });
        }
      }
      for (const updates of chunkSyncUpdates(teamUpdates)) {
        await ctx.runMutation(internal.functions.teams.applyTeamUpdatesBatch, {
          updates,
        });
      }

      await syncEspnAfterDataGolfUpdate(ctx, tournament._id);
      await ctx.runMutation(
        internal.functions.tournamentSyncState.recordSuccess,
        {
          tournamentId: tournament._id,
          dataGolfInPlayLastUpdate: liveData.info.last_update,
          leaderboardLastUpdatedAt:
            (syncState?.dataGolfInPlayLastUpdate ??
              tournament.dataGolfInPlayLastUpdate) !== liveData.info.last_update
              ? now.getTime()
              : undefined,
          finalDataComplete:
            tournamentStatus === "completed" &&
            historicalData !== undefined &&
            _historicalEventData !== undefined,
        },
      );
      if (tournamentStatus === "completed") {
        await ctx.runMutation(internal.functions.standings.refreshTournament, {
          tournamentId: tournament._id,
        });
        await ctx.runMutation(
          internal.functions.cronJobs.recomputeStandings,
          {},
        );
        await ctx.runMutation(
          internal.functions.readModels.rebuildMajorChampionBadgesForTournament,
          { tournamentId: tournament._id },
        );
        await ctx.runMutation(
          internal.functions.readModels.refreshAppState,
          {},
        );
        await ctx.runMutation(
          internal.functions.notifications.publishFinalResults,
          { tournamentId: tournament._id },
        );
      }

      return {
        ok: true,
        skipped: false,
        reason: persistedTournamentState.holdReason ?? "completed update",
        tournamentId: tournament._id,
        tournamentName: tournament.name,
        currentRound: tournamentCurrentRound,
        livePlay: tournamentLivePlay,
        status: tournamentStatus,
      };
    },
  });
export const updatePreviousTournament_Public: ReturnType<typeof action> =
  action({
    args: { tournamentId: v.id("tournaments") },
    handler: async (ctx, args) => {
      const actorMemberId = await requireAdminForAction(ctx);
      await ctx.runMutation(internal.functions.syncRuns.recordAdminInvocation, {
        memberId: actorMemberId,
        jobName: "repair_tournament",
      });
      return await ctx.runAction(
        internal.functions.cronJobs.updatePreviousTournament,
        {
          tournamentId: args.tournamentId,
        },
      );
    },
  });
