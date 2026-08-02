// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LeaderboardStandingsCard } from "./LeaderboardStandingsCard";

afterEach(cleanup);

describe("LeaderboardStandingsCard", () => {
  it("renders the official and live snapshots with playoff starting strokes", () => {
    render(
      <LeaderboardStandingsCard
        snapshot={{
          tourCardId: "card-1",
          beforeTournament: {
            position: "12th",
            points: 1_200,
            destination: "silver",
            startingStrokes: -2.5,
          },
          live: {
            position: "T8th",
            points: 1_350,
            destination: "gold",
            startingStrokes: -4.6,
          },
          lastUpdatedAt: Date.UTC(2026, 7, 1, 18, 30),
        }}
      />,
    );

    expect(screen.getByText("Before tournament")).toBeTruthy();
    expect(screen.getByText("Live projection")).toBeTruthy();
    expect(screen.getByText("12th").className).toContain("text-slate-500");
    expect(screen.getByText("12th").className).toContain("text-lg");
    expect(screen.getByText("12th").className).not.toContain("text-3xl");
    expect(screen.getByText("T8th").className).toContain("text-amber-700");
    expect(screen.getByText("1,200 pts")).toBeTruthy();
    expect(screen.getByText("1,350 pts")).toBeTruthy();
    expect(screen.getByText("-2.5")).toBeTruthy();
    expect(screen.getByText("-4.6")).toBeTruthy();
    expect(screen.getAllByText(/Playoff start/)).toHaveLength(2);
    expect(screen.queryByText("Standings")).toBeNull();
    expect(screen.queryByText(/Updated/)).toBeNull();
    const card = screen.getByLabelText("Standings comparison");
    expect(card.className).toContain("mx-2");
    expect(card.className).toContain("sm:mx-auto");
    expect(card.className).toContain("sm:max-w-lg");
  });

  it("renders an explicit red Out state without a starting-stroke row", () => {
    render(
      <LeaderboardStandingsCard
        snapshot={{
          tourCardId: "card-2",
          beforeTournament: {
            position: "30th",
            points: 300,
            destination: "out",
            startingStrokes: null,
          },
          live: {
            position: "28th",
            points: 350,
            destination: "out",
            startingStrokes: null,
          },
          lastUpdatedAt: null,
        }}
      />,
    );

    expect(screen.getAllByText("Out")).toHaveLength(2);
    expect(screen.getByText("28th").className).toContain("text-red-600");
    expect(screen.queryByText(/Playoff start/)).toBeNull();
    expect(screen.queryByText(/Awaiting leaderboard timestamp/)).toBeNull();
  });

  it("renders an awaiting state when live points are unavailable", () => {
    render(
      <LeaderboardStandingsCard
        snapshot={{
          tourCardId: "card-3",
          beforeTournament: {
            position: "5th",
            points: 800,
            destination: "gold",
            startingStrokes: -7.5,
          },
          live: null,
          lastUpdatedAt: null,
        }}
      />,
    );

    expect(screen.getByText("Awaiting live update")).toBeTruthy();
    expect(screen.getByText("-7.5")).toBeTruthy();
  });
});
