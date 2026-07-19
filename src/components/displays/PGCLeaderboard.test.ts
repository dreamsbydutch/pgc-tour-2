import { describe, expect, it } from "vitest";
import type { Id } from "convex/_generated/dataModel";
import { buildTeamAverageScorecard } from "./PGCLeaderboard";

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
  it("averages only counting golfers who have completed each hole", () => {
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
      { hole: 1, strokes: 3.5, relativeToPar: -0.5 },
      { hole: 2, strokes: 4, relativeToPar: 0 },
    ]);
    expect(scorecard.rounds[2]?.holes).toEqual([
      { hole: 1, strokes: 4, relativeToPar: 0 },
    ]);
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
      { hole: 1, strokes: 4, relativeToPar: 0 },
    ]);
  });
});
