// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PGAHoleScorecard } from "./PGALeaderboard";

describe("PGAHoleScorecard", () => {
  it("renders 18 holes, four rounds, placeholders, and score descriptions", () => {
    render(
      <PGAHoleScorecard
        scorecard={{
          rounds: [
            {
              round: 1,
              holes: [
                { hole: 1, strokes: 3, relativeToPar: -1 },
                { hole: 2, strokes: 2, relativeToPar: -2 },
                { hole: 3, strokes: 5, relativeToPar: 1 },
                { hole: 4, strokes: 6, relativeToPar: 2 },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "18" })).toBeTruthy();
    expect(screen.getAllByRole("rowheader")).toHaveLength(4);
    expect(screen.getByLabelText("3 strokes, birdie")).toBeTruthy();
    expect(screen.getByLabelText("2 strokes, eagle or better")).toBeTruthy();
    expect(screen.getByLabelText("5 strokes, bogey")).toBeTruthy();
    expect(
      screen.getByLabelText("6 strokes, double bogey or worse"),
    ).toBeTruthy();
    expect(screen.getAllByText("–").length).toBeGreaterThan(0);
  });

  it("renders loading and unavailable states independently", () => {
    const { rerender } = render(<PGAHoleScorecard scorecard={undefined} />);
    expect(screen.getByText("Loading hole-by-hole scoring…")).toBeTruthy();
    rerender(<PGAHoleScorecard scorecard={null} />);
    expect(screen.getByText("Hole-by-hole scoring unavailable.")).toBeTruthy();
  });
});
