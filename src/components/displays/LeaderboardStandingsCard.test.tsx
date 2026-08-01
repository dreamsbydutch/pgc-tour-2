// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LeaderboardStandingsCard } from "./LeaderboardStandingsCard";

afterEach(cleanup);

describe("LeaderboardStandingsCard", () => {
  it("renders the official and live snapshots with projected strokes", () => {
    render(
      <LeaderboardStandingsCard
        snapshot={{
          tourCardId: "card-1",
          beforeTournament: {
            position: "12",
            points: 1_200,
            destination: "silver",
          },
          live: {
            position: "T8",
            points: 1_350,
            destination: "gold",
            startingStrokes: -4.6,
          },
          lastUpdatedAt: Date.UTC(2026, 7, 1, 18, 30),
        }}
      />,
    );

    expect(screen.getByText("Standings")).toBeTruthy();
    expect(screen.getByText("Before tournament")).toBeTruthy();
    expect(screen.getByText("Live projection")).toBeTruthy();
    expect(screen.getByText("12").className).toContain("text-slate-500");
    expect(screen.getByText("12").className).toContain("text-lg");
    expect(screen.getByText("12").className).not.toContain("text-3xl");
    expect(screen.getByText("T8").className).toContain("text-amber-700");
    expect(screen.getByText("1,200 pts")).toBeTruthy();
    expect(screen.getByText("1,350 pts")).toBeTruthy();
    expect(screen.getByText("-4.6")).toBeTruthy();
    expect(screen.getByText(/Unofficial/)).toBeTruthy();
    expect(screen.getByText(/Updated Aug 1/)).toBeTruthy();
  });

  it("renders an explicit red Out state without a starting-stroke row", () => {
    render(
      <LeaderboardStandingsCard
        snapshot={{
          tourCardId: "card-2",
          beforeTournament: {
            position: "30",
            points: 300,
            destination: "out",
          },
          live: {
            position: "28",
            points: 350,
            destination: "out",
            startingStrokes: null,
          },
          lastUpdatedAt: null,
        }}
      />,
    );

    expect(screen.getAllByText("Out")).toHaveLength(2);
    expect(screen.getByText("28").className).toContain("text-red-600");
    expect(screen.queryByText(/Projected start/)).toBeNull();
    expect(screen.getByText(/Awaiting leaderboard timestamp/)).toBeTruthy();
  });

  it("renders an awaiting state when live points are unavailable", () => {
    render(
      <LeaderboardStandingsCard
        snapshot={{
          tourCardId: "card-3",
          beforeTournament: {
            position: "5",
            points: 800,
            destination: "gold",
          },
          live: null,
          lastUpdatedAt: null,
        }}
      />,
    );

    expect(screen.getByText("Awaiting live update")).toBeTruthy();
  });
});
