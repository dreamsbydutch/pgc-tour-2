// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PGADropdown, PGAHoleScorecard } from "./PGALeaderboard";

afterEach(cleanup);

describe("PGADropdown", () => {
  it("leads with the country flag and keeps stats in one strip without duplicate rounds", () => {
    render(
      <PGADropdown
        golfer={{
          apiId: 1,
          country: "USA",
          position: "T8",
          group: 3,
          rating: 60.69,
          makeCut: 1,
          topTen: 1,
          win: 0,
          worldRank: 55,
          usage: 0.25,
        }}
        holeScorecard={null}
      />,
    );

    const flag = screen.getByRole("img", { name: "USA flag" });
    expect(flag.className).toContain("text-3xl");
    expect(flag.className).not.toContain("border");
    expect(flag.className).not.toContain("bg-");
    expect(flag.className).not.toContain("shadow");
    expect(screen.queryByText("Rounds")).toBeNull();

    const stats = screen.getByRole("group", { name: "Golfer statistics" });
    for (const label of [
      "Make Cut",
      "Top Ten",
      "Win",
      "WGR",
      "Rating",
      "Usage",
      "Group",
    ]) {
      expect(within(stats).getByText(label)).toBeTruthy();
    }
  });
});

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

  it("renders a blank scorecard grid when no golfer has started", () => {
    render(<PGAHoleScorecard scorecard={{ rounds: [] }} />);

    expect(screen.getByLabelText("Hole-by-hole scorecard")).toBeTruthy();
    expect(screen.queryByText("Hole-by-hole scoring unavailable.")).toBeNull();
    expect(screen.getByRole("columnheader", { name: "1" })).toBeTruthy();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("marks invented WD penalty holes without changing normal holes", () => {
    render(
      <PGAHoleScorecard
        scorecard={{
          rounds: [
            {
              round: 1,
              holes: [
                { hole: 1, strokes: 4, relativeToPar: 0 },
                {
                  hole: 2,
                  strokes: 5,
                  relativeToPar: 1,
                  synthetic: true,
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(
      screen
        .getAllByLabelText("4 strokes, par")
        .every((score) => score.dataset.synthetic === undefined),
    ).toBe(true);
    const invented = screen.getByLabelText(
      "5 strokes, bogey, estimated WD penalty score",
    );
    expect(invented.dataset.synthetic).toBe("true");
    expect(invented.className).toContain("text-red-700");
  });

  it("uses a very light in-cell fill for team hole completion", () => {
    render(
      <PGAHoleScorecard
        scorecard={{
          rounds: [
            {
              round: 1,
              holes: [
                {
                  hole: 1,
                  strokes: 4,
                  relativeToPar: 0,
                  completion: { completed: 3, total: 10 },
                },
              ],
            },
          ],
        }}
      />,
    );

    const progressCell = screen
      .getByText("3 of 10 golfers finished this hole")
      .closest("td");
    expect(progressCell?.title).toBe("3 of 10 golfers finished this hole");
    expect(progressCell?.style.backgroundImage).toContain(
      "rgba(148, 163, 184, 0.12) 30%",
    );
  });

  it("withholds team OUT, IN, and TOT until their holes are fully complete", () => {
    const buildHoles = (frontCompleted: number, backCompleted: number) =>
      Array.from({ length: 18 }, (_, index) => ({
        hole: index + 1,
        strokes: 4,
        relativeToPar: 0,
        completion: {
          completed: index < 9 ? frontCompleted : backCompleted,
          total: 10,
        },
      }));
    const scorecard = (frontCompleted: number, backCompleted: number) => ({
      rounds: [
        {
          round: 1,
          holes: buildHoles(frontCompleted, backCompleted),
        },
      ],
    });
    const { container, rerender } = render(
      <PGAHoleScorecard scorecard={scorecard(9, 9)} />,
    );
    const summaryValues = () => {
      const cells = container.querySelectorAll("tbody tr:first-child td");
      return [cells[9], cells[19], cells[20]].map((cell) => cell?.textContent);
    };

    expect(summaryValues()).toEqual(["-", "-", "-"]);

    rerender(<PGAHoleScorecard scorecard={scorecard(10, 9)} />);
    expect(summaryValues()).toEqual(["36", "-", "-"]);

    rerender(<PGAHoleScorecard scorecard={scorecard(10, 10)} />);
    expect(summaryValues()).toEqual(["36", "36", "72"]);
  });
});
