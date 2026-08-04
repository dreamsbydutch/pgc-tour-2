// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExtendedStandingsTourCard } from "@/types";
import { StandingsListingRow, StandingsTableHeader } from "./StandingsView";

vi.mock("@/hooks", () => ({
  useStandingsHistory: () => ({
    items: [],
    tournaments: [],
    isLoading: false,
  }),
  useStandingsPage: vi.fn(),
}));

afterEach(cleanup);

describe("knocked-out playoff standings", () => {
  it("shows the complete desktop header", () => {
    render(
      <StandingsTableHeader
        variant="bumped"
        friendsOnlyToggle={<span>Tour</span>}
      />,
    );

    expect(screen.getByText("Wins")).toBeTruthy();
    expect(screen.getByText("Top 10")).toBeTruthy();
    expect(screen.getByText("Cuts")).toBeTruthy();
  });

  it("renders values for every knocked-out desktop column", () => {
    const card = {
      _id: "tour-card-1",
      memberId: "member-1",
      displayName: "C. Bennett",
      currentPosition: "41",
      points: 899,
      earnings: 56,
      wins: 2,
      topTen: 5,
      madeCut: 10,
      appearances: 12,
      posChange: -6,
    } as unknown as ExtendedStandingsTourCard;

    render(
      <StandingsListingRow
        card={card}
        mode="bumped"
        currentMemberId={null}
        friendsOnly={false}
        friendIds={new Set()}
        isFriendChanging={() => false}
        onAddFriend={() => undefined}
        onRemoveFriend={() => undefined}
        renderPositionChange={() => null}
        tourLogoUrl="https://example.com/tour.png"
        majorChampionBadgesByMemberId={{}}
      />,
    );

    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("10/12")).toBeTruthy();
  });
});
