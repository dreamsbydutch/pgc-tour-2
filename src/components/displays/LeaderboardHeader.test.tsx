// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TournamentHeaderModel } from "@/types";

import { LeaderboardHeader } from "./LeaderboardHeader";

vi.mock("@/hooks", () => ({
  useTournamentCourseStats: () => ({
    data: {
      status: "available",
      eventName: "Rocket Classic",
      courseName: "Detroit Golf Club",
      courseCode: "DETROIT",
      round: 4,
      lastUpdated: "Aug 2, 4:00 PM",
    },
    rows: [
      {
        hole: 1,
        par: 4,
        yardage: 397,
        average: 3.82,
        relativeToPar: -0.18,
        underParPercent: 30,
        parPercent: 52,
        overParPercent: 18,
      },
    ],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

afterEach(cleanup);

const tournament: TournamentHeaderModel = {
  _id: "tournament-1",
  name: "Rocket Classic",
  startDate: Date.UTC(2026, 6, 30),
  endDate: Date.UTC(2026, 7, 2),
  logoUrl: "/rocket.png",
  season: { year: 2026 },
  tier: {
    name: "Standard",
    points: [600, 400],
    payouts: [7_500, 5_000],
  },
  course: {
    name: "Detroit Golf Club",
    location: "Detroit, MI",
    front: 35,
    back: 35,
    par: 70,
  },
};

describe("LeaderboardHeader", () => {
  it("keeps all tournament metadata visible and opens the awards breakdown", async () => {
    render(
      <LeaderboardHeader
        tournament={tournament}
        allTournaments={[tournament]}
        onTournamentChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Rocket Classic" }),
    ).toBeTruthy();
    expect(screen.getByText("Detroit, MI")).toBeTruthy();
    expect(screen.getByText("35 - 35 - 70")).toBeTruthy();
    expect(
      screen.getByText("Standard Tournament - 1st Place: 600 pts, $75"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByTitle("View the full points and payout breakdown"),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Points & payouts")).toBeTruthy();
    expect(within(dialog).getByText("600")).toBeTruthy();
    expect(within(dialog).getByText("$75.00")).toBeTruthy();
    expect(within(dialog).getByText("400")).toBeTruthy();
    expect(within(dialog).getByText("$50.00")).toBeTruthy();
  });

  it("opens live hole difficulty details from the course metadata", async () => {
    render(
      <LeaderboardHeader
        tournament={tournament}
        allTournaments={[tournament]}
        onTournamentChange={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getAllByTitle("View hole-by-hole course scoring")[0]!,
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Detroit Golf Club")).toBeTruthy();
    expect(
      within(dialog).getByText("Round 4 · DataGolf live scoring"),
    ).toBeTruthy();
    expect(within(dialog).getByText("3.82")).toBeTruthy();
    expect(within(dialog).getByText("-0.18")).toBeTruthy();
    expect(within(dialog).getByText("30.0%")).toBeTruthy();
    expect(within(dialog).getByText("52.0%")).toBeTruthy();
    expect(within(dialog).getByText("18.0%")).toBeTruthy();
  });
});
