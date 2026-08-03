// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AdminConfirmationDialog,
  AdminOperationFeedback,
} from "./AdminOperationUi";

afterEach(cleanup);

describe("AdminConfirmationDialog", () => {
  it("requires a second explicit action after showing the dry-run details", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <AdminConfirmationDialog
        request={{
          operation: "createPayment",
          title: "Record this payment?",
          description: "Review the payment before continuing.",
          confirmLabel: "Record payment",
          preview: {
            title: "Payment dry run",
            description: "No transaction has been recorded yet.",
            lines: [
              { label: "Member", value: "Ada Lovelace" },
              { label: "Balance after payment", value: "$50.00" },
            ],
            warnings: [],
            canRun: true,
          },
        }}
        busy={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Payment dry run")).toBeTruthy();
    expect(screen.getByText("$50.00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("AdminOperationFeedback", () => {
  it("announces the last-run result", () => {
    render(
      <AdminOperationFeedback
        status={{
          isBusy: false,
          statusLabel: "Completed",
          lastRunLabel: "Aug 2, 2026, 9:45 p.m. · 1.2 s",
          result: '{"updated":12}',
          tone: "success",
        }}
      />,
    );

    expect(screen.getByText(/Last run:/)).toBeTruthy();
    expect(screen.getByText('{"updated":12}')).toBeTruthy();
  });
});
