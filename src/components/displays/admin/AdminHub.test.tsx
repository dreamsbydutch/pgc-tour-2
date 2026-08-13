// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminOperationStatus } from "@/types";

import { AdminHub } from "./AdminHub";

afterEach(cleanup);

const readyStatus: AdminOperationStatus = {
  isBusy: false,
  statusLabel: "Ready",
  lastRunLabel: "Not run in this session",
  tone: "idle",
};

const operationStatus = {
  createGroups: readyStatus,
  liveSync: readyStatus,
  liveSyncForce: readyStatus,
  updateWorldRank: readyStatus,
  weeklyRecapTest: readyStatus,
  weeklyRecapSendAll: readyStatus,
  missingTeamReminderSend: readyStatus,
  createPayment: readyStatus,
  recomputeStandings: readyStatus,
  backfillStandings: readyStatus,
  backfillTeamMetadata: readyStatus,
  repairTournament: readyStatus,
  importTeams: readyStatus,
};

describe("AdminHub", () => {
  it("opens a focused task from the recommendation and quick actions", () => {
    const onOpenTask = vi.fn();
    render(
      <AdminHub
        overview={{
          eventName: "The Northern Open",
          eventMeta: "Aug 13–16",
          stageLabel: "Picks open",
          stageTone: "open",
          readinessLabel: "Groups ready",
          readinessDetail: "70 golfers are grouped.",
          recommendation: {
            task: "weeklyRecap",
            eyebrow: "Picks are open",
            title: "Send the weekly recap",
            detail: "Notify eligible members.",
            actionLabel: "Open weekly email",
          },
        }}
        operationStatus={operationStatus}
        groupStatus={{
          eventSetup: readyStatus,
          liveSync: readyStatus,
          weeklyRecap: readyStatus,
          standings: readyStatus,
        }}
        pendingSettlementCount={0}
        pendingTransferTotal={0}
        onOpenTask={onOpenTask}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open weekly email/i }));
    expect(onOpenTask).toHaveBeenCalledWith("weeklyRecap");

    fireEvent.click(screen.getByRole("button", { name: "Live scoring" }));
    expect(onOpenTask).toHaveBeenCalledWith("liveScoring");

    fireEvent.click(screen.getByRole("button", { name: "Remind picks" }));
    expect(onOpenTask).toHaveBeenCalledWith("pickReminder");
  });

  it("keeps recovery tools collapsed by default", () => {
    render(
      <AdminHub
        overview={{
          eventName: "No tournament scheduled",
          eventMeta: "The admin hub will update when an event is available.",
          stageLabel: "Offseason",
          stageTone: "neutral",
          readinessLabel: "No tournament action needed",
          readinessDetail: "Member tools remain available.",
          recommendation: {
            task: null,
            eyebrow: "You’re caught up",
            title: "No immediate admin action",
            detail: "Scheduled jobs continue in the background.",
            actionLabel: null,
          },
        }}
        operationStatus={operationStatus}
        groupStatus={{
          eventSetup: readyStatus,
          liveSync: readyStatus,
          weeklyRecap: readyStatus,
          standings: readyStatus,
        }}
        pendingSettlementCount={0}
        pendingTransferTotal={0}
        onOpenTask={vi.fn()}
      />,
    );

    const recoveryGroup = screen.getByText("Fix a problem").closest("details");
    expect(recoveryGroup?.hasAttribute("open")).toBe(false);
  });
});
