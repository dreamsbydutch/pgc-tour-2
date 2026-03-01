import { action, internalAction, internalMutation } from "../_generated/server";
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

    let fieldUpdates: unknown;
    let rankings: unknown;
    try {
      [fieldUpdates, rankings] = await Promise.all([
        ctx.runAction(api.functions.datagolf.fetchFieldUpdates, { tournament }),
        ctx.runAction(api.functions.datagolf.fetchDataGolfRankings, {}),
      ]);
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
 * - Aggregates completed team results into per-tour-card totals (points, earnings, wins, top tens, cuts).
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
export const recomputeStandings_Public: ReturnType<typeof action> = action({
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
      if (now.getHours() <= 11 || now.getHours() >= 24) {
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
        isPlayoff,
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
        if (
          Math.abs(tournament.startDate - now.getTime()) >
          1000 * 60 * 60 * 24 * 6
        ) {
          console.log(
            "runTournamentSync: skipped (next_tournament_not_starting_soon)",
            {
              tournamentId: tournament._id,
              tournamentName: tournament.name,
              startDate: tournament.startDate,
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
        if (tournament.startDate < now.getTime()) {
          console.log(
            "runTournamentSync: skipped (next_tournament_toggled_to_active)",
            {
              tournamentId: tournament._id,
              tournamentName: tournament.name,
              startDate: tournament.startDate,
            },
          );
          await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
            tournament: {
              _id: tournament._id,
              status: "active",
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
          const openingTeeTime = fieldData.field
            .map((g) => g.teetimes.find((tt) => tt.round_num === 1)?.teetime)
            .filter((t): t is number => typeof t === "number")
            .sort((a, b) => a - b)[0];
          await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
            tournament: {
              _id: tournament._id,
              startDate: openingTeeTime,
            },
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
      var currentRound = liveData.info
        ? liveData.info.current_round
        : historicalData.event_completed
          ? 5
          : 0;
      var isRoundRunning = liveData.info
        ? isRoundRunningFromLiveStats(
            golfers.map((g) => ({
              current_pos:
                g.live?.current_pos ?? g.historical?.fin_text ?? undefined,
              thru: parseFloat(g.live?.thru ?? ""),
            })),
          )
        : false;
      const firstTeeTime = earliestTimeStr(
        golfers
          .map((g) =>
            g.field && !!!g.field.teetimes.find((tt) => tt.round_num === 1)
              ? g.field.teetimes.find((tt) => tt.round_num === 1)?.teetime
              : g.historical && g.historical.round_1
                ? g.historical.round_1.teetime
                : undefined,
          )
          .filter((t): t is number => typeof t === "number"),
      );
      await ctx.runMutation(internal.functions.utils.updateTournamentInfo, {
        tournament: {
          _id: tournament._id,
          currentRound: (!isRoundRunning ? 0.5 : 0) + currentRound,
          livePlay: isRoundRunning,
          status:
            (currentRound > 1 && currentRound < 4) ||
            (currentRound === 1 && isRoundRunning) ||
            (currentRound === 4 && isRoundRunning)
              ? "active"
              : currentRound >= 4 && !isRoundRunning
                ? "completed"
                : currentRound <= 1
                  ? "upcoming"
                  : undefined,
          startDate: firstTeeTime,
        },
      });
      const usageMap = buildUsageRateByGolferApiId({ teams });
      console.log(golfers);

      for (const g of golfers) {
        if (g.golfer?._id && g.tournamentGolfer?._id) {
          const betterGolfers = golfers.filter(
            (og) =>
              (["CUT", "WD", "DQ", ""].includes(og.live?.current_pos ?? "")
                ? 999
                : (og.live?.current_score ?? 0)) <
              (["CUT", "WD", "DQ", ""].includes(g.live?.current_pos ?? "")
                ? 999
                : (g.live?.current_score ?? 0)),
          ).length;
          const betterGolfersPast = golfers.filter(
            (og) =>
              (["CUT", "WD", "DQ", ""].includes(og.live?.current_pos ?? "")
                ? 999
                : (og.live?.current_score ?? 0) - (og.live?.today ?? 0)) <
              (["CUT", "WD", "DQ", ""].includes(g.live?.current_pos ?? "")
                ? 999
                : (g.live?.current_score ?? 0) - (g.live?.today ?? 0)),
          ).length;
          const tiedGolfers = golfers.filter(
            (og) =>
              (["CUT", "WD", "DQ", ""].includes(og.live?.current_pos ?? "")
                ? 999
                : (og.live?.current_score ?? 0)) ===
              (["CUT", "WD", "DQ", ""].includes(g.live?.current_pos ?? "")
                ? 999
                : (g.live?.current_score ?? 0)),
          ).length;
          await ctx.runMutation(
            internal.functions.golfers.updateTournamentGolfer,
            {
              tournamentGolfer: {
                _id: g.tournamentGolfer._id,
                tournamentId: tournament._id,
                golferId: g.golfer._id,
                position: ["CUT", "WD", "DQ", ""].includes(
                  g.live?.current_pos ?? "",
                )
                  ? g.live?.current_pos
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
                today: ["CUT", "WD", "DQ", ""].includes(
                  g.live?.current_pos ??
                    g.historical?.fin_text ??
                    g.tournamentGolfer?.position ??
                    "",
                )
                  ? undefined
                  : (g.live?.today ??
                    (currentRound === 4
                      ? (g.historical?.round_4?.score ?? 0) -
                        (g.historical?.round_4?.course_par ?? 0)
                      : (g.tournamentGolfer?.today ?? undefined))),
                thru: ["CUT", "WD", "DQ", ""].includes(
                  g.live?.current_pos ??
                    g.historical?.fin_text ??
                    g.tournamentGolfer?.position ??
                    "",
                )
                  ? undefined
                  : g.live?.thru
                    ? parseInt(g.live?.thru)
                    : !isRoundRunning
                      ? 18
                      : 0,
                roundOne:
                  currentRound > 1 || (currentRound === 1 && !isRoundRunning)
                    ? g.live?.R1 && g.live.R1 > 0
                      ? g.live.R1
                      : g.historical?.round_1?.score &&
                          g.historical.round_1.score > 0
                        ? g.historical.round_1.score
                        : g.tournamentGolfer?.roundOne &&
                            g.tournamentGolfer.roundOne > 0
                          ? g.tournamentGolfer.roundOne
                          : course.par + 8
                    : undefined,
                roundTwo:
                  currentRound > 2 || (currentRound === 2 && !isRoundRunning)
                    ? g.live?.R2 && g.live.R2 > 0
                      ? g.live.R2
                      : g.historical?.round_2?.score &&
                          g.historical.round_2.score > 0
                        ? g.historical.round_2.score
                        : g.tournamentGolfer?.roundTwo &&
                            g.tournamentGolfer.roundTwo > 0
                          ? g.tournamentGolfer.roundTwo
                          : course.par + 8
                    : undefined,
                roundThree:
                  currentRound > 3 || (currentRound === 3 && !isRoundRunning)
                    ? g.live?.R3 && g.live.R3 > 0
                      ? g.live.R3
                      : g.historical?.round_3?.score &&
                          g.historical.round_3.score > 0
                        ? g.historical.round_3.score
                        : g.tournamentGolfer?.roundThree &&
                            g.tournamentGolfer.roundThree > 0
                          ? g.tournamentGolfer.roundThree
                          : undefined
                    : undefined,
                roundFour:
                  currentRound > 4 || (currentRound === 4 && !isRoundRunning)
                    ? g.live?.R4 && g.live.R4 > 0
                      ? g.live.R4
                      : g.historical?.round_4?.score &&
                          g.historical.round_4.score > 0
                        ? g.historical.round_4.score
                        : g.tournamentGolfer?.roundFour &&
                            g.tournamentGolfer.roundFour > 0
                          ? g.tournamentGolfer.roundFour
                          : undefined
                    : undefined,
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
        const roundOne =
          currentRound > 1 || (currentRound === 1 && !isRoundRunning)
            ? roundToDecimalPlace(
                (t.golfers
                  .map(
                    (x) =>
                      x.live?.R1 ??
                      x.historical?.round_1?.score ??
                      x.tournamentGolfer?.roundOne,
                  )
                  .reduce((sum, val) => (sum ?? 0) + (val ?? 0), 0) ?? 0) / 10,
                1,
              )
            : undefined;
        const roundTwo =
          currentRound > 2 || (currentRound === 2 && !isRoundRunning)
            ? roundToDecimalPlace(
                (t.golfers
                  .map(
                    (x) =>
                      x.live?.R2 ??
                      x.historical?.round_2?.score ??
                      x.tournamentGolfer?.roundTwo,
                  )
                  .reduce((sum, val) => (sum ?? 0) + (val ?? 0), 0) ?? 0) / 10,
                1,
              )
            : undefined;
        const roundThree =
          currentRound > 3 || (currentRound === 3 && !isRoundRunning)
            ? roundToDecimalPlace(
                (t.golfers
                  .map(
                    (x) =>
                      x.live?.R3 ??
                      x.historical?.round_3?.score ??
                      x.tournamentGolfer?.roundThree,
                  )
                  .sort(
                    (a, b) =>
                      (a === 0 ? 500 : (a ?? 500)) -
                      (b === 0 ? 500 : (b ?? 500)),
                  )
                  .slice(0, 5)
                  .reduce((sum, val) => (sum ?? 0) + (val ?? 0), 0) ?? 0) / 5,
                1,
              )
            : undefined;
        const roundFour =
          currentRound > 4 || (currentRound === 4 && !isRoundRunning)
            ? roundToDecimalPlace(
                (t.golfers
                  .map(
                    (x) =>
                      x.live?.R4 ??
                      x.historical?.round_4?.score ??
                      x.tournamentGolfer?.roundFour,
                  )
                  .sort(
                    (a, b) =>
                      (a === 0 ? 500 : (a ?? 500)) -
                      (b === 0 ? 500 : (b ?? 500)),
                  )
                  .slice(0, 5)
                  .reduce((sum, val) => (sum ?? 0) + (val ?? 0), 0) ?? 0) / 5,
                1,
              )
            : undefined;

        updatedTeams.push({
          ...t,
          score: roundToDecimalPlace(
            (roundOne && roundOne > 0 ? roundOne - course.par : 0) +
              (roundTwo && roundTwo > 0 ? roundTwo - course.par : 0) +
              (roundThree && roundThree > 0 ? roundThree - course.par : 0) +
              (roundFour && roundFour > 0 ? roundFour - course.par : 0) +
              (isRoundRunning
                ? (t.golfers
                    .sort(
                      (a, b) => (a.live?.today ?? 500) - (b.live?.today ?? 500),
                    )
                    .slice(0, currentRound >= 3 ? 5 : 10)
                    .reduce(
                      (sum, val) => (sum ?? 0) + (val.live?.today ?? 0),
                      0,
                    ) ?? 0) / (currentRound >= 3 ? 5 : 10)
                : 0),
            1,
          ),
          today: roundToDecimalPlace(
            (t.golfers
              .filter(
                (g) =>
                  !["CUT", "WD", "DQ", ""].includes(
                    g.tournamentGolfer?.position ?? "",
                  ),
              )
              .sort((a, b) => {
                const aToday =
                  a.live?.today ??
                  (a.historical?.round_4
                    ? (a.historical.round_4.score ?? 0) -
                      (a.historical.round_4.course_par ?? 0)
                    : 500);
                const bToday =
                  b.live?.today ??
                  (b.historical?.round_4
                    ? (b.historical.round_4.score ?? 0) -
                      (b.historical.round_4.course_par ?? 0)
                    : 500);
                return aToday - bToday;
              })
              .slice(0, currentRound >= 3 ? 5 : 10)
              .reduce(
                (sum, val) =>
                  (sum ?? 0) +
                  (val.live?.today ??
                    (val.historical?.round_4
                      ? (val.historical.round_4.score ?? 0) -
                        (val.historical.round_4.course_par ?? 0)
                      : 0)),
                0,
              ) ?? 0) / (currentRound >= 3 ? 5 : 10),
            1,
          ),
          thru: roundToDecimalPlace(
            (t.golfers
              .filter(
                (g) =>
                  !["CUT", "WD", "DQ", ""].includes(
                    g.tournamentGolfer?.position ?? "",
                  ),
              )
              .sort((a, b) => (a.live?.today ?? 500) - (b.live?.today ?? 500))
              .slice(0, currentRound >= 3 ? 5 : 10)
              .reduce(
                (sum, val) =>
                  (sum ?? 0) +
                  ((val.live?.thru === "F"
                    ? 18
                    : parseInt(val.live?.thru ?? "0")) ?? 0),
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
          await ctx.runMutation(internal.functions.teams.updateTeam, {
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
