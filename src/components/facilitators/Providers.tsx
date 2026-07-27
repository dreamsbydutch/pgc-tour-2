"use client";

import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";

import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ViewerBootstrapProvider } from "@/convex";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHostEnv = import.meta.env.VITE_POSTHOG_HOST;
const posthogUiHost = "https://app.posthog.com";

const posthogApiHost = (() => {
  const raw = (posthogHostEnv ?? "").trim();
  if (!raw) return "https://us.i.posthog.com";
  if (raw.includes("app.posthog.com")) return "https://us.i.posthog.com";
  return raw;
})();

function usePostHogInitialization() {
  useEffect(() => {
    if (!posthogKey) return;
    let cancelled = false;
    const initialize = () => {
      void import("posthog-js").then(({ default: posthog }) => {
        if (cancelled) return;
        posthog.init(posthogKey, {
          api_host: posthogApiHost,
          ui_host: posthogUiHost,
          person_profiles: "identified_only",
          loaded: (instance) => {
            if (import.meta.env.DEV) instance.debug();
          },
        });
      });
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const handle = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(initialize)
      : window.setTimeout(initialize, 1_000);
    return () => {
      cancelled = true;
      if (idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle);
      }
    };
  }, []);
}

/**
 * Wraps Clerk auth to always request the Convex JWT template.
 *
 * This avoids runtime crashes when `useAuth().getToken()` is called without specifying
 * the `template: "convex"` option, while still behaving like the normal Clerk auth hook.
 *
 * @returns Clerk auth object with a `getToken` implementation that requests the Convex template.
 */
function useAuthWithConvexTokenFallback() {
  const auth = useAuth();

  const getToken: typeof auth.getToken = async (options) => {
    try {
      return await auth.getToken({ ...options, template: "convex" });
    } catch {
      return null;
    }
  };

  return { ...auth, getToken };
}

/**
 * App-wide provider composition (PostHog + Clerk + Convex).
 *
 * Usage:
 * - Mounted once at the root route shell.
 *
 * Data sources:
 * - Env vars: `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, and optional PostHog env.
 *
 * Behavior:
 * - Creates a single `ConvexReactClient` for the configured Convex URL.
 * - Wraps the app in `ClerkProvider` and `ConvexProviderWithClerk`.
 * - If `VITE_POSTHOG_KEY` is set, also wraps the app in `PostHogProvider`.
 * - If required env vars are missing, renders a diagnostic UI instead of crashing.
 *
 * @param props.children - App content.
 * @returns Provider-wrapped app content.
 */
export function Providers({ children }: { children: ReactNode }) {
  usePostHogInitialization();
  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  const convex = useMemo(() => {
    if (!convexUrl) return null;
    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (!convexUrl || !clerkPublishableKey || !convex) {
    const missing = [
      !convexUrl ? "VITE_CONVEX_URL" : null,
      !clerkPublishableKey ? "VITE_CLERK_PUBLISHABLE_KEY" : null,
    ].filter((x): x is string => Boolean(x));

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
          <div className="text-lg font-semibold">
            Missing environment variables
          </div>
          <div className="mt-1 text-sm">
            Set these in your hosting provider (Vercel) and redeploy:
          </div>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {missing.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ConvexProviderWithClerk
        client={convex}
        useAuth={useAuthWithConvexTokenFallback}
      >
        <ViewerBootstrapProvider>{children}</ViewerBootstrapProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
