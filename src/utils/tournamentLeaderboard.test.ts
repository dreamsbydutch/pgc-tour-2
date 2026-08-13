import { describe, expect, it } from "vitest";
import {
  getActiveTournamentLeaderboardId,
  getTournamentLeaderboardToggles,
  getTournamentLeaderboardVariant,
} from "./tournamentLeaderboard";

const tours = [
  { _id: "dbyd", shortForm: "DbyD" },
  { _id: "ccg", shortForm: "CCG" },
];

describe("tournament leaderboard competition selection", () => {
  it("derives playoff mode from the selected tournament", () => {
    expect(getTournamentLeaderboardVariant({ isPlayoff: true })).toBe(
      "playoff",
    );
    expect(getTournamentLeaderboardVariant({ isPlayoff: false })).toBe(
      "regular",
    );
  });

  it("replaces original tours with Gold and Silver for playoff events", () => {
    expect(
      getTournamentLeaderboardToggles({
        variant: "playoff",
        tours,
        pgaLogoUrl: "/pga.png",
        goldLogoUrl: "/gold.png",
        silverLogoUrl: "/silver.png",
      }),
    ).toEqual([
      { _id: "gold", shortForm: "Gold", logoUrl: "/gold.png" },
      { _id: "silver", shortForm: "Silver", logoUrl: "/silver.png" },
      { _id: "pga", shortForm: "PGA", logoUrl: "/pga.png" },
    ]);
  });

  it("rejects a stale regular-tour selection on a playoff event", () => {
    expect(
      getActiveTournamentLeaderboardId({
        variant: "playoff",
        requestedTourId: "dbyd",
        viewerPlayoff: 2,
        viewerTourId: "dbyd",
        tours,
      }),
    ).toBe("silver");
  });

  it("defaults a signed-out playoff viewer to Gold", () => {
    expect(
      getActiveTournamentLeaderboardId({
        variant: "playoff",
        tours,
      }),
    ).toBe("gold");
  });
});
