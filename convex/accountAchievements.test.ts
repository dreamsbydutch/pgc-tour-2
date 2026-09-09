import { describe, expect, it } from "vitest";

import { getAccountAchievementHonor } from "./utils/accountAchievements";

describe("getAccountAchievementHonor", () => {
  it("recognizes Gold and legacy single-bracket playoff winners as PGC Champions", () => {
    expect(
      getAccountAchievementHonor({
        isPlayoff: true,
        playoffLevel: 1,
        tierName: "Playoff",
      }),
    ).toMatchObject({ kind: "pgcChampion", label: "PGC Champion" });
    expect(
      getAccountAchievementHonor({
        isPlayoff: true,
        playoffLevel: undefined,
        tierName: "Playoff",
      }),
    ).toMatchObject({ kind: "pgcChampion", label: "PGC Champion" });
  });

  it("recognizes a Silver playoff winner as the Silver Champion", () => {
    expect(
      getAccountAchievementHonor({
        isPlayoff: true,
        playoffLevel: 2,
        tierName: "Playoff",
      }),
    ).toEqual({
      kind: "silverChampion",
      label: "Silver Champion",
      priority: 1,
    });
  });

  it("ranks majors ahead of other tournament wins", () => {
    expect(
      getAccountAchievementHonor({
        isPlayoff: false,
        playoffLevel: undefined,
        tierName: "Major",
      }).priority,
    ).toBeLessThan(
      getAccountAchievementHonor({
        isPlayoff: false,
        playoffLevel: undefined,
        tierName: "Elevated",
      }).priority,
    );
  });
});
