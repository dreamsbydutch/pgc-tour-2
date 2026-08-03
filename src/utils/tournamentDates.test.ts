import { describe, expect, it } from "vitest";

import { formatCompactTournamentDateRange } from "./app";

const timestamp = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day).getTime();

describe("formatCompactTournamentDateRange", () => {
  it("omits the repeated month and year for dates in the same month", () => {
    expect(
      formatCompactTournamentDateRange(
        timestamp(2026, 8, 6),
        timestamp(2026, 8, 9),
      ),
    ).toBe("Aug 6–9");
  });

  it("includes both months when a tournament crosses a month boundary", () => {
    expect(
      formatCompactTournamentDateRange(
        timestamp(2026, 7, 30),
        timestamp(2026, 8, 2),
      ),
    ).toBe("Jul 30–Aug 2");
  });

  it("renders a one-day tournament as a single date", () => {
    expect(
      formatCompactTournamentDateRange(
        timestamp(2026, 8, 3),
        timestamp(2026, 8, 3),
      ),
    ).toBe("Aug 3");
  });
});
