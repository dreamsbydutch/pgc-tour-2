// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TournamentPulseStrip } from "./TournamentPulseStrip";

afterEach(cleanup);

describe("TournamentPulseStrip", () => {
  it("shows compact live context and runs jump-to-team", () => {
    const jumpToTeam = vi.fn();
    render(
      <TournamentPulseStrip
        model={{
          position: "T4",
          score: "-9",
          movement: "Up 3",
          rival: "0.4 strokes behind D. Perry",
          seasonProjection: "7th projected · Gold",
          terminal: null,
          jumpToTeam,
        }}
      />,
    );
    expect(screen.getByText("T4")).toBeTruthy();
    expect(screen.getByText("Up 3")).toBeTruthy();
    expect(screen.getByText(/Season: 7th projected · Gold/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Jump to my team" }));
    expect(jumpToTeam).toHaveBeenCalledOnce();
  });

  it("announces terminal status instead of numeric movement", () => {
    render(
      <TournamentPulseStrip
        model={{
          position: "CUT",
          score: "CUT",
          movement: "CUT — movement unavailable",
          rival: null,
          seasonProjection: null,
          terminal: "CUT",
          jumpToTeam: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText("CUT — movement unavailable")).toBeTruthy();
    expect(screen.queryByText(/Up /)).toBeNull();
  });
});
