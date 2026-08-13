import { describe, expect, it } from "vitest";

import {
  formatGolfDisplayNumber,
  formatLeaderboardThruDisplay,
  formatScore,
  formatToPar,
} from "./app";

describe("golf score display precision", () => {
  it("removes floating-point noise and limits values to one decimal", () => {
    expect(formatGolfDisplayNumber(0.30000000001)).toBe("0.3");
    expect(formatGolfDisplayNumber(-2.64999999999)).toBe("-2.6");
    expect(formatGolfDisplayNumber(4)).toBe("4");
  });

  it("formats to-par scores after rounding", () => {
    expect(formatToPar(0.00000000001)).toBe("E");
    expect(formatToPar(1.24999999999)).toBe("+1.2");
    expect(formatScore(-3.15000000001)).toBe("-3.2");
  });

  it("formats thru values with one-decimal precision and final status", () => {
    expect(formatLeaderboardThruDisplay({ thru: 7.30000000001 })).toBe("7.3");
    expect(formatLeaderboardThruDisplay({ thru: 18.00000000001 })).toBe("F");
  });
});
