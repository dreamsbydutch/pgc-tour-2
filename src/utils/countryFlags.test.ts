import { describe, expect, it } from "vitest";

import { getCountryFlagEmoji } from "./countryFlags";

describe("getCountryFlagEmoji", () => {
  it("supports feed codes, display names, and annotated values", () => {
    expect(getCountryFlagEmoji("USA")).toBe("🇺🇸");
    expect(getCountryFlagEmoji("South Korea")).toBe("🇰🇷");
    expect(getCountryFlagEmoji("Australia (AUS)")).toBe("🇦🇺");
  });

  it("keeps home-nation flags and rejects unknown values", () => {
    expect(getCountryFlagEmoji("England")).toBe(
      "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
    );
    expect(getCountryFlagEmoji("Atlantis")).toBeNull();
  });
});
