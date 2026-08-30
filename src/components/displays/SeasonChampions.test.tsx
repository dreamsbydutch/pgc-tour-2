// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SeasonChampions } from "./SeasonChampions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#leaderboard">{children}</a>
  ),
}));

afterEach(cleanup);

describe("SeasonChampions", () => {
  it("makes the PGC Champion primary and credits the Silver Champion", () => {
    render(
      <SeasonChampions
        seasonYear={2026}
        honors={{
          tournamentId: "tour-championship",
          champion: { displayName: "Gold Winner", score: -22 },
          silverChampion: { displayName: "Silver Winner", score: -14 },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "PGC Champion" })).toBeTruthy();
    expect(screen.getByText("Gold Winner")).toBeTruthy();
    expect(screen.getByText("Silver Champion")).toBeTruthy();
    expect(screen.getByText("Silver Winner")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "View final playoff leaderboard" }),
    ).toBeTruthy();
  });
});
