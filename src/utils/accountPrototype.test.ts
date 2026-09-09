import { describe, expect, it } from "vitest";

import { getAccountPrototypeVariant } from "./accountPrototype";

describe("getAccountPrototypeVariant", () => {
  it.each(["a", "b", "c"] as const)(
    "selects account prototype %s from the URL",
    (variant) => {
      expect(getAccountPrototypeVariant(variant)).toBe(variant);
    },
  );

  it("keeps the current account page when no prototype is requested", () => {
    expect(getAccountPrototypeVariant(undefined)).toBeNull();
  });
});
