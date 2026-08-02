import type { CaptureResult, PostHog } from "posthog-js";

import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
  TeamSubmissionErrorCategory,
} from "@/types";

const SAFE_APP_PATHNAMES = new Set([
  "/",
  "/account",
  "/admin",
  "/history",
  "/rulebook",
  "/standings",
  "/tournament",
]);

const TEAM_SUBMISSION_ERROR_CATEGORIES = new Set<TeamSubmissionErrorCategory>([
  "authorization",
  "conflict",
  "network",
  "rate_limited",
  "unavailable",
  "validation",
  "unknown",
]);

const POSTHOG_INTERNAL_PROPERTY_NAMES = [
  "token",
  "distinct_id",
  "$device_id",
  "$session_id",
  "$window_id",
] as const;

let postHogInitialization: Promise<PostHog | null> | null = null;

function resolvePostHogApiHost(value: string | undefined): string {
  const host = (value ?? "").trim();
  if (!host || host.includes("app.posthog.com")) {
    return "https://us.i.posthog.com";
  }
  return host;
}

function copyPostHogInternalProperties(
  properties: CaptureResult["properties"],
): CaptureResult["properties"] {
  const sanitized: CaptureResult["properties"] = {
    $process_person_profile: false,
  };

  for (const name of POSTHOG_INTERNAL_PROPERTY_NAMES) {
    const value = properties[name];
    if (typeof value === "string") sanitized[name] = value;
  }

  return sanitized;
}

function sanitizeExplicitEventProperties(
  event: string,
  properties: CaptureResult["properties"],
): AnalyticsEventProperties[AnalyticsEventName] | null {
  switch (event) {
    case "page_view":
      return {
        pathname: sanitizeAnalyticsPathname(
          typeof properties.pathname === "string" ? properties.pathname : "/",
        ),
      };
    case "leaderboard_tab_changed":
      return properties.view === "pga" || properties.view === "pgc"
        ? { view: properties.view }
        : null;
    case "standings_view_changed":
      return properties.view === "playoffs" || properties.view === "tour"
        ? { view: properties.view }
        : null;
    case "team_submission_succeeded":
      return properties.operation === "create" ||
        properties.operation === "update"
        ? { operation: properties.operation }
        : null;
    case "team_submission_failed":
      return (properties.operation === "create" ||
        properties.operation === "update") &&
        TEAM_SUBMISSION_ERROR_CATEGORIES.has(properties.error_category)
        ? {
            operation: properties.operation,
            error_category: properties.error_category,
          }
        : null;
    default:
      return null;
  }
}

export function sanitizePostHogEvent(
  captureResult: CaptureResult | null,
): CaptureResult | null {
  if (!captureResult) return null;

  const event = String(captureResult.event);
  const explicitProperties = sanitizeExplicitEventProperties(
    event,
    captureResult.properties,
  );
  if (!explicitProperties) return null;

  return {
    uuid: captureResult.uuid,
    event: event as AnalyticsEventName,
    timestamp: captureResult.timestamp,
    properties: {
      ...copyPostHogInternalProperties(captureResult.properties),
      ...explicitProperties,
    },
  };
}

export function sanitizeAnalyticsPathname(value: string): string {
  try {
    const pathname = new URL(value, "https://analytics.invalid").pathname;
    return SAFE_APP_PATHNAMES.has(pathname) ? pathname : "/unknown";
  } catch {
    return "/unknown";
  }
}

export function categorizeTeamSubmissionError(
  error: unknown,
): TeamSubmissionErrorCategory {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("permission") ||
    message.includes("sign in")
  ) {
    return "authorization";
  }
  if (
    message.includes("invalid") ||
    message.includes("required") ||
    message.includes("select") ||
    message.includes("exactly") ||
    message.includes("validation")
  ) {
    return "validation";
  }
  if (
    message.includes("conflict") ||
    message.includes("already") ||
    message.includes("duplicate")
  ) {
    return "conflict";
  }
  if (message.includes("rate") || message.includes("too many")) {
    return "rate_limited";
  }
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return "network";
  }
  if (
    message.includes("unavailable") ||
    message.includes("service") ||
    message.includes("maintenance")
  ) {
    return "unavailable";
  }
  return "unknown";
}

export function initializeAnalytics(): Promise<PostHog | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  const key = import.meta.env.VITE_POSTHOG_KEY?.trim();
  if (!key) return Promise.resolve(null);

  if (!postHogInitialization) {
    postHogInitialization = import("posthog-js")
      .then(({ default: posthog }) => {
        const debugEnabled =
          import.meta.env.DEV && import.meta.env.VITE_POSTHOG_DEBUG === "true";

        posthog.init(key, {
          api_host: resolvePostHogApiHost(import.meta.env.VITE_POSTHOG_HOST),
          ui_host: "https://app.posthog.com",
          advanced_disable_flags: true,
          advanced_disable_feature_flags: true,
          advanced_disable_toolbar_metrics: true,
          autocapture: false,
          before_send: sanitizePostHogEvent,
          capture_dead_clicks: false,
          capture_exceptions: false,
          capture_heatmaps: false,
          capture_pageleave: false,
          capture_pageview: false,
          capture_performance: false,
          debug: debugEnabled,
          disable_session_recording: true,
          disable_surveys: true,
          disable_surveys_automatic_display: true,
          enable_heatmaps: false,
          persistence: "memory",
          person_profiles: "never",
          rageclick: false,
          save_campaign_params: false,
          save_referrer: false,
          loaded: (instance) => instance.debug(debugEnabled),
        });

        return posthog;
      })
      .catch(() => null);
  }

  return postHogInitialization;
}

export async function captureAnalyticsEvent<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventProperties[Name],
): Promise<void> {
  const posthog = await initializeAnalytics();
  posthog?.capture(name, properties);
}
