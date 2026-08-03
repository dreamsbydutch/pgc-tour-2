import { describe, expect, it } from "vitest";

import {
  buildBulkEmailPreview,
  buildImportTeamsPreview,
  buildPaymentPreview,
  buildRepairPreview,
  toAdminOperationStatus,
  toLatestAdminOperationStatus,
} from "./adminOperations";

describe("admin operation previews", () => {
  it("blocks an import containing any invalid team rows", () => {
    const preview = buildImportTeamsPreview({
      tournamentId: "tournament-1",
      tournamentName: "The Open",
      teamsJson: JSON.stringify([
        { tourCardId: "card-1", golferIds: [1, 2], score: -4.2 },
        { golferIds: [3, 4] },
      ]),
    });

    expect(preview.canRun).toBe(false);
    expect(preview.lines).toContainEqual({
      label: "Rows to import",
      value: "1",
    });
    expect(preview.warnings[0]).toContain("1 row is missing");
  });

  it("summarizes a valid team import without mutating data", () => {
    const preview = buildImportTeamsPreview({
      tournamentId: "tournament-1",
      tournamentName: "The Open",
      teamsJson: JSON.stringify([
        {
          tourCardId: "card-1",
          golferIds: [1, 2],
          score: -4.2,
          position: "1",
        },
        { tourCardId: "card-2", golferIds: [3, 4] },
      ]),
    });

    expect(preview.canRun).toBe(true);
    expect(preview.lines).toEqual(
      expect.arrayContaining([
        { label: "Rows to import", value: "2" },
        { label: "Rows with scores", value: "1" },
        { label: "Rows with positions", value: "1" },
      ]),
    );
    expect(preview.warnings).toEqual([]);
  });

  it("shows the resulting balance in a payment dry run", () => {
    const preview = buildPaymentPreview({
      memberName: "Ada Lovelace",
      seasonName: "2026 (Season 12)",
      currentBalanceCents: -5_000,
      amountDollars: "100.00",
    });

    expect(preview.canRun).toBe(true);
    expect(
      preview.lines.find((line) => line.label === "Balance after payment")
        ?.value,
    ).toContain("50.00");
  });

  it("requires a recipient and target before bulk email or repair", () => {
    expect(
      buildBulkEmailPreview({ recipientCount: 0, customBlurb: "" }).canRun,
    ).toBe(false);
    expect(buildRepairPreview({}).canRun).toBe(false);
  });
});

describe("admin operation run status", () => {
  it("exposes busy and completion metadata", () => {
    expect(
      toAdminOperationStatus({ status: "running", startedAt: 1_000 }),
    ).toMatchObject({ isBusy: true, statusLabel: "Running", tone: "running" });

    expect(
      toAdminOperationStatus({
        status: "succeeded",
        startedAt: 1_000,
        finishedAt: 2_500,
        result: "done",
      }),
    ).toMatchObject({
      isBusy: false,
      statusLabel: "Completed",
      tone: "success",
      result: "done",
    });
  });

  it("uses the most recently started run for a grouped card", () => {
    expect(
      toLatestAdminOperationStatus([
        { status: "succeeded", startedAt: 1_000, finishedAt: 1_500 },
        { status: "failed", startedAt: 2_000, finishedAt: 2_200 },
      ]),
    ).toMatchObject({ statusLabel: "Failed", tone: "error" });
  });
});
