import { describe, expect, it } from "vitest";
import { applyPlayoffCarryoverToScore } from "./teams";

describe("playoff score carryover", () => {
  it("initializes an unplayed leg at its carryover score", () => {
    expect(
      applyPlayoffCarryoverToScore({
        score: undefined,
        previousCarryover: undefined,
        nextCarryover: -7.5,
        hasScoringData: false,
      }),
    ).toBe(-7.5);
  });

  it("adds missing carryover to a legacy live score", () => {
    expect(
      applyPlayoffCarryoverToScore({
        score: -3,
        previousCarryover: undefined,
        nextCarryover: -12,
        hasScoringData: true,
      }),
    ).toBe(-15);
  });

  it("replaces a stale carryover without double counting the current leg", () => {
    expect(
      applyPlayoffCarryoverToScore({
        score: -18,
        previousCarryover: -10,
        nextCarryover: -12,
        hasScoringData: true,
      }),
    ).toBe(-20);
  });
});
