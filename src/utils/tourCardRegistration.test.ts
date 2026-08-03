import { describe, expect, it } from "vitest";
import type { EnhancedTournamentDoc } from "convex/types/types";

import {
  getTourCardDisplayDeadline,
  isTourCardDisplayOpen,
} from "./tourCardRegistration";

function tournament(
  startDate: number,
  status: EnhancedTournamentDoc["status"] = "upcoming",
): EnhancedTournamentDoc {
  return { startDate, status } as EnhancedTournamentDoc;
}

describe("tour card home-page visibility", () => {
  it("uses the first non-cancelled tournament for a registered member", () => {
    expect(
      getTourCardDisplayDeadline(true, 900, [
        tournament(100, "cancelled"),
        tournament(300),
        tournament(200),
      ]),
    ).toBe(200);
  });

  it("uses the registration deadline for an unregistered member", () => {
    expect(getTourCardDisplayDeadline(false, 500, [tournament(200)])).toBe(500);
  });

  it("closes the display exactly at its deadline", () => {
    expect(isTourCardDisplayOpen(500, 499)).toBe(true);
    expect(isTourCardDisplayOpen(500, 500)).toBe(false);
  });

  it("stays open when the season has no applicable deadline", () => {
    expect(isTourCardDisplayOpen(null, 1_000)).toBe(true);
  });
});
