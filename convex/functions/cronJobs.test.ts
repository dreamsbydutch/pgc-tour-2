import { describe, expect, it } from "vitest";
import type { EnhancedGolfer } from "../types/types";
import {
  buildTourCardStandingsTotals,
  buildFirstPlaceTiebreakSummary,
  chunkSyncUpdates,
  derivePersistedTournamentState,
  deriveTournamentTimelineState,
  getEffectiveGolferLeaderboardScore,
  getAdaptiveSyncDelayMs,
  projectDataGolfRankingsForMutation,
  getFieldRoundOneTeeTimeMs,
  getGolferLeaderboardRankMetrics,
  getTournamentPayoutAheadCount,
  getTeamRoundWindowGolfers,
  getTeamRoundScore,
  getTournamentRoundWindowMetrics,
  getTeamTournamentRank,
  isRoundPublishedForTimeline,
  isAutomaticEvenParPlayoffTeam,
  shouldAutoFillIncompleteTeamRoster,
  shouldRunTournamentPreflight,
  shouldAwardTournamentResults,
} from "./cronJobs";
import { PRE_TOURNAMENT_PICK_WINDOW_MS } from "./_constants";

describe("sync batching and adaptive cadence", () => {
  it("projects ranking rows to the exact mutation validator shape", () => {
    expect(
      projectDataGolfRankingsForMutation([
        {
          am: 0,
          country: "USA",
          datagolf_rank: 1,
          dg_id: 18417,
          dg_skill_estimate: 2.706696665071,
          owgr_rank: 1,
          player_name: "Scottie Scheffler",
          primary_tour: "PGA",
        },
      ]),
    ).toEqual([
      {
        country: "USA",
        dg_id: 18417,
        owgr_rank: 1,
        player_name: "Scottie Scheffler",
      },
    ]);
  });

  it("treats only empty playoff rosters as automatic even-par teams", () => {
    expect(
      isAutomaticEvenParPlayoffTeam({ isPlayoff: true, golferIds: [] }),
    ).toBe(true);
    expect(
      isAutomaticEvenParPlayoffTeam({ isPlayoff: false, golferIds: [] }),
    ).toBe(false);
    expect(
      isAutomaticEvenParPlayoffTeam({ isPlayoff: true, golferIds: [1] }),
    ).toBe(false);
  });

  it("never fills an intentionally empty playoff roster", () => {
    expect(
      shouldAutoFillIncompleteTeamRoster({
        isPlayoff: true,
        golferIds: [],
        rosteredGolferCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldAutoFillIncompleteTeamRoster({
        isPlayoff: true,
        golferIds: [1, 2],
        rosteredGolferCount: 2,
      }),
    ).toBe(true);
    expect(
      shouldAutoFillIncompleteTeamRoster({
        isPlayoff: false,
        golferIds: [],
        rosteredGolferCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldAutoFillIncompleteTeamRoster({
        isPlayoff: true,
        golferIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        rosteredGolferCount: 10,
      }),
    ).toBe(false);
  });

  it("chunks writes at the configured boundary without losing order", () => {
    const updates = Array.from({ length: 57 }, (_, index) => index);
    const chunks = chunkSyncUpdates(updates);
    expect(chunks.map((chunk) => chunk.length)).toEqual([25, 25, 7]);
    expect(chunks.flat()).toEqual(updates);
  });

  it("uses 4/12 minute live cadence and bounded failure backoff", () => {
    expect(getAdaptiveSyncDelayMs({ livePlay: true, status: "active" })).toBe(
      4 * 60_000,
    );
    expect(getAdaptiveSyncDelayMs({ status: "active" })).toBe(12 * 60_000);
    expect(getAdaptiveSyncDelayMs({ activatedTournament: true })).toBe(
      12 * 60_000,
    );
    expect(getAdaptiveSyncDelayMs({ status: "completed" })).toBeNull();
    expect(getAdaptiveSyncDelayMs({ failureCount: 1 })).toBe(8 * 60_000);
    expect(getAdaptiveSyncDelayMs({ failureCount: 2 })).toBe(16 * 60_000);
    expect(getAdaptiveSyncDelayMs({ failureCount: 9 })).toBe(30 * 60_000);
  });

  it("calls the preflight feed only for the next event inside the pick window", () => {
    const nowMs = Date.UTC(2026, 7, 10, 12);
    expect(
      shouldRunTournamentPreflight({
        tournamentType: "next",
        tournamentStatus: "upcoming",
        startDate: nowMs + PRE_TOURNAMENT_PICK_WINDOW_MS,
        endDate: nowMs + PRE_TOURNAMENT_PICK_WINDOW_MS + 4 * 24 * 60 * 60_000,
        nowMs,
      }),
    ).toBe(true);
    expect(
      shouldRunTournamentPreflight({
        tournamentType: "next",
        tournamentStatus: "upcoming",
        startDate: nowMs + PRE_TOURNAMENT_PICK_WINDOW_MS + 1,
        endDate: nowMs + PRE_TOURNAMENT_PICK_WINDOW_MS + 4 * 24 * 60 * 60_000,
        nowMs,
      }),
    ).toBe(false);
    expect(
      shouldRunTournamentPreflight({
        tournamentType: "recent",
        tournamentStatus: "upcoming",
        startDate: nowMs + 60_000,
        endDate: nowMs + 4 * 24 * 60 * 60_000,
        nowMs,
      }),
    ).toBe(false);
    expect(
      shouldRunTournamentPreflight({
        tournamentType: "active",
        tournamentStatus: "upcoming",
        startDate: nowMs - 60_000,
        endDate: nowMs + 4 * 24 * 60 * 60_000,
        nowMs,
      }),
    ).toBe(true);
    expect(
      shouldRunTournamentPreflight({
        tournamentType: "active",
        tournamentStatus: "active",
        startDate: nowMs - 60_000,
        endDate: nowMs + 4 * 24 * 60 * 60_000,
        nowMs,
      }),
    ).toBe(false);
  });

  it("uses the earliest valid round-one tee time from the field", () => {
    const early = Date.parse("2026-08-13T12:10:00Z");
    const late = Date.parse("2026-08-13T17:05:00Z");
    const field = [
      { teetimes: [{ round_num: 2, teetime: early }] },
      { teetimes: [{ round_num: 1, teetime: late }] },
      { teetimes: [{ round_num: 1, teetime: early }] },
    ] as never;

    expect(getFieldRoundOneTeeTimeMs(field)).toBe(early);
  });
});

type TestSyncTeam = Parameters<
  typeof buildFirstPlaceTiebreakSummary
>[0]["teams"][number];

function makeGolfer(
  args: {
    golfer?: Partial<NonNullable<EnhancedGolfer["golfer"]>>;
    live?: Partial<NonNullable<EnhancedGolfer["live"]>>;
    historical?: Partial<NonNullable<EnhancedGolfer["historical"]>>;
    historicalEvent?: Partial<NonNullable<EnhancedGolfer["historicalEvent"]>>;
    tournamentGolfer?: Partial<NonNullable<EnhancedGolfer["tournamentGolfer"]>>;
  } = {},
): EnhancedGolfer {
  return {
    golfer: args.golfer as EnhancedGolfer["golfer"],
    live: args.live as EnhancedGolfer["live"],
    historical: args.historical as EnhancedGolfer["historical"],
    historicalEvent: args.historicalEvent as EnhancedGolfer["historicalEvent"],
    tournamentGolfer:
      args.tournamentGolfer as EnhancedGolfer["tournamentGolfer"],
  } as EnhancedGolfer;
}

function makeTeam(args: {
  id: string;
  tourId?: string;
  playoff?: number;
  score: number;
  position?: string;
  golferEarnings?: Array<number | undefined>;
}) {
  const tourId = args.tourId ?? "tour-a";

  return {
    _id: args.id,
    score: args.score,
    position: args.position ?? "T1",
    playoff: args.playoff,
    golfers: (args.golferEarnings ?? []).map((earnings, index) =>
      makeGolfer({
        golfer: { apiId: index + 1 },
        historicalEvent:
          typeof earnings === "number" ? { earnings } : undefined,
      }),
    ),
    tour: { _id: tourId },
    tourCard: { tourId },
  } as unknown as TestSyncTeam;
}

describe("golfer leaderboard score and rank", () => {
  it("uses historical totals when the live score is missing", () => {
    const leader = makeGolfer({
      historical: {
        fin_text: "1",
        round_1: { score: 69, course_par: 72, teetime: undefined },
      },
      tournamentGolfer: { position: "1", score: 4 },
    });
    const second = makeGolfer({
      historical: {
        fin_text: "2",
        round_1: { score: 71, course_par: 72, teetime: undefined },
      },
      tournamentGolfer: { position: "2", score: 5 },
    });

    expect(getEffectiveGolferLeaderboardScore(leader)).toBe(-3);
    expect(getEffectiveGolferLeaderboardScore(second)).toBe(-1);
    expect(
      getGolferLeaderboardRankMetrics({
        golfer: leader,
        golfers: [leader, second],
        allowPreStartNonStarterReplacement: false,
      }),
    ).toMatchObject({ betterGolfers: 0, tiedGolfers: 1 });
    expect(
      getGolferLeaderboardRankMetrics({
        golfer: second,
        golfers: [leader, second],
        allowPreStartNonStarterReplacement: false,
      }),
    ).toMatchObject({ betterGolfers: 1, tiedGolfers: 1 });
  });

  it("prefers a live score and preserves a saved even-par score", () => {
    expect(
      getEffectiveGolferLeaderboardScore(
        makeGolfer({
          live: { current_score: -5 },
          historical: {
            round_1: { score: 70, course_par: 72, teetime: undefined },
          },
          tournamentGolfer: { score: 0 },
        }),
      ),
    ).toBe(-5);
    expect(
      getEffectiveGolferLeaderboardScore(
        makeGolfer({ tournamentGolfer: { score: 0 } }),
      ),
    ).toBe(0);
  });
});

describe("buildTourCardStandingsTotals", () => {
  it("counts only regular-season events for standings stats while keeping playoff earnings", () => {
    const regularTierId = "tier-regular" as never;
    const playoffByNameTierId = "tier-special" as never;
    const regularTournamentId = "tournament-regular" as never;
    const regularCutTournamentId = "tournament-regular-cut" as never;
    const playoffTournamentId = "tournament-playoff" as never;
    const upcomingTournamentId = "tournament-upcoming" as never;

    const totals = buildTourCardStandingsTotals({
      tiers: [
        { _id: regularTierId, name: "Gold" },
        { _id: playoffByNameTierId, name: "Championship" },
      ] as never,
      tournaments: [
        {
          _id: regularTournamentId,
          tierId: regularTierId,
          name: "The Open",
          status: "completed",
        },
        {
          _id: regularCutTournamentId,
          tierId: regularTierId,
          name: "Memorial",
          status: "completed",
        },
        {
          _id: playoffTournamentId,
          tierId: playoffByNameTierId,
          name: "Silver Playoff Finals",
          status: "completed",
        },
        {
          _id: upcomingTournamentId,
          tierId: regularTierId,
          name: "Future Event",
          status: "upcoming",
        },
      ] as never,
      teams: [
        {
          tournamentId: regularTournamentId,
          points: 100,
          earnings: 200_00,
          position: "1",
        },
        {
          tournamentId: regularCutTournamentId,
          points: 30,
          earnings: 50_00,
          position: "CUT",
        },
        {
          tournamentId: playoffTournamentId,
          points: 500,
          earnings: 800_00,
          position: "1",
        },
        {
          tournamentId: upcomingTournamentId,
          points: 999,
          earnings: 999_00,
          position: "1",
        },
      ] as never,
    });

    expect(totals.points).toBe(130);
    expect(totals.earnings).toBe(105_000);
    expect(totals.wins).toBe(1);
    expect(totals.topFive).toBe(1);
    expect(totals.topTen).toBe(1);
    expect(totals.madeCut).toBe(1);
    expect(totals.appearances).toBe(2);
  });
});

describe("deriveTournamentTimelineState", () => {
  it("derives the pre-start upcoming state", () => {
    const timeline = deriveTournamentTimelineState({
      golfers: [makeGolfer()],
      existingStatus: "upcoming",
    });

    expect(timeline.status).toBe("upcoming");
    expect(timeline.currentRound).toBe(0);
    expect(timeline.livePlay).toBe(false);
  });

  it("derives the round 1 live state", () => {
    const timeline = deriveTournamentTimelineState({
      golfers: [
        makeGolfer({
          live: { round: 1, thru: "5", today: -1, current_score: -1 },
        }),
      ],
      existingStatus: "upcoming",
    });

    expect(timeline.status).toBe("active");
    expect(timeline.currentRound).toBe(1);
    expect(timeline.livePlay).toBe(true);
  });

  it("keeps round 1 after round 1 closes and round 2 has not started", () => {
    const timeline = deriveTournamentTimelineState({
      golfers: [
        makeGolfer({
          live: { R1: 70 },
        }),
      ],
      existingStatus: "active",
    });

    expect(timeline.status).toBe("active");
    expect(timeline.currentRound).toBe(1);
    expect(timeline.livePlay).toBe(false);
  });

  it("advances to round 2 only after round 2 actually starts", () => {
    const timeline = deriveTournamentTimelineState({
      golfers: [
        makeGolfer({
          live: { round: 2, thru: "4", today: -2, current_score: -5, R1: 67 },
        }),
      ],
      existingStatus: "active",
    });

    expect(timeline.currentRound).toBe(2);
    expect(timeline.livePlay).toBe(true);
  });

  it("pins overlap to the earliest unfinished round", () => {
    const timeline = deriveTournamentTimelineState({
      golfers: [
        makeGolfer({
          live: { round: 1, thru: "9", today: -1, current_score: -1 },
        }),
        makeGolfer({
          live: {
            round: 2,
            thru: "3",
            today: -2,
            current_score: -4,
            R1: 70,
          },
        }),
      ],
      existingStatus: "active",
    });

    expect(timeline.currentRound).toBe(1);
    expect(timeline.livePlay).toBe(true);
    expect(timeline.overlapRound).toBe(2);
  });

  it("derives the round 2 closed state", () => {
    const timeline = deriveTournamentTimelineState({
      golfers: [
        makeGolfer({
          live: { R1: 70, R2: 69 },
        }),
      ],
      existingStatus: "active",
    });

    expect(timeline.currentRound).toBe(2);
    expect(timeline.livePlay).toBe(false);
  });

  it("derives the round 3 live state", () => {
    const timeline = deriveTournamentTimelineState({
      golfers: [
        makeGolfer({
          live: {
            round: 3,
            thru: "6",
            today: -1,
            current_score: -6,
            R1: 69,
            R2: 68,
          },
        }),
      ],
      existingStatus: "active",
    });

    expect(timeline.currentRound).toBe(3);
    expect(timeline.livePlay).toBe(true);
  });

  it("derives the round 4 live state", () => {
    const timeline = deriveTournamentTimelineState({
      golfers: [
        makeGolfer({
          live: {
            round: 4,
            thru: "7",
            today: -1,
            current_score: -8,
            R1: 69,
            R2: 68,
            R3: 67,
          },
        }),
      ],
      existingStatus: "active",
    });

    expect(timeline.currentRound).toBe(4);
    expect(timeline.livePlay).toBe(true);
  });

  it("derives the completed state with currentRound 4 for newly completed tournaments", () => {
    const timeline = deriveTournamentTimelineState({
      golfers: [
        makeGolfer({
          live: { R1: 70, R2: 69, R3: 68, R4: 67 },
        }),
      ],
      existingStatus: "active",
      eventCompleted: true,
    });

    expect(timeline.status).toBe("completed");
    expect(timeline.currentRound).toBe(4);
    expect(timeline.livePlay).toBe(false);
  });

  it("preserves legacy completed rounds above 4", () => {
    const timeline = deriveTournamentTimelineState({
      golfers: [makeGolfer()],
      existingStatus: "completed",
      existingRound: 5.5,
    });

    expect(timeline.status).toBe("completed");
    expect(timeline.currentRound).toBe(5.5);
    expect(timeline.livePlay).toBe(false);
  });
});

describe("isRoundPublishedForTimeline", () => {
  it("does not publish future rounds early", () => {
    expect(
      isRoundPublishedForTimeline(
        { currentRound: 1, livePlay: true, status: "active" },
        1,
      ),
    ).toBe(false);
    expect(
      isRoundPublishedForTimeline(
        { currentRound: 1, livePlay: false, status: "active" },
        1,
      ),
    ).toBe(true);
    expect(
      isRoundPublishedForTimeline(
        { currentRound: 1, livePlay: false, status: "active" },
        2,
      ),
    ).toBe(false);
    expect(
      isRoundPublishedForTimeline(
        { currentRound: 4, livePlay: false, status: "completed" },
        4,
      ),
    ).toBe(true);
  });
});

describe("getTournamentRoundWindowMetrics", () => {
  it("keeps round-two today/thru visible for cut golfers after round two closes", () => {
    const metrics = getTournamentRoundWindowMetrics({
      golfer: makeGolfer({
        live: { current_pos: "CUT", R1: 70, R2: 71 },
      }),
      roundNumber: 2,
      roundStarted: true,
      timeline: { currentRound: 2, livePlay: false, status: "active" },
      coursePar: 72,
      allowPreStartNonStarterReplacement: false,
    });

    expect(metrics.today).toBe(-1);
    expect(metrics.thru).toBe(18);
  });
});

describe("getTeamRoundWindowGolfers", () => {
  it("breaks weekend scoring ties by lower thru first", () => {
    const selected = getTeamRoundWindowGolfers({
      golfers: [
        makeGolfer({
          golfer: { apiId: 1 },
          live: {
            current_pos: "T1",
            round: 3,
            thru: "12",
            today: 2,
            current_score: -2,
            R1: 70,
            R2: 69,
          },
        }),
        makeGolfer({
          golfer: { apiId: 2 },
          live: {
            current_pos: "T1",
            round: 3,
            thru: "8",
            today: -1,
            current_score: -5,
            R1: 70,
            R2: 69,
          },
        }),
        makeGolfer({
          golfer: { apiId: 3 },
          live: {
            current_pos: "T1",
            round: 3,
            thru: "18",
            today: -3,
            current_score: -7,
            R1: 70,
            R2: 69,
          },
        }),
        makeGolfer({
          golfer: { apiId: 4 },
          live: {
            current_pos: "T1",
            round: 3,
            thru: "18",
            today: -2,
            current_score: -6,
            R1: 70,
            R2: 69,
          },
        }),
        makeGolfer({
          golfer: { apiId: 5 },
          live: {
            current_pos: "T1",
            round: 3,
            thru: "10",
            today: 0,
            current_score: -4,
            R1: 70,
            R2: 69,
          },
        }),
        makeGolfer({
          golfer: { apiId: 6 },
          live: {
            current_pos: "T1",
            round: 3,
            thru: "0",
            today: 0,
            current_score: -4,
            R1: 70,
            R2: 69,
          },
        }),
        makeGolfer({
          golfer: { apiId: 7 },
          live: {
            current_pos: "T1",
            round: 3,
            thru: "4",
            today: -1,
            current_score: -5,
            R1: 70,
            R2: 69,
          },
        }),
        makeGolfer({
          golfer: { apiId: 8 },
          live: {
            current_pos: "T1",
            round: 3,
            thru: "15",
            today: 1,
            current_score: -3,
            R1: 70,
            R2: 69,
          },
        }),
      ],
      roundNumber: 3,
      roundStarted: true,
      timeline: { currentRound: 3, livePlay: true, status: "active" },
      coursePar: 72,
      allowPreStartNonStarterReplacement: false,
    });

    expect(selected).toHaveLength(5);
    expect(selected.map((golfer) => golfer.golfer?.apiId)).toEqual([
      3, 4, 7, 2, 6,
    ]);
    expect(selected.some((golfer) => golfer.golfer?.apiId === 1)).toBe(false);
    expect(selected.some((golfer) => golfer.golfer?.apiId === 8)).toBe(false);
  });
});

describe("playoff round scoring", () => {
  const completedTimeline = {
    currentRound: 4,
    livePlay: false,
    status: "completed" as const,
  };
  const golfers = Array.from({ length: 10 }, (_, index) =>
    makeGolfer({ live: { R1: 60 + index, current_pos: `${index + 1}` } }),
  );

  it("counts all ten golfers in St. Jude rounds one and two", () => {
    expect(
      getTeamRoundScore({
        golfers,
        roundNumber: 1,
        timeline: completedTimeline,
        coursePar: 72,
        allowPreStartNonStarterReplacement: false,
        eventIndex: 1,
      }),
    ).toBe(64.5);
  });

  it("counts the best five golfers in every BMW round", () => {
    expect(
      getTeamRoundScore({
        golfers,
        roundNumber: 1,
        timeline: completedTimeline,
        coursePar: 72,
        allowPreStartNonStarterReplacement: false,
        eventIndex: 2,
      }),
    ).toBe(62);
  });

  it("counts the best three golfers in every TOUR Championship round", () => {
    expect(
      getTeamRoundScore({
        golfers,
        roundNumber: 1,
        timeline: completedTimeline,
        coursePar: 72,
        allowPreStartNonStarterReplacement: false,
        eventIndex: 3,
      }),
    ).toBe(61);
  });

  it("awards only the final playoff leg", () => {
    expect(shouldAwardTournamentResults({ isPlayoff: false })).toBe(true);
    expect(
      shouldAwardTournamentResults({ isPlayoff: true, eventIndex: 1 }),
    ).toBe(false);
    expect(
      shouldAwardTournamentResults({ isPlayoff: true, eventIndex: 2 }),
    ).toBe(false);
    expect(
      shouldAwardTournamentResults({ isPlayoff: true, eventIndex: 3 }),
    ).toBe(true);
  });

  it("always starts Silver payouts at payout position 76", () => {
    expect(
      getTournamentPayoutAheadCount({
        isPlayoff: true,
        playoff: 1,
        teamsAhead: 2,
      }),
    ).toBe(2);
    expect(
      getTournamentPayoutAheadCount({
        isPlayoff: true,
        playoff: 2,
        teamsAhead: 2,
      }),
    ).toBe(77);
    expect(
      getTournamentPayoutAheadCount({
        isPlayoff: false,
        playoff: 2,
        teamsAhead: 2,
      }),
    ).toBe(2);
  });
});

describe("buildFirstPlaceTiebreakSummary", () => {
  it("marks tours without a first-place tie as resolved enough to complete", () => {
    const summary = buildFirstPlaceTiebreakSummary({
      teams: [
        makeTeam({
          id: "winner",
          score: -10,
          position: "1",
          golferEarnings: [100, 200],
        }),
        makeTeam({
          id: "second",
          score: -8,
          position: "2",
          golferEarnings: [150, 250],
        }),
      ],
    });

    expect(summary.unresolved).toHaveLength(0);
    expect(summary.byTourKey.get("tour-a")?.status).toBe("no_tie");
  });

  it("resolves a first-place tie when one team has the highest combined earnings", () => {
    const summary = buildFirstPlaceTiebreakSummary({
      teams: [
        makeTeam({
          id: "winner",
          score: -10,
          golferEarnings: [500, 400],
        }),
        makeTeam({
          id: "runner-up",
          score: -10,
          golferEarnings: [300, 200],
        }),
      ],
    });

    expect(summary.unresolved).toHaveLength(0);
    expect(summary.byTourKey.get("tour-a")).toMatchObject({
      status: "resolved",
      winnerTeamId: "winner",
    });
  });

  it("treats an automatic empty playoff team as a known zero-earnings roster", () => {
    const summary = buildFirstPlaceTiebreakSummary({
      isPlayoff: true,
      teams: [
        makeTeam({
          id: "picked-team",
          playoff: 1,
          score: 0,
          golferEarnings: [100],
        }),
        makeTeam({ id: "automatic-team", playoff: 1, score: 0 }),
      ],
    });

    expect(summary.unresolved).toHaveLength(0);
    expect(summary.byTourKey.get("playoff:1")).toMatchObject({
      status: "resolved",
      winnerTeamId: "picked-team",
    });
  });

  it("holds completion when tied first-place teams are missing golfer earnings", () => {
    const summary = buildFirstPlaceTiebreakSummary({
      teams: [
        makeTeam({
          id: "team-a",
          score: -10,
          golferEarnings: [500, undefined],
        }),
        makeTeam({
          id: "team-b",
          score: -10,
          golferEarnings: [300, 200],
        }),
      ],
    });

    expect(summary.unresolved).toHaveLength(1);
    expect(summary.byTourKey.get("tour-a")?.status).toBe(
      "unresolved_missing_earnings",
    );
  });

  it("holds completion when tied first-place teams stay tied on combined earnings", () => {
    const summary = buildFirstPlaceTiebreakSummary({
      teams: [
        makeTeam({
          id: "team-a",
          score: -10,
          golferEarnings: [400, 300],
        }),
        makeTeam({
          id: "team-b",
          score: -10,
          golferEarnings: [350, 350],
        }),
      ],
    });

    expect(summary.unresolved).toHaveLength(1);
    expect(summary.byTourKey.get("tour-a")?.status).toBe(
      "unresolved_equal_earnings",
    );
  });
});

describe("derivePersistedTournamentState", () => {
  it("keeps completed tournaments completed when every tour has a sole winner", () => {
    const summary = buildFirstPlaceTiebreakSummary({
      teams: [
        makeTeam({
          id: "winner",
          score: -10,
          position: "1",
          golferEarnings: [100, 100],
        }),
        makeTeam({
          id: "second",
          score: -8,
          position: "2",
          golferEarnings: [50, 50],
        }),
      ],
    });

    const state = derivePersistedTournamentState({
      timeline: {
        currentRound: 4,
        livePlay: false,
        status: "completed",
        rounds: {
          1: { started: true, completed: true, live: false },
          2: { started: true, completed: true, live: false },
          3: { started: true, completed: true, live: false },
          4: { started: true, completed: true, live: false },
        },
      },
      firstPlaceTiebreakSummary: summary,
    });

    expect(state).toMatchObject({
      status: "completed",
      currentRound: 4,
      livePlay: false,
    });
  });

  it("holds completed tournaments active when first-place earnings are missing", () => {
    const summary = buildFirstPlaceTiebreakSummary({
      teams: [
        makeTeam({
          id: "team-a",
          score: -10,
          golferEarnings: [100, undefined],
        }),
        makeTeam({
          id: "team-b",
          score: -10,
          golferEarnings: [50, 50],
        }),
      ],
    });

    const state = derivePersistedTournamentState({
      timeline: {
        currentRound: 4,
        livePlay: false,
        status: "completed",
        rounds: {
          1: { started: true, completed: true, live: false },
          2: { started: true, completed: true, live: false },
          3: { started: true, completed: true, live: false },
          4: { started: true, completed: true, live: false },
        },
      },
      firstPlaceTiebreakSummary: summary,
    });

    expect(state).toMatchObject({
      status: "active",
      currentRound: 4,
      livePlay: false,
      holdReason: "first_place_tiebreak_missing_earnings",
    });
  });

  it("holds completed tournaments active when combined earnings remain tied", () => {
    const summary = buildFirstPlaceTiebreakSummary({
      teams: [
        makeTeam({
          id: "team-a",
          score: -10,
          golferEarnings: [100, 100],
        }),
        makeTeam({
          id: "team-b",
          score: -10,
          golferEarnings: [150, 50],
        }),
      ],
    });

    const state = derivePersistedTournamentState({
      timeline: {
        currentRound: 4,
        livePlay: false,
        status: "completed",
        rounds: {
          1: { started: true, completed: true, live: false },
          2: { started: true, completed: true, live: false },
          3: { started: true, completed: true, live: false },
          4: { started: true, completed: true, live: false },
        },
      },
      firstPlaceTiebreakSummary: summary,
    });

    expect(state).toMatchObject({
      status: "active",
      currentRound: 4,
      livePlay: false,
      holdReason: "first_place_tiebreak_equal_earnings",
    });
  });
});

describe("getTeamTournamentRank", () => {
  it("ranks Gold and Silver separately across original tours", () => {
    const teams = [
      makeTeam({
        id: "gold-tour-a",
        tourId: "tour-a",
        playoff: 1,
        score: -10,
      }),
      makeTeam({
        id: "gold-tour-b",
        tourId: "tour-b",
        playoff: 1,
        score: -8,
      }),
      makeTeam({
        id: "silver-tour-a",
        tourId: "tour-a",
        playoff: 2,
        score: -20,
      }),
    ];

    expect(
      getTeamTournamentRank({
        team: teams[1],
        teams,
        tournamentCompleted: false,
        isPlayoff: true,
      }),
    ).toMatchObject({ teamsAhead: 1, position: "2" });
    expect(
      getTeamTournamentRank({
        team: teams[2],
        teams,
        tournamentCompleted: false,
        isPlayoff: true,
      }),
    ).toMatchObject({ teamsAhead: 0, position: "1" });
  });

  it("ignores CUT teams when ranking active teams in the same tour", () => {
    const teams = [
      makeTeam({ id: "team-1", score: -12, position: "1" }),
      makeTeam({ id: "team-2", score: -11, position: "2" }),
      makeTeam({ id: "team-3", score: -10, position: "3" }),
      makeTeam({ id: "cut-team", score: -9, position: "CUT" }),
      makeTeam({ id: "team-4", score: -8, position: "5" }),
    ];

    const rank = getTeamTournamentRank({
      team: teams[4],
      teams,
      tournamentCompleted: false,
    });

    expect(rank.teamsAhead).toBe(3);
    expect(rank.teamsTied).toBe(1);
    expect(rank.position).toBe("4");
  });

  it("promotes a sole earnings winner to 1 and the other tied leader to 2", () => {
    const teams = [
      makeTeam({
        id: "winner",
        score: -10,
        golferEarnings: [500, 400],
      }),
      makeTeam({
        id: "runner-up",
        score: -10,
        golferEarnings: [300, 200],
      }),
    ];
    const summary = buildFirstPlaceTiebreakSummary({ teams });

    expect(
      getTeamTournamentRank({
        team: teams[0],
        teams,
        firstPlaceTiebreakSummary: summary,
        tournamentCompleted: true,
      }).position,
    ).toBe("1");
    expect(
      getTeamTournamentRank({
        team: teams[1],
        teams,
        firstPlaceTiebreakSummary: summary,
        tournamentCompleted: true,
      }).position,
    ).toBe("2");
  });

  it("keeps unresolved first-place ties at T1", () => {
    const teams = [
      makeTeam({
        id: "team-a",
        score: -10,
        golferEarnings: [500, undefined],
      }),
      makeTeam({
        id: "team-b",
        score: -10,
        golferEarnings: [300, 200],
      }),
    ];
    const summary = buildFirstPlaceTiebreakSummary({ teams });

    expect(
      getTeamTournamentRank({
        team: teams[0],
        teams,
        firstPlaceTiebreakSummary: summary,
        tournamentCompleted: true,
      }).position,
    ).toBe("T1");
  });

  it("keeps ties below first unchanged", () => {
    const teams = [
      makeTeam({
        id: "leader",
        score: -11,
        position: "1",
        golferEarnings: [500, 400],
      }),
      makeTeam({
        id: "team-a",
        score: -10,
        golferEarnings: [300, 200],
      }),
      makeTeam({
        id: "team-b",
        score: -10,
        golferEarnings: [250, 250],
      }),
    ];
    const summary = buildFirstPlaceTiebreakSummary({ teams });

    expect(
      getTeamTournamentRank({
        team: teams[1],
        teams,
        firstPlaceTiebreakSummary: summary,
        tournamentCompleted: true,
      }).position,
    ).toBe("T2");
  });
});
