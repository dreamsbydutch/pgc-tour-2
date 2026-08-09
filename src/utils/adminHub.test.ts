import { describe, expect, it } from "vitest";

import { buildAdminHubOverview } from "./adminHub";

const now = Date.UTC(2026, 7, 9, 16);

const baseTournament = {
  _id: "tournament-1" as never,
  name: "The Northern Open",
  startDate: Date.UTC(2026, 7, 13),
  endDate: Date.UTC(2026, 7, 16),
  status: "upcoming",
  groupedGolferCount: 0,
  totalGolferCount: 70,
  groupsReady: false,
  lastSyncSuccessAt: undefined,
  lastSyncAttemptAt: undefined,
  syncFailureCount: 0,
  syncSkipReason: undefined,
} as const;

describe("buildAdminHubOverview", () => {
  it("puts tournament setup first when groups are not ready", () => {
    const overview = buildAdminHubOverview({
      now,
      appState: {
        currentSeasonId: "season-1" as never,
        nextTournamentId: baseTournament._id,
        seasonPhase: "in-season",
        publicVersion: 1,
      },
      focusTournament: baseTournament,
      pendingSettlementCount: 0,
    });

    expect(overview.stageLabel).toBe("Upcoming");
    expect(overview.readinessLabel).toContain("needs attention");
    expect(overview.recommendation.task).toBe("eventSetup");
  });

  it("recommends the member email when groups are ready and picks are open", () => {
    const overview = buildAdminHubOverview({
      now,
      appState: {
        currentSeasonId: "season-1" as never,
        nextTournamentId: baseTournament._id,
        pickWindowTournamentId: baseTournament._id,
        pickWindowOpensAt: now - 1_000,
        pickWindowClosesAt: now + 1_000,
        seasonPhase: "in-season",
        publicVersion: 1,
      },
      focusTournament: {
        ...baseTournament,
        groupedGolferCount: 70,
        groupsReady: true,
      },
      pendingSettlementCount: 0,
    });

    expect(overview.stageLabel).toBe("Picks open");
    expect(overview.recommendation.task).toBe("weeklyRecap");
  });

  it("surfaces scoring failures during an active event", () => {
    const overview = buildAdminHubOverview({
      now,
      appState: {
        currentSeasonId: "season-1" as never,
        activeTournamentId: baseTournament._id,
        seasonPhase: "in-season",
        publicVersion: 1,
      },
      focusTournament: {
        ...baseTournament,
        status: "active",
        syncFailureCount: 2,
      },
      recentLiveSync: {
        status: "failed",
        startedAt: now - 10_000,
        finishedAt: now - 5_000,
      },
      pendingSettlementCount: 0,
    });

    expect(overview.stageLabel).toBe("Live now");
    expect(overview.readinessLabel).toContain("needs attention");
    expect(overview.recommendation.task).toBe("liveScoring");
  });

  it("surfaces payout work when no tournament action is required", () => {
    const overview = buildAdminHubOverview({
      now,
      appState: {
        seasonPhase: "completed",
        publicVersion: 1,
      },
      pendingSettlementCount: 2,
    });

    expect(overview.eventName).toBe("Season complete");
    expect(overview.recommendation.task).toBe("settlements");
    expect(overview.recommendation.title).toContain("2 payout requests");
  });
});
