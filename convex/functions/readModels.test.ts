import { describe, expect, it } from "vitest";
import { shouldScheduleLiveSyncBoundary } from "./readModels";

describe("live-sync boundary scheduling", () => {
  it("reschedules the same tournament when its opening tee time moves", () => {
    expect(
      shouldScheduleLiveSyncBoundary({
        scheduledTournamentId: "tournament-1",
        scheduledAt: 100,
        tournamentId: "tournament-1",
        startDate: 90,
      }),
    ).toBe(true);
  });

  it("does not duplicate an unchanged boundary", () => {
    expect(
      shouldScheduleLiveSyncBoundary({
        scheduledTournamentId: "tournament-1",
        scheduledAt: 100,
        tournamentId: "tournament-1",
        startDate: 100,
      }),
    ).toBe(false);
  });

  it("schedules a different upcoming tournament", () => {
    expect(
      shouldScheduleLiveSyncBoundary({
        scheduledTournamentId: "tournament-1",
        scheduledAt: 100,
        tournamentId: "tournament-2",
        startDate: 200,
      }),
    ).toBe(true);
  });
});
