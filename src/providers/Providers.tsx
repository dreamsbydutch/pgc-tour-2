"use client";

import { ConvexReactClient } from "convex/react";
import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { CSPostHogProvider } from "./PostHogProvider";

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

function Providers({ children }: { children: ReactNode }) {
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
    <CSPostHogProvider>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <ConvexProviderWithClerk
          client={convex}
          useAuth={useAuthWithConvexTokenFallback}
        >
          {children}
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </CSPostHogProvider>
  );
}

export default Providers;
