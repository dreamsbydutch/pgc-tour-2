import { describe, expect, it } from "vitest";
import {
  buildPlayoffAssignments,
  buildPlayoffStartingStrokes,
} from "./playoffs";

describe("playoff assignments", () => {
  it("assigns the top 15 to Gold, the next 20 to Silver, and the rest out", () => {
    const cards = Array.from({ length: 36 }, (_, index) => ({
      id: `card-${index + 1}`,
      tourId: "tour-a",
      points: 1_000 - index,
    }));
    const assignments = buildPlayoffAssignments({
      cards,
      tours: [{ id: "tour-a", playoffSpots: [15, 20] }],
    });

    expect(assignments.get("card-15")).toBe(1);
    expect(assignments.get("card-16")).toBe(2);
    expect(assignments.get("card-35")).toBe(2);
    expect(assignments.get("card-36")).toBe(0);
  });

  it("preserves a points tie that crosses a bracket boundary", () => {
    const cards = [
      { id: "first", tourId: "tour-a", points: 100 },
      { id: "tied-a", tourId: "tour-a", points: 90 },
      { id: "tied-b", tourId: "tour-a", points: 90 },
      { id: "fourth", tourId: "tour-a", points: 80 },
    ];
    const assignments = buildPlayoffAssignments({
      cards,
      tours: [{ id: "tour-a", playoffSpots: [2, 1] }],
    });

    expect(assignments.get("tied-a")).toBe(1);
    expect(assignments.get("tied-b")).toBe(1);
    expect(assignments.get("fourth")).toBe(0);
  });
});

describe("playoff starting strokes", () => {
  it("scales Gold from -10 to even par and averages occupied tie slots", () => {
    const strokes = buildPlayoffStartingStrokes(
      [
        { id: "leader", points: 100 },
        { id: "tie-a", points: 50 },
        { id: "tie-b", points: 50 },
        { id: "last", points: 0 },
      ],
      1,
    );

    expect(strokes.get("leader")).toBe(-10);
    expect(strokes.get("tie-a")).toBe(-5);
    expect(strokes.get("tie-b")).toBe(-5);
    expect(strokes.get("last")).toBe(0);
  });

  it("starts Silver qualifiers below the 36th slot at even par", () => {
    const cards = Array.from({ length: 40 }, (_, index) => ({
      id: `card-${index + 1}`,
      points: 1_000 - index,
    }));
    const strokes = buildPlayoffStartingStrokes(cards, 2);

    expect(strokes.get("card-1")).toBe(-10);
    expect(strokes.get("card-36")).toBe(0);
    expect(strokes.get("card-40")).toBe(0);
  });
});
