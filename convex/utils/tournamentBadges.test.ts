import { describe, expect, it } from "vitest";

import {
  CANADIAN_OPEN_BADGE_LOGO_URL,
  isCanadianOpenTournament,
  resolveChampionBadgeLogoUrl,
} from "./tournamentBadges";

describe("tournament champion badges", () => {
  it("uses the special maple-leaf badge for Canadian Open champions", () => {
    expect(isCanadianOpenTournament("RBC Canadian Open")).toBe(true);
    expect(
      resolveChampionBadgeLogoUrl(
        "RBC Canadian Open",
        "https://example.com/tournament-logo.png",
      ),
    ).toBe(CANADIAN_OPEN_BADGE_LOGO_URL);
  });

  it("keeps the tournament logo for other champion badges", () => {
    expect(
      resolveChampionBadgeLogoUrl(
        "The Masters",
        "https://example.com/masters.png",
      ),
    ).toBe("https://example.com/masters.png");
  });
});
