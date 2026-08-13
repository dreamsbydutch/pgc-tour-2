// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex";
import type { AdminSettlementRequest } from "@/types";
import { SettlementHub } from "./SettlementHub";

const requestId = "request-1" as Id<"settlementRequests">;
const request = {
  _id: requestId,
  _creationTime: 1,
  memberId: "member-1" as Id<"members">,
  seasonId: "season-1" as Id<"seasons">,
  memberName: "Test Member",
  memberEmail: "member@example.com",
  seasonLabel: "2026 Season 1",
  earningsCents: 40_000,
  accountOffsetCents: 0,
  availableCents: 40_000,
  transferCents: 30_000,
  charityCents: 0,
  leagueCents: 0,
  nextSeasonCardCents: 10_000,
  payoutEmail: "payout@example.com",
  status: "pending",
  submittedAt: 1,
  updatedAt: 1,
} satisfies AdminSettlementRequest;

describe("SettlementHub", () => {
  it("shows actionable allocations and sends the selected item to its hook", () => {
    const onComplete = vi.fn();
    render(
      <SettlementHub
        requests={[request]}
        visibleRequests={[request]}
        filter="open"
        onFilterChange={vi.fn()}
        pendingCount={1}
        pendingTransferTotal={30_000}
        busyKey={null}
        feedback={null}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Test Member")).toBeTruthy();
    expect(screen.getByText("payout@example.com")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Check off" })).toHaveLength(
      2,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Check off" })[0]!);
    expect(onComplete).toHaveBeenCalledWith(requestId, "transfer");
  });
});
