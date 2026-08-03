import { describe, expect, it } from "vitest";

import { buildTournamentHoleStatRows } from "./tournamentCourseStats";

describe("buildTournamentHoleStatRows", () => {
  it("derives relative difficulty and under/par/over percentages", () => {
    const rows = buildTournamentHoleStatRows({
      status: "available",
      eventName: "Rocket Classic",
      courseName: "Detroit Golf Club",
      courseCode: "DETROIT",
      round: 4,
      lastUpdated: "2026-08-02T20:00:00Z",
      holes: [
        {
          hole: 1,
          par: 4,
          yardage: 397,
          total: {
            avg_score: 3.8,
            players_thru: 100,
            eagles_or_better: 2,
            birdies: 28,
            pars: 50,
            bogeys: 15,
            doubles_or_worse: 5,
          },
        },
      ],
    });

    expect(rows).toEqual([
      {
        hole: 1,
        par: 4,
        yardage: 397,
        average: 3.8,
        relativeToPar: expect.closeTo(-0.2),
        underParPercent: 30,
        parPercent: 50,
        overParPercent: 20,
      },
    ]);
  });

  it("does not divide by zero before players have completed a hole", () => {
    const [row] = buildTournamentHoleStatRows({
      status: "available",
      eventName: "Rocket Classic",
      courseName: "Detroit Golf Club",
      courseCode: "DETROIT",
      round: 1,
      lastUpdated: "",
      holes: [
        {
          hole: 18,
          par: 4,
          yardage: 455,
          total: {
            avg_score: 4,
            players_thru: 0,
            eagles_or_better: 0,
            birdies: 0,
            pars: 0,
            bogeys: 0,
            doubles_or_worse: 0,
          },
        },
      ],
    });

    expect(row?.underParPercent).toBe(0);
    expect(row?.parPercent).toBe(0);
    expect(row?.overParPercent).toBe(0);
  });
});
