import { describe, expect, it } from "vitest";

import { resolveTournamentLeaderboardState } from "./tournamentLeaderboardStatus";

const now = 1_000;

describe("tournament leaderboard status", () => {
  it("shows completed and past-ended tournaments as final", () => {
    expect(
      resolveTournamentLeaderboardState({
        status: "completed",
        startDate: 100,
        endDate: 200,
        freshness: "live",
        now,
      }),
    ).toBe("final");

    expect(
      resolveTournamentLeaderboardState({
        status: "active",
        startDate: 100,
        endDate: 200,
        freshness: "live",
        now,
      }),
    ).toBe("final");
  });

  it("uses connection freshness only for a tournament in progress", () => {
    const tournament = {
      status: "active" as const,
      startDate: 900,
      endDate: 1_100,
      now,
    };

    expect(
      resolveTournamentLeaderboardState({
        ...tournament,
        freshness: "live",
      }),
    ).toBe("live");
    expect(
      resolveTournamentLeaderboardState({
        ...tournament,
        freshness: "stale",
      }),
    ).toBe("reconnecting");
  });

  it("identifies upcoming and cancelled tournaments", () => {
    expect(
      resolveTournamentLeaderboardState({
        status: "upcoming",
        startDate: 1_100,
        endDate: 1_200,
        freshness: "live",
        now,
      }),
    ).toBe("upcoming");
    expect(
      resolveTournamentLeaderboardState({
        status: "cancelled",
        startDate: 100,
        endDate: 200,
        freshness: "live",
        now,
      }),
    ).toBe("cancelled");
  });
});
