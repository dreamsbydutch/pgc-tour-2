import { describe, expect, it } from "vitest";

import { getPlayoffPayoutColumns } from "./tournamentAwards";

describe("playoff payout columns", () => {
  it("separates Gold and Silver at the reserved slot boundary", () => {
    const payouts = Array.from({ length: 125 }, (_, index) => {
      if (index < 30) return (30 - index) * 100;
      if (index >= 75) return (125 - index) * 100;
      return 0;
    });

    expect(getPlayoffPayoutColumns(payouts)).toEqual({
      gold: Array.from({ length: 30 }, (_, index) => (30 - index) * 100),
      silver: Array.from({ length: 50 }, (_, index) => (50 - index) * 100),
    });
  });
});
