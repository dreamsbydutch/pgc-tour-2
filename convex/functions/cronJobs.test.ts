import { describe, expect, it } from "vitest";
import type { EnhancedGolfer } from "../types/types";
import {
  deriveTournamentTimelineState,
  isRoundPublishedForTimeline,
} from "./cronJobs";

function makeGolfer(args: {
  live?: Partial<NonNullable<EnhancedGolfer["live"]>>;
  historical?: Partial<NonNullable<EnhancedGolfer["historical"]>>;
  tournamentGolfer?: Partial<NonNullable<EnhancedGolfer["tournamentGolfer"]>>;
} = {}): EnhancedGolfer {
  return {
    live: args.live as EnhancedGolfer["live"],
    historical: args.historical as EnhancedGolfer["historical"],
    tournamentGolfer: args.tournamentGolfer as EnhancedGolfer["tournamentGolfer"],
  } as EnhancedGolfer;
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
