// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UseTournamentPulseStripArgs } from "@/types";
import {
  getTournamentPulseRowId,
  useTournamentPulseStrip,
} from "./useTournamentPulseStrip";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function args(
  overrides?: Partial<UseTournamentPulseStripArgs>,
): UseTournamentPulseStripArgs {
  return {
    tournament: {
      _id: "tournament-1",
      name: "Pulse Open",
      startDate: 1,
      endDate: 2,
      seasonId: "season-1",
      tierId: "tier-1",
      courseId: "course-1",
      status: "active",
      currentRound: 2,
      livePlay: true,
      isPlayoff: false,
      eventIndex: 0,
    } as UseTournamentPulseStripArgs["tournament"],
    activeTourId: "tour-1",
    variant: "regular",
    teams: [
      {
        _id: "team-1",
        tournamentId: "tournament-1",
        tourCardId: "card-1",
        tourId: "tour-1",
        memberId: "member-1",
        displayName: "Viewer Member",
        position: "2",
        score: -8,
        posChange: 2,
      },
    ] as UseTournamentPulseStripArgs["teams"],
    currentTourCardId: "card-1",
    viewerMemberId: "member-1",
    friendIds: new Set(),
    standingsSnapshots: new Map(),
    ...overrides,
  };
}

describe("useTournamentPulseStrip", () => {
  it("does not build a strip for PGA, completed events, or unmatched viewers", () => {
    expect(
      renderHook(() => useTournamentPulseStrip(args({ activeTourId: "pga" })))
        .result.current,
    ).toBeNull();
    expect(
      renderHook(() =>
        useTournamentPulseStrip(
          args({
            tournament: {
              ...args().tournament,
              status: "completed",
            },
          }),
        ),
      ).result.current,
    ).toBeNull();
    expect(
      renderHook(() =>
        useTournamentPulseStrip(
          args({ currentTourCardId: "missing", viewerMemberId: "missing" }),
        ),
      ).result.current,
    ).toBeNull();
  });

  it("centers and focuses the viewer row while respecting reduced motion", () => {
    const row = document.createElement("div");
    row.id = getTournamentPulseRowId("card-1");
    row.tabIndex = -1;
    row.scrollIntoView = vi.fn();
    document.body.appendChild(row);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const { result } = renderHook(() => useTournamentPulseStrip(args()));
    act(() => result.current?.jumpToTeam());
    expect(row.scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "center",
    });
    expect(document.activeElement).toBe(row);
  });
});
