import { describe, expect, it } from "vitest";

import { resolveHomeSeasonHonors } from "./seasonHonors";

describe("resolveHomeSeasonHonors", () => {
  it("falls back to deployed leaderboard queries when the home backend is older", () => {
    expect(
      resolveHomeSeasonHonors({
        backendHonors: undefined,
        tournamentId: "tour-championship",
        tours: [
          {
            _id: "pgc-tour",
            name: "PGC Tour",
            shortForm: "PGC",
            logoUrl: "/pgc.png",
          },
        ],
        goldResult: {
          teams: [{ tourCardId: "gold-card", position: "1", score: -22 }],
          tourCards: [
            {
              _id: "gold-card",
              displayName: "Gold Winner",
              tourId: "pgc-tour",
            },
          ],
        },
        silverResult: {
          teams: [{ tourCardId: "silver-card", position: "1", score: -14 }],
          tourCards: [
            {
              _id: "silver-card",
              displayName: "Silver Winner",
              tourId: "pgc-tour",
            },
          ],
        },
      }),
    ).toEqual({
      tournamentId: "tour-championship",
      champion: {
        displayName: "Gold Winner",
        score: -22,
        tour: { name: "PGC Tour", shortForm: "PGC", logoUrl: "/pgc.png" },
      },
      silverChampion: {
        displayName: "Silver Winner",
        score: -14,
        tour: { name: "PGC Tour", shortForm: "PGC", logoUrl: "/pgc.png" },
      },
    });
  });

  it("trusts an explicit backend response without loading a fallback", () => {
    expect(
      resolveHomeSeasonHonors({
        backendHonors: null,
        tournamentId: "tour-championship",
        tours: [],
        goldResult: {
          teams: [{ tourCardId: "premature", position: "1", score: -10 }],
          tourCards: [
            {
              _id: "premature",
              displayName: "Too Early",
              tourId: "tour",
            },
          ],
        },
        silverResult: { teams: [], tourCards: [] },
      }),
    ).toBeNull();
  });
});
