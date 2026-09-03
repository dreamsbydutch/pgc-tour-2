import { describe, expect, it } from "vitest";
import {
  NEXT_SEASON_CARD_CENTS,
  cadInputToCents,
  centsToCadInput,
  getAllocationTotal,
} from "./account";

describe("account allocation helpers", () => {
  it("parses CAD inputs without floating-point drift", () => {
    expect(cadInputToCents("$1,234.56")).toBe(123_456);
    expect(cadInputToCents("0.1")).toBe(10);
    expect(cadInputToCents("1.234")).toBeNull();
    expect(cadInputToCents("-1")).toBeNull();
    expect(centsToCadInput(12_345)).toBe("123.45");
  });

  it("includes the fixed tour-card reserve in allocation totals", () => {
    expect(
      getAllocationTotal({
        transferCents: 20_000,
        charityCents: 5_000,
        leagueCents: 1_000,
        nextSeasonCard: true,
        retainedCents: 1_000,
      }),
    ).toBe(27_000 + NEXT_SEASON_CARD_CENTS);
  });
});
