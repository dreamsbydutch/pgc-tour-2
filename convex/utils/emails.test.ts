import { describe, expect, it } from "vitest";
import { findPreviousCompletedTournament } from "./emails";

describe("findPreviousCompletedTournament", () => {
  it("returns the most recent completed tournament before the current one", () => {
    const previous = findPreviousCompletedTournament({
      tournaments: [
        { _id: "old", startDate: 100, status: "completed" as const },
        { _id: "recent", startDate: 200, status: "completed" as const },
        { _id: "current", startDate: 300, status: "active" as const },
      ],
      startDate: 300,
    });

    expect(previous?._id).toBe("recent");
  });

  it("ignores tournaments that have ended but are still active", () => {
    const previous = findPreviousCompletedTournament({
      tournaments: [
        { _id: "ended-active", startDate: 200, status: "active" as const },
        { _id: "completed", startDate: 100, status: "completed" as const },
        { _id: "current", startDate: 300, status: "active" as const },
      ],
      startDate: 300,
    });

    expect(previous?._id).toBe("completed");
  });
});
