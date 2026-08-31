import { describe, expect, it } from "vitest";

import { resolveHomeSeasonHonors } from "./seasonHonors";

describe("resolveHomeSeasonHonors", () => {
  it("falls back to deployed leaderboard queries when the home backend is older", () => {
    expect(
      resolveHomeSeasonHonors({
        backendHonors: undefined,
        tournamentId: "tour-championship",
        goldResult: {
          teams: [{ tourCardId: "gold-card", position: "1", score: -22 }],
          tourCards: [{ _id: "gold-card", displayName: "Gold Winner" }],
        },
        silverResult: {
          teams: [{ tourCardId: "silver-card", position: "1", score: -14 }],
          tourCards: [{ _id: "silver-card", displayName: "Silver Winner" }],
        },
      }),
    ).toEqual({
      tournamentId: "tour-championship",
      champion: { displayName: "Gold Winner", score: -22 },
      silverChampion: { displayName: "Silver Winner", score: -14 },
    });
  });

  it("trusts an explicit backend response without loading a fallback", () => {
    expect(
      resolveHomeSeasonHonors({
        backendHonors: null,
        tournamentId: "tour-championship",
        goldResult: {
          teams: [{ tourCardId: "premature", position: "1", score: -10 }],
          tourCards: [{ _id: "premature", displayName: "Too Early" }],
        },
        silverResult: { teams: [], tourCards: [] },
      }),
    ).toBeNull();
  });
});
