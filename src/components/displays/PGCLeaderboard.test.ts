import { describe, expect, it } from "vitest";
import type { Id } from "convex/_generated/dataModel";
import { buildTeamAverageScorecard } from "@/utils/teamHoleScorecard";
import { orderTeamGolfersForTable } from "./PGCLeaderboard";
import type { TournamentTeamDetailGolfer } from "@/types";

function golferId(value: number) {
  return `golfer-${value}` as Id<"golfers">;
}

function buildGolfers() {
  return Array.from({ length: 10 }, (_, index) => ({
    golferId: golferId(index + 1),
    apiId: index + 1,
    position: String(index + 1),
    today: index,
    thru: index + 1,
    roundOne: 70 + index,
    roundTwo: 70 + index,
    roundThree: index < 5 ? 75 + index : 60 + index,
    roundFour: undefined,
  }));
}

describe("buildTeamAverageScorecard", () => {
  it("treats a null scorecard collection as unavailable data", () => {
    const scorecard = buildTeamAverageScorecard({
      teamGolfers: buildGolfers(),
      currentRound: 1,
      tournamentCompleted: false,
      scorecards: null,
    });

    expect(scorecard.rounds.every((round) => round.holes.length === 0)).toBe(
      true,
    );
  });

  it("weights live holes across every counting golfer", () => {
    const scorecard = buildTeamAverageScorecard({
      teamGolfers: buildGolfers(),
      currentRound: 3,
      tournamentCompleted: false,
      scorecards: [
        {
          golferId: golferId(1),
          rounds: [
            {
              round: 1,
              holes: [
                { hole: 1, strokes: 3, relativeToPar: -1 },
                { hole: 2, strokes: 4, relativeToPar: 0 },
              ],
            },
            {
              round: 3,
              holes: [{ hole: 1, strokes: 3, relativeToPar: -1 }],
            },
          ],
        },
        {
          golferId: golferId(2),
          rounds: [
            {
              round: 1,
              holes: [{ hole: 1, strokes: 4, relativeToPar: 0 }],
            },
            {
              round: 3,
              holes: [{ hole: 1, strokes: 4, relativeToPar: 0 }],
            },
          ],
        },
        {
          golferId: golferId(4),
          rounds: [
            {
              round: 3,
              holes: [{ hole: 1, strokes: 5, relativeToPar: 1 }],
            },
          ],
        },
        {
          golferId: golferId(6),
          rounds: [
            {
              round: 3,
              holes: [{ hole: 1, strokes: 20, relativeToPar: 16 }],
            },
          ],
        },
      ],
    });

    expect(scorecard.rounds[0]?.holes).toEqual([
      {
        hole: 1,
        strokes: 3.9,
        relativeToPar: -0.1,
        completion: { completed: 2, total: 10 },
      },
      {
        hole: 2,
        strokes: 4,
        relativeToPar: 0,
        completion: { completed: 1, total: 10 },
      },
    ]);
    expect(scorecard.rounds[2]?.holes).toEqual([
      {
        hole: 1,
        strokes: 4,
        relativeToPar: 0,
        completion: { completed: 3, total: 5 },
      },
    ]);
  });

  it("makes live weekend hole values add up to the team Today score", () => {
    const scorecard = buildTeamAverageScorecard({
      teamGolfers: buildGolfers(),
      currentRound: 4,
      tournamentCompleted: false,
      scorecards: [
        {
          golferId: golferId(1),
          rounds: [
            {
              round: 4,
              holes: [
                { hole: 1, strokes: 3, relativeToPar: -1 },
                { hole: 2, strokes: 2, relativeToPar: -1 },
                { hole: 3, strokes: 4, relativeToPar: 0 },
                { hole: 4, strokes: 5, relativeToPar: 1 },
              ],
            },
          ],
        },
      ],
    });

    expect(scorecard.rounds[3]?.holes).toEqual([
      {
        hole: 1,
        strokes: 3.8,
        relativeToPar: -0.2,
        completion: { completed: 1, total: 5 },
      },
      {
        hole: 2,
        strokes: 2.8,
        relativeToPar: -0.2,
        completion: { completed: 1, total: 5 },
      },
      {
        hole: 3,
        strokes: 4,
        relativeToPar: 0,
        completion: { completed: 1, total: 5 },
      },
      {
        hole: 4,
        strokes: 4.2,
        relativeToPar: 0.2,
        completion: { completed: 1, total: 5 },
      },
    ]);
    expect(
      scorecard.rounds[3]?.holes.reduce(
        (sum, hole) => sum + hole.relativeToPar,
        0,
      ),
    ).toBeCloseTo(-0.2);
  });

  it("uses the five lowest completed round scores for a past weekend round", () => {
    const scorecard = buildTeamAverageScorecard({
      teamGolfers: buildGolfers(),
      currentRound: 4,
      tournamentCompleted: false,
      scorecards: Array.from({ length: 10 }, (_, index) => ({
        golferId: golferId(index + 1),
        rounds: [
          {
            round: 3,
            holes: [
              {
                hole: 1,
                strokes: index < 5 ? 9 : 4,
                relativeToPar: index < 5 ? 5 : 0,
              },
            ],
          },
        ],
      })),
    });

    expect(scorecard.rounds[2]?.holes).toEqual([
      {
        hole: 1,
        strokes: 4,
        relativeToPar: 0,
        completion: { completed: 5, total: 5 },
      },
    ]);
  });

  it("uses synthetic WD holes in the average without carrying their marker", () => {
    const scorecard = buildTeamAverageScorecard({
      teamGolfers: buildGolfers(),
      currentRound: 2,
      tournamentCompleted: false,
      scorecards: Array.from({ length: 10 }, (_, index) => ({
        golferId: golferId(index + 1),
        rounds: [
          {
            round: 1,
            holes: [
              {
                hole: 1,
                strokes: 5,
                relativeToPar: 1,
                synthetic: index === 0,
              },
            ],
          },
        ],
      })),
    });

    expect(scorecard.rounds[0]?.holes[0]).toEqual({
      hole: 1,
      strokes: 5,
      relativeToPar: 1,
      completion: { completed: 10, total: 10 },
    });
  });

  it("does not build BMW hole averages when fewer than five golfers qualified", () => {
    const teamGolfers = buildGolfers().map((golfer, index) => ({
      ...golfer,
      position: index < 4 ? golfer.position : "CUT",
    }));
    const scorecard = buildTeamAverageScorecard({
      teamGolfers,
      currentRound: 1,
      eventIndex: 2,
      tournamentCompleted: false,
      scorecards: teamGolfers.slice(0, 4).map((golfer) => ({
        golferId: golfer.golferId,
        rounds: [
          {
            round: 1,
            holes: [{ hole: 1, strokes: 4, relativeToPar: 0 }],
          },
        ],
      })),
    });

    expect(scorecard.rounds.every((round) => round.holes.length === 0)).toBe(
      true,
    );
  });

  it("uses three requalified golfers in TOUR Championship hole averages", () => {
    const teamGolfers = buildGolfers().map((golfer, index) => ({
      ...golfer,
      position: index < 3 ? golfer.position : "CUT",
    }));
    const scorecard = buildTeamAverageScorecard({
      teamGolfers,
      currentRound: 1,
      eventIndex: 3,
      tournamentCompleted: false,
      scorecards: teamGolfers.slice(0, 3).map((golfer, index) => ({
        golferId: golfer.golferId,
        rounds: [
          {
            round: 1,
            holes: [
              {
                hole: 1,
                strokes: 3 + index,
                relativeToPar: index - 1,
              },
            ],
          },
        ],
      })),
    });

    expect(scorecard.rounds[0]?.holes[0]).toEqual({
      hole: 1,
      strokes: 4,
      relativeToPar: 0,
      completion: { completed: 3, total: 3 },
    });
  });
});

describe("orderTeamGolfersForTable", () => {
  it("puts later-playoff non-qualifiers below the active top three", () => {
    const golfers = buildGolfers().map((golfer, index) => ({
      ...golfer,
      _id: `row-${index + 1}`,
      tournamentId: "tournament",
      playerName: `Golfer ${index + 1}`,
      position: index < 3 ? golfer.position : "CUT",
    })) as unknown as TournamentTeamDetailGolfer[];

    const ordered = orderTeamGolfersForTable({
      teamGolfers: golfers,
      currentRound: 1,
      eventIndex: 3,
    });

    expect(
      ordered.slice(0, 3).every((golfer) => golfer.position !== "CUT"),
    ).toBe(true);
    expect(ordered.slice(3).every((golfer) => golfer.position === "CUT")).toBe(
      true,
    );
  });
});
