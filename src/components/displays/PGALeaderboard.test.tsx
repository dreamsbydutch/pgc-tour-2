// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PGAHoleScorecard } from "./PGALeaderboard";

describe("PGAHoleScorecard", () => {
  it("renders 18 holes, four rounds, placeholders, and score descriptions", () => {
    const relativeToPar = new Map([
      [1, -1],
      [2, -2],
      [3, 1],
      [4, 2],
      [5, -0.5],
    ]);
    const holes = Array.from({ length: 18 }, (_, index) => {
      const hole = index + 1;
      const relative = relativeToPar.get(hole) ?? 0;
      return { hole, strokes: 4 + relative, relativeToPar: relative };
    });
    render(
      <PGAHoleScorecard
        scorecard={{
          rounds: [
            {
              round: 1,
              totalStrokes: 72,
              holes,
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "18" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "OUT" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "IN" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "TOT" })).toBeTruthy();
    expect(screen.getAllByRole("rowheader")).toHaveLength(5);
    expect(screen.getByRole("rowheader", { name: "Par" })).toBeTruthy();
    expect(screen.getByLabelText("3 strokes, birdie")).toBeTruthy();
    expect(
      screen
        .getByLabelText("2 strokes, eagle or better")
        .getAttribute("data-score-shape"),
    ).toBe("double-circle");
    expect(screen.getByLabelText("5 strokes, bogey")).toBeTruthy();
    expect(
      screen
        .getByLabelText("6 strokes, double bogey or worse")
        .getAttribute("data-score-shape"),
    ).toBe("double-square");
    expect(
      screen
        .getByLabelText("3.5 strokes, under-par average")
        .getAttribute("data-score-shape"),
    ).toBe("circle");
    expect(screen.getAllByText("36").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("72").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("renders loading and unavailable states independently", () => {
    const { rerender } = render(<PGAHoleScorecard scorecard={undefined} />);
    expect(screen.getByText("Loading hole-by-hole scoring...")).toBeTruthy();
    rerender(<PGAHoleScorecard scorecard={null} />);
    expect(screen.getByText("Hole-by-hole scoring unavailable.")).toBeTruthy();
  });
});
