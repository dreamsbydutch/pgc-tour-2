import { describe, expect, it } from "vitest";
import type { EnhancedGolfer } from "../types/types";
import {
  buildFirstPlaceTiebreakSummary,
  derivePersistedTournamentState,
  deriveTournamentTimelineState,
  getTeamRoundWindowGolfers,
  getTournamentRoundWindowMetrics,
  getTeamTournamentRank,
  isRoundPublishedForTimeline,
} from "./cronJobs";

type TestSyncTeam = Parameters<typeof buildFirstPlaceTiebreakSummary>[0]["teams"][number];

function makeGolfer(args: {
  golfer?: Partial<NonNullable<EnhancedGolfer["golfer"]>>;
  live?: Partial<NonNullable<EnhancedGolfer["live"]>>;
  historical?: Partial<NonNullable<EnhancedGolfer["historical"]>>;
  historicalEvent?: Partial<NonNullable<EnhancedGolfer["historicalEvent"]>>;
  tournamentGolfer?: Partial<NonNullable<EnhancedGolfer["tournamentGolfer"]>>;
} = {}): EnhancedGolfer {
  return {
    golfer: args.golfer as EnhancedGolfer["golfer"],
    live: args.live as EnhancedGolfer["live"],
    historical: args.historical as EnhancedGolfer["historical"],
    historicalEvent: args.historicalEvent as EnhancedGolfer["historicalEvent"],
    tournamentGolfer: args.tournamentGolfer as EnhancedGolfer["tournamentGolfer"],
  } as EnhancedGolfer;
}

function makeTeam(args: {
  id: string;
  tourId?: string;
  score: number;
  position?: string;
  golferEarnings?: Array<number | undefined>;
}) {
  const tourId = args.tourId ?? "tour-a";

  return {
    _id: args.id,
    score: args.score,
    position: args.position ?? "T1",
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
    expect(selected.map((golfer) => golfer.golfer?.apiId)).toEqual([3, 4, 7, 2, 6]);
    expect(selected.some((golfer) => golfer.golfer?.apiId === 1)).toBe(false);
    expect(selected.some((golfer) => golfer.golfer?.apiId === 8)).toBe(false);
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
