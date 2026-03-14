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

export const updateGolfersWorldRankFromDataGolfInput_Public: ReturnType<
  typeof action
> = action({
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.crons.golfers.updateGolfersWorldRankFromDataGolfInput,
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

export const runCreateGroupsForNextTournament_Public: ReturnType<
  typeof action
> = action({
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.crons.groups.runCreateGroupsForNextTournament,
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

export const recomputeStandings_Public: ReturnType<typeof mutation> = mutation({
  handler: async (ctx) => {
    return await ctx.runMutation(
      internal.crons.standings.recomputeStandings,
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
      await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
        tournament: {
          _id: tournament._id,
          currentRound: (!isRoundRunning ? 0.5 : 0) + currentRound,
          livePlay: isRoundRunning,
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
                round:
                  (!isRoundRunning ? 0.5 : 0) +
                  (((g.live?.R1 ?? g.historical?.round_1?.score ?? 0) > 0 &&
                    (g.live?.R2 ?? g.historical?.round_2?.score ?? 0) > 0 &&
                    (g.live?.R3 ?? g.historical?.round_3?.score ?? 0) > 0 &&
                    (g.live?.R4 ?? g.historical?.round_4?.score ?? 0) > 0) ||
                  ["CUT", "WD", "DQ"].includes(
                    g.live?.current_pos ?? g.historical?.fin_text ?? "",
                  )
                    ? 5
                    : (g.live?.R1 ?? g.historical?.round_1?.score ?? 0) > 0 &&
                        (g.live?.R2 ?? g.historical?.round_2?.score ?? 0) > 0 &&
                        (g.live?.R3 ?? g.historical?.round_3?.score ?? 0) > 0 &&
                        (g.live?.thru === "F"
                          ? 18
                          : parseInt(g.live?.thru ?? "0")) > 0
                      ? 4
                      : (g.live?.R1 ?? g.historical?.round_1?.score ?? 0) > 0 &&
                          (g.live?.R2 ?? g.historical?.round_2?.score ?? 0) >
                            0 &&
                          (g.live?.thru === "F"
                            ? 18
                            : parseInt(g.live?.thru ?? "0")) > 0
                        ? 3
                        : (g.live?.R1 ?? g.historical?.round_1?.score ?? 0) >
                              0 &&
                            (g.live?.thru === "F"
                              ? 18
                              : parseInt(g.live?.thru ?? "0")) > 0
                          ? 2
                          : (g.live?.thru === "F"
                                ? 18
                                : parseInt(g.live?.thru ?? "0")) > 0
                            ? 1
                            : 0),
              },
            },
          );
        }
      }
      const updatedTeams: (Doc<"teams"> & {
        tour?: Doc<"tours">;
        tourCard?: Doc<"tourCards">;
      })[] = [];
      for (const t of teams) {
        currentRound = Math.max(
          ...t.golfers.map((g) => g.live?.round ?? (g.historical ? 5 : 0)),
          0,
        );
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

        updatedTeams.push({
          ...t,
          score: roundToDecimalPlace(
            (roundOne && roundOne > 0 ? roundOne - course.par : 0) +
              (roundTwo && roundTwo > 0 ? roundTwo - course.par : 0) +
              (roundThree && roundThree > 0 ? roundThree - course.par : 0) +
              (roundFour && roundFour > 0 ? roundFour - course.par : 0) +
              (isRoundRunning
                ? (t.golfers
                    .filter((g) =>
                      shouldIncludeGolferInTeamLiveWindow({
                        golfer: g,
                        currentRound,
                        isRoundRunning,
                        coursePar: course.par,
                      }),
                    )
                    .sort(
                      (a, b) =>
                        (getTournamentTodayValue({
                          golfer: a,
                          currentRound,
                          isRoundRunning,
                          coursePar: course.par,
                        }) ?? 500) -
                        (getTournamentTodayValue({
                          golfer: b,
                          currentRound,
                          isRoundRunning,
                          coursePar: course.par,
                        }) ?? 500),
                    )
                    .slice(0, currentRound >= 3 ? 5 : 10)
                    .reduce(
                      (sum, val) =>
                        (sum ?? 0) +
                        (getTournamentTodayValue({
                          golfer: val,
                          currentRound,
                          isRoundRunning,
                          coursePar: course.par,
                        }) ?? 0),
                      0,
                    ) ?? 0) / (currentRound >= 3 ? 5 : 10)
                : 0),
            1,
          ),
          today: roundToDecimalPlace(
            (t.golfers
              .filter((g) =>
                shouldIncludeGolferInTeamLiveWindow({
                  golfer: g,
                  currentRound,
                  isRoundRunning,
                  coursePar: course.par,
                }),
              )
              .sort((a, b) => {
                const aToday =
                  getTournamentTodayValue({
                    golfer: a,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 500;
                const bToday =
                  getTournamentTodayValue({
                    golfer: b,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 500;
                return aToday - bToday;
              })
              .slice(0, currentRound >= 3 ? 5 : 10)
              .reduce(
                (sum, val) =>
                  (sum ?? 0) +
                  (getTournamentTodayValue({
                    golfer: val,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 0),
                0,
              ) ?? 0) / (currentRound >= 3 ? 5 : 10),
            1,
          ),
          thru: roundToDecimalPlace(
            (t.golfers
              .filter((g) =>
                shouldIncludeGolferInTeamLiveWindow({
                  golfer: g,
                  currentRound,
                  isRoundRunning,
                  coursePar: course.par,
                }),
              )
              .sort(
                (a, b) =>
                  (getTournamentTodayValue({
                    golfer: a,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 500) -
                  (getTournamentTodayValue({
                    golfer: b,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 500),
              )
              .slice(0, currentRound >= 3 ? 5 : 10)
              .reduce(
                (sum, val) =>
                  (sum ?? 0) +
                  (getTournamentThruValue({
                    golfer: val,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 0),
                0,
              ) ?? 0) / (currentRound >= 3 ? 5 : 10),
            1,
          ),
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
          roundThreeTeeTime: earliestTimeStr(
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
          roundFourTeeTime: earliestTimeStr(
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
                    : ((typeof g.tournamentGolfer?.roundFourTeeTime === "number"
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
          const teamsAhead = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id && (ut.score ?? 0) < (t.score ?? 0),
          ).length;
          const teamsAheadPast = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id &&
              (ut.score ?? 0) - (ut.today ?? 0) <
                (t.score ?? 0) - (t.today ?? 0),
          ).length;
          const teamsTied = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id &&
              (ut.score ?? 0) === (t.score ?? 0),
          ).length;
          const teamsTiedPast = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id &&
              (ut.score ?? 0) - (ut.today ?? 0) ===
                (t.score ?? 0) - (t.today ?? 0),
          ).length;
          if (teamsAhead === 0 && teamsTied > 0) {
            // TODO Implement golfers earnings tiebreaker
          }
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
              earnings: awardTeamEarnings(tier, teamsAhead, teamsTied),
              points: awardTeamPlayoffPoints(tier, teamsAhead, teamsTied),
              position:
                teamsTied > 1 ? `T${teamsAhead + 1}` : `${teamsAhead + 1}`,
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
      await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
        tournament: {
          _id: tournament._id,
          currentRound: (!isRoundRunning ? 0.5 : 0) + currentRound,
          livePlay: isRoundRunning,
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
                round:
                  (!isRoundRunning ? 0.5 : 0) +
                  (((g.live?.R1 ?? g.historical?.round_1?.score ?? 0) > 0 &&
                    (g.live?.R2 ?? g.historical?.round_2?.score ?? 0) > 0 &&
                    (g.live?.R3 ?? g.historical?.round_3?.score ?? 0) > 0 &&
                    (g.live?.R4 ?? g.historical?.round_4?.score ?? 0) > 0) ||
                  ["CUT", "WD", "DQ"].includes(
                    g.live?.current_pos ?? g.historical?.fin_text ?? "",
                  )
                    ? 5
                    : (g.live?.R1 ?? g.historical?.round_1?.score ?? 0) > 0 &&
                        (g.live?.R2 ?? g.historical?.round_2?.score ?? 0) > 0 &&
                        (g.live?.R3 ?? g.historical?.round_3?.score ?? 0) > 0 &&
                        (g.live?.thru === "F"
                          ? 18
                          : parseInt(g.live?.thru ?? "0")) > 0
                      ? 4
                      : (g.live?.R1 ?? g.historical?.round_1?.score ?? 0) > 0 &&
                          (g.live?.R2 ?? g.historical?.round_2?.score ?? 0) >
                            0 &&
                          (g.live?.thru === "F"
                            ? 18
                            : parseInt(g.live?.thru ?? "0")) > 0
                        ? 3
                        : (g.live?.R1 ?? g.historical?.round_1?.score ?? 0) >
                              0 &&
                            (g.live?.thru === "F"
                              ? 18
                              : parseInt(g.live?.thru ?? "0")) > 0
                          ? 2
                          : (g.live?.thru === "F"
                                ? 18
                                : parseInt(g.live?.thru ?? "0")) > 0
                            ? 1
                            : 0),
              },
            },
          );
        }
      }
      const updatedTeams: (Doc<"teams"> & {
        tour?: Doc<"tours">;
        tourCard?: Doc<"tourCards">;
      })[] = [];
      for (const t of teams) {
        currentRound = Math.max(
          ...t.golfers.map((g) => g.live?.round ?? (g.historical ? 5 : 0)),
          0,
        );
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

        updatedTeams.push({
          ...t,
          score: roundToDecimalPlace(
            (roundOne && roundOne > 0 ? roundOne - course.par : 0) +
              (roundTwo && roundTwo > 0 ? roundTwo - course.par : 0) +
              (roundThree && roundThree > 0 ? roundThree - course.par : 0) +
              (roundFour && roundFour > 0 ? roundFour - course.par : 0) +
              (isRoundRunning
                ? (t.golfers
                    .filter((g) =>
                      shouldIncludeGolferInTeamLiveWindow({
                        golfer: g,
                        currentRound,
                        isRoundRunning,
                        coursePar: course.par,
                      }),
                    )
                    .sort(
                      (a, b) =>
                        (getTournamentTodayValue({
                          golfer: a,
                          currentRound,
                          isRoundRunning,
                          coursePar: course.par,
                        }) ?? 500) -
                        (getTournamentTodayValue({
                          golfer: b,
                          currentRound,
                          isRoundRunning,
                          coursePar: course.par,
                        }) ?? 500),
                    )
                    .slice(0, currentRound >= 3 ? 5 : 10)
                    .reduce(
                      (sum, val) =>
                        (sum ?? 0) +
                        (getTournamentTodayValue({
                          golfer: val,
                          currentRound,
                          isRoundRunning,
                          coursePar: course.par,
                        }) ?? 0),
                      0,
                    ) ?? 0) / (currentRound >= 3 ? 5 : 10)
                : 0),
            1,
          ),
          today: roundToDecimalPlace(
            (t.golfers
              .filter((g) =>
                shouldIncludeGolferInTeamLiveWindow({
                  golfer: g,
                  currentRound,
                  isRoundRunning,
                  coursePar: course.par,
                }),
              )
              .sort((a, b) => {
                const aToday =
                  getTournamentTodayValue({
                    golfer: a,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 500;
                const bToday =
                  getTournamentTodayValue({
                    golfer: b,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 500;
                return aToday - bToday;
              })
              .slice(0, currentRound >= 3 ? 5 : 10)
              .reduce(
                (sum, val) =>
                  (sum ?? 0) +
                  (getTournamentTodayValue({
                    golfer: val,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 0),
                0,
              ) ?? 0) / (currentRound >= 3 ? 5 : 10),
            1,
          ),
          thru: roundToDecimalPlace(
            (t.golfers
              .filter((g) =>
                shouldIncludeGolferInTeamLiveWindow({
                  golfer: g,
                  currentRound,
                  isRoundRunning,
                  coursePar: course.par,
                }),
              )
              .sort(
                (a, b) =>
                  (getTournamentTodayValue({
                    golfer: a,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 500) -
                  (getTournamentTodayValue({
                    golfer: b,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 500),
              )
              .slice(0, currentRound >= 3 ? 5 : 10)
              .reduce(
                (sum, val) =>
                  (sum ?? 0) +
                  (getTournamentThruValue({
                    golfer: val,
                    currentRound,
                    isRoundRunning,
                    coursePar: course.par,
                  }) ?? 0),
                0,
              ) ?? 0) / (currentRound >= 3 ? 5 : 10),
            1,
          ),
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
          roundThreeTeeTime: earliestTimeStr(
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
          roundFourTeeTime: earliestTimeStr(
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
                    : ((typeof g.tournamentGolfer?.roundFourTeeTime === "number"
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
          const teamsAhead = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id && (ut.score ?? 0) < (t.score ?? 0),
          ).length;
          const teamsAheadPast = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id &&
              (ut.score ?? 0) - (ut.today ?? 0) <
                (t.score ?? 0) - (t.today ?? 0),
          ).length;
          const teamsTied = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id &&
              (ut.score ?? 0) === (t.score ?? 0),
          ).length;
          const teamsTiedPast = updatedTeams.filter(
            (ut) =>
              ut.tour?._id === t.tour?._id &&
              (ut.score ?? 0) - (ut.today ?? 0) ===
                (t.score ?? 0) - (t.today ?? 0),
          ).length;
          if (teamsAhead === 0 && teamsTied > 0) {
            // TODO Implement golfers earnings tiebreaker
          }
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
              earnings: awardTeamEarnings(tier, teamsAhead, teamsTied),
              points: awardTeamPlayoffPoints(tier, teamsAhead, teamsTied),
              position:
                teamsTied > 1 ? `T${teamsAhead + 1}` : `${teamsAhead + 1}`,
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
