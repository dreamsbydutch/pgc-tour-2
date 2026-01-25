"use client";

import { SignedOut, SignInButton } from "@clerk/tanstack-react-start";

import { Button } from "./button";
import { Card, CardContent } from "./card";

/**
 * Shows a persistent sign-in call-to-action when the user is signed out.
 *
 * This component renders a fixed-position banner across all pages (when mounted
 * at the app shell level) so signed-out users always have an obvious way to
 * authenticate.
 *
 * Data sources:
 * - Clerk (`SignedOut`) for sign-in state.
 *
 * Major render states:
 * - Signed out: visible CTA banner with a Clerk `SignInButton`.
 * - Signed in: renders nothing.
 *
 * @returns A fixed sign-in banner when signed out; otherwise `null`.
 */
export function SignedOutPersistentSignIn() {
  return (
    <SignedOut>
      <div className="fixed bottom-16 left-4 right-4 z-50 lg:bottom-4 lg:left-4 lg:right-auto lg:w-80">
        <Card className="shadow-lg">
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <div className="text-sm font-medium">Sign in for full access</div>
            <SignInButton>
              <Button size="sm">Sign In</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </div>
    </SignedOut>
  );
}
