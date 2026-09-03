// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex";
import type { AccountSeasonFinancial } from "@/types";
import { SeasonWinningsCard } from "./SeasonWinningsCard";

const financial = {
  seasonId: "season-1" as Id<"seasons">,
  seasonLabel: "2026 Season 1",
  year: 2026,
  number: 1,
  earningsCents: 50_000,
  accountOffsetCents: 0,
  availableCents: 50_000,
  isComplete: true,
  request: null,
} satisfies AccountSeasonFinancial;

afterEach(cleanup);

describe("SeasonWinningsCard", () => {
  it("shows the balance and every season-end allocation choice", () => {
    const keepRemaining = vi.fn();
    const reserveCard = vi.fn();
    render(
      <SeasonWinningsCard
        balanceCents={50_000}
        financial={financial}
        transferAmount="100.00"
        onTransferAmountChange={vi.fn()}
        charityAmount=""
        onCharityAmountChange={vi.fn()}
        leagueAmount=""
        onLeagueAmountChange={vi.fn()}
        retainedAmount=""
        onRetainedAmountChange={vi.fn()}
        nextSeasonCard={false}
        onNextSeasonCardChange={reserveCard}
        payoutEmail="member@example.com"
        onPayoutEmailChange={vi.fn()}
        parsedAmounts={{
          valid: true,
          transferCents: 10_000,
          retainedCents: 0,
          allocatedCents: 10_000,
          remainingCents: 40_000,
        }}
        canSubmit
        submitting={false}
        submitError={null}
        submitSuccess={null}
        onAllocateRemainingToTransfer={vi.fn()}
        onAllocateRemainingToAccount={keepRemaining}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Available balance")).toBeTruthy();
    expect(
      (screen.getByLabelText(/E-transfer email/) as HTMLInputElement).value,
    ).toBe("member@example.com");
    expect(screen.getByText("Donate to charity")).toBeTruthy();
    expect(screen.getByText("Donate to the PGC")).toBeTruthy();
    expect(screen.getByText("Leave in my account")).toBeTruthy();
    const allocationRow = document
      .getElementById("settlement-transfer")
      ?.closest("label")?.parentElement;
    expect(allocationRow?.className).toContain("items-end");
    const cardButton = screen.getByRole("button", {
      name: "Secure your 2027 spot",
    });
    fireEvent.click(cardButton);
    expect(reserveCard).toHaveBeenCalledWith(true);

    const balanceHeading = screen.getByRole("heading", {
      name: "Available balance",
    });
    expect(balanceHeading.closest("[class*='bg-golf-900']")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Keep the rest" }));
    expect(keepRemaining).toHaveBeenCalledOnce();
  });

  it("hides the tour-card action when less than $100 is available", () => {
    const view = render(
      <SeasonWinningsCard
        balanceCents={5_000}
        financial={{ ...financial, availableCents: 5_000 }}
        transferAmount=""
        onTransferAmountChange={vi.fn()}
        charityAmount=""
        onCharityAmountChange={vi.fn()}
        leagueAmount=""
        onLeagueAmountChange={vi.fn()}
        retainedAmount=""
        onRetainedAmountChange={vi.fn()}
        nextSeasonCard={false}
        onNextSeasonCardChange={vi.fn()}
        payoutEmail="member@example.com"
        onPayoutEmailChange={vi.fn()}
        parsedAmounts={{
          valid: true,
          transferCents: 0,
          retainedCents: 0,
          allocatedCents: 0,
          remainingCents: 5_000,
        }}
        canSubmit
        submitting={false}
        submitError={null}
        submitSuccess={null}
        onAllocateRemainingToTransfer={vi.fn()}
        onAllocateRemainingToAccount={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      view.queryByRole("button", { name: "Secure your 2027 spot" }),
    ).toBeNull();
  });
});
