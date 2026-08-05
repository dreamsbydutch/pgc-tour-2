import { describe, expect, it } from "vitest";

import {
  getClubhousePulseCutoff,
  getTerminalScoreState,
  selectClubhousePulsePhase,
  selectClubhousePulseRival,
} from "./clubhousePulse";

describe("Clubhouse Pulse utilities", () => {
  it("uses active, picks, completion phase priority", () => {
    expect(
      selectClubhousePulsePhase({
        hasActiveTournament: true,
        hasOpenPicks: true,
        seasonComplete: true,
      }),
    ).toBe("live");
    expect(
      selectClubhousePulsePhase({
        hasActiveTournament: false,
        hasOpenPicks: true,
        seasonComplete: true,
      }),
    ).toBe("picks_open");
    expect(
      selectClubhousePulsePhase({
        hasActiveTournament: false,
        hasOpenPicks: false,
        seasonComplete: true,
      }),
    ).toBe("season_complete");
    expect(
      selectClubhousePulsePhase({
        hasActiveTournament: false,
        hasOpenPicks: false,
        seasonComplete: false,
      }),
    ).toBe("between_events");
  });

  it("preserves strict-better qualification for ties at cut lines", () => {
    const tiedCards = [
      { id: "leader", points: 120 },
      { id: "tie-a", points: 100 },
      { id: "tie-b", points: 100 },
      { id: "out", points: 90 },
    ];
    expect(
      getClubhousePulseCutoff({
        viewerId: "tie-b",
        cards: tiedCards,
        playoffSpots: [2, 1],
      }),
    ).toMatchObject({ destination: "gold" });
    expect(
      getClubhousePulseCutoff({
        viewerId: "out",
        cards: tiedCards,
        playoffSpots: [2, 1],
      }),
    ).toMatchObject({ destination: "out" });
  });

  it("prefers a same-competition friend before the adjacent rival", () => {
    const rival = selectClubhousePulseRival({
      viewer: {
        id: "viewer",
        memberId: "viewer-member",
        position: "3",
        value: -5,
      },
      candidates: [
        { id: "adjacent", memberId: "other", position: "2", value: -6 },
        { id: "friend", memberId: "friend-member", position: "8", value: -4.5 },
      ],
      friendIds: ["friend-member"],
      lowerIsBetter: true,
    });
    expect(rival?.candidate.id).toBe("friend");
    expect(rival?.isFriend).toBe(true);
  });

  it("recognizes ties, falls back behind a clear leader, and preserves terminal states", () => {
    const tiedRival = selectClubhousePulseRival({
      viewer: { id: "leader", position: "T1", value: -10 },
      candidates: [
        { id: "leader", position: "T1", value: -10 },
        { id: "tied", position: "T1", value: -10 },
        { id: "behind", position: "3", value: -8 },
      ],
      friendIds: [],
      lowerIsBetter: true,
    });
    expect(tiedRival?.candidate.id).toBe("tied");
    expect(tiedRival?.relation).toBe("tied");
    const leaderRival = selectClubhousePulseRival({
      viewer: { id: "leader", position: "1", value: -10 },
      candidates: [
        { id: "leader", position: "1", value: -10 },
        { id: "behind", position: "2", value: -8 },
      ],
      friendIds: [],
      lowerIsBetter: true,
    });
    expect(leaderRival?.candidate.id).toBe("behind");
    expect(leaderRival?.relation).toBe("ahead");
    expect(getTerminalScoreState("cut")).toBe("CUT");
    expect(getTerminalScoreState("WD")).toBe("WD");
    expect(getTerminalScoreState("DQ")).toBe("DQ");
    expect(getTerminalScoreState("T4")).toBeNull();
  });
});
