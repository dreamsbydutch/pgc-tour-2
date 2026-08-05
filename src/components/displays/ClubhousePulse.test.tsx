// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClubhousePulseCardViewModel, ClubhousePulseModel } from "@/types";
import { ClubhousePulse, ClubhousePulseSkeleton } from "./ClubhousePulse";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a href="#pulse" onClick={onClick}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

function card(
  phase: ClubhousePulseCardViewModel["phase"],
): ClubhousePulseCardViewModel {
  const title = {
    live: "Pulse Open",
    picks_open: "Roster needed",
    between_events: "Latest result",
    season_complete: "Final season card",
  }[phase];
  return {
    cardId: "card-1",
    tourId: "tour-1",
    phase,
    eyebrow: `TEST · ${phase}`,
    title,
    statusLabel: phase === "live" ? "Live" : "Official",
    isLive: phase === "live",
    stats: [
      {
        label: "Position",
        value: "T3",
        accessibleLabel: "Position tied third",
      },
      { label: "Score", value: "-8", accessibleLabel: "Score eight under" },
      { label: "Today", value: "-2", accessibleLabel: "Today two under" },
    ],
    stories: [{ kind: "movement", text: "Up 4 spots today" }],
    officialStanding: null,
    projectedStanding: null,
    action: {
      label: phase === "picks_open" ? "Pick my team" : "Open standings",
      destination: phase === "picks_open" ? "picks" : "standings",
      tourId: "tour-1",
    },
    lastUpdatedAt: null,
  };
}

function model(
  phase: ClubhousePulseCardViewModel["phase"],
  overrides?: Partial<Extract<ClubhousePulseModel, { kind: "ready" }>>,
): Extract<ClubhousePulseModel, { kind: "ready" }> {
  return {
    kind: "ready",
    freshness: "live",
    tabs: [{ cardId: "card-1", label: "TEST", tourName: "Test Tour" }],
    selectedCardId: "card-1",
    card: card(phase),
    selectCard: vi.fn(),
    activateAction: vi.fn(),
    ...overrides,
  };
}

describe("ClubhousePulse", () => {
  it.each([
    ["live", "Pulse Open"],
    ["picks_open", "Roster needed"],
    ["between_events", "Latest result"],
    ["season_complete", "Final season card"],
  ] as const)("renders the %s phase", (phase, title) => {
    render(<ClubhousePulse model={model(phase)} />);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByLabelText("Position tied third")).toBeTruthy();
    expect(screen.getByText("Up 4 spots today")).toBeTruthy();
  });

  it("switches tour cards and announces reconnecting data", () => {
    const selectCard = vi.fn();
    render(
      <ClubhousePulse
        model={model("live", {
          freshness: "stale",
          tabs: [
            { cardId: "card-1", label: "A", tourName: "Alpha Tour" },
            { cardId: "card-2", label: "B", tourName: "Beta Tour" },
          ],
          selectCard,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Beta Tour" }));
    expect(selectCard).toHaveBeenCalledWith("card-2");
    expect(screen.getByText("Reconnecting")).toBeTruthy();
  });

  it("tracks its CTA and renders a dimensionally stable loading state", () => {
    const activateAction = vi.fn();
    const { rerender } = render(
      <ClubhousePulse model={model("picks_open", { activateAction })} />,
    );
    fireEvent.click(screen.getByRole("link", { name: /Pick my team/ }));
    expect(activateAction).toHaveBeenCalledOnce();
    rerender(<ClubhousePulseSkeleton />);
    expect(screen.getByLabelText("Loading Clubhouse Pulse")).toBeTruthy();
  });
});
