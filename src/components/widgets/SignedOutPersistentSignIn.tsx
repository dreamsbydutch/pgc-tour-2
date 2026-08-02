"use client";

import { Show, SignInButton } from "@clerk/tanstack-react-start";

import { Card, CardContent } from "@/components/ui/primitives/card";
import { Button } from "@/components/ui/primitives/button";

/**
 * Shows a persistent sign-in call-to-action when the user is signed out.
 *
 * This component stays in normal page flow on mobile and becomes a small fixed
 * card on desktop.
 *
 * Data sources:
 * - Clerk (`Show`) for sign-in state.
 *
 * Major render states:
 * - Signed out: visible CTA banner with a Clerk `SignInButton`.
 * - Signed in: renders nothing.
 *
 * @returns A sign-in banner when signed out; otherwise `null`.
 */
export function SignedOutPersistentSignIn() {
  return (
    <Show when="signed-out">
      <aside
        aria-label="Sign in"
        className="app-sign-in-prompt mx-4 mb-20 lg:fixed lg:bottom-4 lg:left-4 lg:z-40 lg:m-0 lg:w-80"
      >
        <Card className="shadow-lg">
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <div className="text-sm font-medium">Sign in for full access</div>
            <SignInButton>
              <Button size="sm">Sign In</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </aside>
    </Show>
  );
}
