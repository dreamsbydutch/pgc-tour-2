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
  DataGolfLiveModelPlayer,
  DataGolfRankedPlayer,
} from "../types/datagolf";
import { EXCLUDED_GOLFER_IDS, GROUP_LIMITS } from "./_constants";
import {
  checkCompatabilityOfEventNames,
  isRoundRunningFromLiveStats,
  normalizePlayerNameFromDataGolf,
  parseThruFromLiveModel,
} from "../utils/datagolf";
import { parsePositionNumber } from "../utils";
import { determineGroupIndex } from "../utils/golfers";
import { EnhancedTournamentDoc } from "../types/types";

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
        rankings: rankingsList.map((r) => ({
          dg_id: r.dg_id,
          owgr_rank: r.owgr_rank,
          player_name: r.player_name,
          country: r.country,
        })),
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
 * Keeps the application's "active tournament" in sync with DataGolf.
 *
 * What it does:
 * - Loads the currently active tournament (and exits quickly if none exist).
 * - Fetches the DataGolf live model predictions for PGA.
 * - Fetches rankings (and field updates when the tournament hasn't started yet).
 * - Runs the server-side live sync mutation to update tournament golfers/live state.
 * - Runs the teams update job every time; recomputes standings when the tournament completes.
 *
 * Failure behavior:
 * - If DataGolf fetches fail, returns `{ ok: false }` so the cron run is visible in logs.
 */
export const runLiveTournamentSync: ReturnType<typeof internalAction> =
  internalAction({
    handler: async (ctx) => {
      const tournament = (await ctx.runQuery(
        internal.functions.tournaments.getTournaments_Internal,
        { tournamentType: "active", includeCourse: true },
      )) as EnhancedTournamentDoc | null;

      if (!tournament) {
        console.log("runLiveTournamentSync: skipped (no_active_tournament)");
        return {
          ok: true,
          skipped: true,
          reason: "no_active_tournament",
        } as const;
      }

      const tournamentStarted =
        (tournament.status ?? null) === "active" ||
        (tournament.status ?? null) === "completed" ||
        tournament.livePlay === true ||
        Date.now() >= tournament.startDate;

      let inPlay: unknown;
      try {
        inPlay = await ctx.runAction(
          api.functions.datagolf.fetchLiveModelPredictions,
          { options: { tour: "pga" } },
        );
      } catch (err) {
        return {
          ok: false,
          skipped: false,
          reason: "datagolf_fetch_failed",
          tournamentId: tournament._id,
          error: err instanceof Error ? err.message : String(err),
        } as const;
      }

      const inPlayInfo = (inPlay as { info?: unknown } | null | undefined)
        ?.info as
        | {
            last_update?: string;
            current_round?: number;
            event_name?: string;
          }
        | undefined;

      const dataGolfInPlayLastUpdate = inPlayInfo?.last_update;
      const dataGolfCurrentRound = inPlayInfo?.current_round;
      const liveStatsData = (inPlay as { data?: unknown } | null | undefined)
        ?.data;
      const liveStats: DataGolfLiveModelPlayer[] = Array.isArray(liveStatsData)
        ? (liveStatsData as DataGolfLiveModelPlayer[])
        : [];
      const roundIsRunning = isRoundRunningFromLiveStats(
        liveStats.map((a) => ({
          current_pos: a.current_pos,
          thru: parseThruFromLiveModel(a.thru),
        })),
      );
      const inferredCurrentRound =
        liveStats.length > 0
          ? liveStats.reduce(
              (max, player) =>
                Math.max(max, Number.isFinite(player.round) ? player.round : 0),
              0,
            )
          : 0;
      const resolvedCurrentRound = Math.max(
        Number.isFinite(dataGolfCurrentRound) ? (dataGolfCurrentRound ?? 0) : 0,
        inferredCurrentRound,
      );
      const tournamentCompletedFromLiveStats =
        liveStats.length > 0 && !roundIsRunning;

      if (!roundIsRunning) {
        const previousLastUpdate = tournament.dataGolfInPlayLastUpdate;

        if (
          !dataGolfInPlayLastUpdate ||
          dataGolfInPlayLastUpdate === previousLastUpdate
        ) {
          if (tournamentCompletedFromLiveStats) {
            console.log(
              "runLiveTournamentSync: proceeding (no_active_round_but_completed)",
              {
                tournamentId: tournament._id,
                lastUpdate: dataGolfInPlayLastUpdate,
                previousLastUpdate,
                liveStats: liveStats.length,
              },
            );
          } else {
            const shouldForceFinalize =
              (tournament.status ?? null) !== "completed" &&
              (tournament.currentRound ?? 1) >= 4;

            if (shouldForceFinalize) {
              console.log(
                "runLiveTournamentSync: proceeding (no_active_round_force_finalize)",
                {
                  tournamentId: tournament._id,
                  tournamentName: tournament.name,
                  currentRound: tournament.currentRound,
                  status: tournament.status,
                  lastUpdate: dataGolfInPlayLastUpdate,
                  previousLastUpdate,
                  liveStats: liveStats.length,
                },
              );
            } else {
              console.log(
                "runLiveTournamentSync: skipped (no_active_round_no_changes)",
                {
                  tournamentId: tournament._id,
                  dataGolfEventName: inPlayInfo?.event_name,
                  currentRound: inPlayInfo?.current_round,
                  lastUpdate: dataGolfInPlayLastUpdate,
                  previousLastUpdate,
                  liveStats: liveStats.length,
                },
              );

              return {
                ok: true,
                skipped: true,
                reason: "no_active_round_no_changes",
                tournamentId: tournament._id,
                lastUpdate: dataGolfInPlayLastUpdate,
                previousLastUpdate,
              };
            }
          }
        }

        console.log(
          "runLiveTournamentSync: proceeding (no_active_round_but_new_update)",
          {
            tournamentId: tournament._id,
            lastUpdate: dataGolfInPlayLastUpdate,
            previousLastUpdate,
          },
        );
      }
      console.log("runLiveTournamentSync: start", {
        tournamentId: tournament._id,
        tournamentName: tournament.name,
      });

      let fieldUpdates: unknown = null;
      let rankings: unknown = null;
      try {
        [fieldUpdates, rankings] = await Promise.all([
          tournamentStarted
            ? Promise.resolve(null)
            : ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
                options: { tour: "pga" },
              }),
          ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
        ]);
      } catch (err) {
        return {
          ok: false,
          skipped: false,
          reason: "datagolf_fetch_failed",
          tournamentId: tournament._id,
          error: err instanceof Error ? err.message : String(err),
        } as const;
      }

      const field = (fieldUpdates as { field?: unknown } | null | undefined)
        ?.field;
      const rankingsList = Array.isArray(
        (rankings as { rankings?: unknown }).rankings,
      )
        ? ((rankings as { rankings: unknown[] })
            .rankings as DataGolfRankedPlayer[])
        : [];

      const safeField = Array.isArray(field) ? field : [];
      console.log("runLiveTournamentSync: datagolf payload sizes", {
        field: safeField.length,
        rankings: rankingsList.length,
        liveStats: liveStats.length,
      });

      const dataGolfEventName =
        inPlayInfo?.event_name ??
        (!tournamentStarted
          ? (fieldUpdates as { event_name?: string } | null | undefined)
              ?.event_name
          : undefined);

      if (tournament.name && dataGolfEventName) {
        const compatible = checkCompatabilityOfEventNames(
          tournament.name,
          dataGolfEventName,
        );

        if (!compatible.ok) {
          console.log("runLiveTournamentSync: event_name_mismatch (skipped)", {
            tournamentId: tournament._id,
            tournamentName: tournament.name,
            dataGolfEventName,
            score: compatible.score,
            intersection: compatible.intersection,
          });

          return {
            ok: true,
            skipped: true,
            reason: "event_name_mismatch",
            tournamentId: tournament._id,
            tournamentName: tournament.name,
            dataGolfEventName,
            score: compatible.score,
            intersection: compatible.intersection,
          } as const;
        }
      }

      const live = await ctx.runMutation(
        internal.functions.datagolf.applyDataGolfLiveSync,
        {
          tournamentId: tournament._id,
          currentRound:
            (resolvedCurrentRound > 0 ? resolvedCurrentRound : undefined) ??
            (!tournamentStarted && fieldUpdates
              ? (fieldUpdates as { current_round: number }).current_round
              : undefined),
          field: Array.isArray(field) ? (field as DataGolfFieldPlayer[]) : [],
          rankings: rankingsList,
          liveStats,
          eventName: dataGolfEventName ?? undefined,
          dataGolfInPlayLastUpdate,
          roundIsRunning,
        },
      );
      const teams = await ctx.runAction(
        internal.functions.teams.runTeamsUpdateForTournament,
        { tournamentId: tournament._id },
      );
      const tournamentCompleted = live?.tournamentCompleted === true;
      const standings = tournamentCompleted
        ? await ctx.runMutation(
            internal.functions.cronJobs.recomputeStandingsForCurrentSeason,
            {},
          )
        : null;

      console.log("runLiveTournamentSync: finished", {
        tournamentId: tournament._id,
        live,
        teams,
        standings,
      });

      return {
        ok: true,
        skipped: false,
        tournamentId: tournament._id,
        live,
        teams,
        standings,
      };
    },
  });
export const runLiveTournamentSync_Public: ReturnType<typeof action> = action({
  handler: async (ctx) => {
    return await ctx.runAction(
      internal.functions.cronJobs.runLiveTournamentSync,
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
    const target = (await ctx.runQuery(
      internal.functions.tournaments.getTournaments_Internal,
      { tournamentType: "next", includePlayoffs: true },
    )) as EnhancedTournamentDoc | null;

    if (
      target?.isPlayoff &&
      (target?.eventIndex ?? 0) > 1 &&
      target?.playoffEvents
    ) {
      const createResult = await ctx.runMutation(
        internal.functions.tournaments.duplicateFromPreviousPlayoff,
        {
          currentTournamentId: target._id ?? "",
          previousPlayoffTournamentId:
            target?.playoffEvents[(target?.eventIndex ?? 2) - 2],
        },
      );

      return {
        ok: true,
        tournamentId: target._id ?? "",
        createGroups: createResult,
      };
    }

    let fieldUpdates: unknown;
    let rankings: unknown;
    try {
      [fieldUpdates, rankings] = await Promise.all([
        ctx.runAction(api.functions.datagolf.fetchFieldUpdates, {
          options: { tour: "pga" },
        }),
        ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
      ]);
    } catch (err) {
      return {
        ok: false,
        skipped: false,
        reason: "datagolf_fetch_failed",
        tournamentId: target?._id ?? null,
        error: err instanceof Error ? err.message : String(err),
      } as const;
    }

    const dataGolfEventName = (fieldUpdates as { event_name?: unknown })
      ?.event_name;

    if (!target || target?._id === undefined || target?._id === null) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_tournament",
      };
    }
    if (typeof dataGolfEventName !== "string" || !dataGolfEventName.trim()) {
      return {
        ok: true,
        skipped: true,
        reason: "missing_datagolf_event_name",
        tournamentId: target?._id ?? "",
        tournamentName: target?.name ?? "",
      } as const;
    }

    const compatible = checkCompatabilityOfEventNames(
      target?.name ?? "",
      dataGolfEventName,
    );
    if (!compatible.ok) {
      return {
        ok: true,
        skipped: true,
        reason: "event_name_mismatch",
        tournamentId: target?._id ?? "",
        tournamentName: target?.name ?? "",
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
      internal.functions.golfers.createTournamentGolfersForTournament,
      {
        tournamentId: target._id,
        groups: groups.map((group, idx) => ({
          groupNumber: idx + 1,
          golfers: group.map((g) => ({
            dgId: g.dg_id,
            playerName: normalizePlayerNameFromDataGolf(g.player_name),
            country: g.country,
            worldRank: g.ranking?.owgr_rank,
            ...(typeof g.r1_teetime === "string" && g.r1_teetime.trim().length
              ? {
                  r1TeeTime: g.r1_teetime,
                }
              : {}),
            skillEstimate: g.ranking?.dg_skill_estimate,
          })),
        })),
      },
    );

    return {
      ok: true,
      tournamentId: target?._id ?? "",
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
 * - Aggregates completed team results into per-tour-card totals (points, earnings, wins, top tens, cuts).
 * - Assigns positions within each tour (with tie prefixes) and updates playoff qualification flags.
 */
export const recomputeStandingsForCurrentSeason = internalMutation({
  handler: async (ctx) => {
    const currentSeason: {
      ok: boolean;
      skipped: boolean;
      season?: Doc<"seasons">;
    } = await ctx.runQuery(
      internal.functions.seasons.getCurrentSeason_Internal,
    );

    if (!currentSeason.ok || !currentSeason.season) {
      return {
        ok: true,
        skipped: true,
        reason: "no_current_season",
      } as const;
    }

    const tourCards = await ctx.db
      .query("tourCards")
      .withIndex("by_season", (q) =>
        q.eq("seasonId", currentSeason.season?._id as Id<"seasons">),
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

        const completed = teams
          .filter((t) => (t.round ?? 0) > 4)
          .sort((a, b) => a._creationTime - b._creationTime);

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
export const recomputeStandingsForCurrentSeason_Public: ReturnType<
  typeof mutation
> = mutation({
  handler: async (ctx) => {
    return await ctx.runMutation(
      internal.functions.cronJobs.recomputeStandingsForCurrentSeason,
      {},
    );
  },
});
