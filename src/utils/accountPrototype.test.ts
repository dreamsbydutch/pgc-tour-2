import { describe, expect, it } from "vitest";

import { shouldShowAccountPrototype } from "./accountPrototype";

describe("shouldShowAccountPrototype", () => {
  it("shows account variants in local development", () => {
    expect(
      shouldShowAccountPrototype({
        isDevelopment: true,
        vercelEnvironment: undefined,
      }),
    ).toBe(true);
  });

  it("shows account variants in a Vercel preview build", () => {
    expect(
      shouldShowAccountPrototype({
        isDevelopment: false,
        vercelEnvironment: "preview",
      }),
    ).toBe(true);
  });

  it("keeps account variants out of the Vercel production build", () => {
    expect(
      shouldShowAccountPrototype({
        isDevelopment: false,
        vercelEnvironment: "production",
      }),
    ).toBe(false);
  });
});
