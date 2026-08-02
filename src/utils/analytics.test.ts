import { describe, expect, it } from "vitest";

import type { CaptureResult } from "posthog-js";

import {
  categorizeTeamSubmissionError,
  sanitizeAnalyticsPathname,
  sanitizePostHogEvent,
} from "./analytics";

describe("analytics sanitization", () => {
  it("keeps only allowlisted static pathnames", () => {
    expect(sanitizeAnalyticsPathname("/standings?season=secret#row")).toBe(
      "/standings",
    );
    expect(sanitizeAnalyticsPathname("/members/raw-member-id")).toBe(
      "/unknown",
    );
  });

  it("drops automatic events and automatic URL properties", () => {
    const automaticEvent: CaptureResult = {
      uuid: "event-id",
      event: "$pageview",
      properties: { $current_url: "https://example.com/?secret=value" },
    };
    expect(sanitizePostHogEvent(automaticEvent)).toBeNull();

    const explicitEvent: CaptureResult = {
      uuid: "event-id",
      event: "page_view",
      properties: {
        token: "public-project-key",
        distinct_id: "anonymous-sdk-id",
        pathname: "/tournament?teamId=raw-team-id",
        $current_url: "https://example.com/tournament?teamId=raw-team-id",
        email: "private@example.com",
      },
    };

    expect(sanitizePostHogEvent(explicitEvent)?.properties).toEqual({
      $process_person_profile: false,
      token: "public-project-key",
      distinct_id: "anonymous-sdk-id",
      pathname: "/tournament",
    });

    const failureEvent: CaptureResult = {
      uuid: "event-id",
      event: "team_submission_failed",
      properties: {
        operation: "update",
        error_category: "network",
        error_message: "raw roster and member details",
        team_id: "raw-team-id",
      },
    };

    expect(sanitizePostHogEvent(failureEvent)?.properties).toEqual({
      $process_person_profile: false,
      operation: "update",
      error_category: "network",
    });
  });

  it("maps raw errors to coarse categories", () => {
    expect(
      categorizeTeamSubmissionError(new Error("Unauthorized member")),
    ).toBe("authorization");
    expect(categorizeTeamSubmissionError(new Error("Failed to fetch"))).toBe(
      "network",
    );
    expect(categorizeTeamSubmissionError(new Error("private raw detail"))).toBe(
      "unknown",
    );
  });
});
