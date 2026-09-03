import { describe, expect, it } from "vitest";
import {
  NEXT_SEASON_CARD_CENTS,
  cadInputToCents,
  centsToCadInput,
  getAllocationTotal,
  getRetainedCentsForSettlement,
  topUpRetainedForTourCard,
} from "./account";

describe("account allocation helpers", () => {
  it("parses CAD inputs without floating-point drift", () => {
    expect(cadInputToCents("$1,234.56")).toBe(123_456);
    expect(cadInputToCents("0.1")).toBe(10);
    expect(cadInputToCents("1.234")).toBeNull();
    expect(cadInputToCents("-1")).toBeNull();
    expect(centsToCadInput(12_345)).toBe("123.45");
  });

  it("counts the tour-card reserve inside the amount kept in the account", () => {
    expect(
      getAllocationTotal({
        transferCents: 20_000,
        charityCents: 5_000,
        leagueCents: 1_000,
        retainedCents: NEXT_SEASON_CARD_CENTS,
      }),
    ).toBe(26_000 + NEXT_SEASON_CARD_CENTS);
  });

  it("tops up the kept amount and sends only the unreserved remainder", () => {
    expect(topUpRetainedForTourCard(0)).toBe(NEXT_SEASON_CARD_CENTS);
    expect(topUpRetainedForTourCard(5_000)).toBe(NEXT_SEASON_CARD_CENTS);
    expect(topUpRetainedForTourCard(15_000)).toBe(15_000);
    expect(getRetainedCentsForSettlement(10_000, true)).toBe(0);
    expect(getRetainedCentsForSettlement(15_000, true)).toBe(5_000);
    expect(getRetainedCentsForSettlement(15_000, false)).toBe(15_000);
  });
});
