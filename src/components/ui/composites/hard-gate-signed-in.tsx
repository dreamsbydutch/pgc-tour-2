"use client";

import { SignedIn, SignedOut, SignInButton } from "@clerk/tanstack-react-start";

import { Button } from "../primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../primitives/card";

/**
 * Hard-gates a page behind Clerk authentication.
 *
 * This wrapper prevents the gated page UI from rendering at all unless the user
 * is signed in. When signed out, it renders a full-page prompt with a sign-in
 * action.
 *
 * @param props - `children` to render only when signed in.
 * @returns The gated content when signed in; otherwise a sign-in screen.
 */
export function HardGateSignedIn(props: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{props.children}</SignedIn>
      <SignedOut>
        <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-end">
              <SignInButton>
                <Button>Sign In</Button>
              </SignInButton>
            </CardContent>
          </Card>
        </div>
      </SignedOut>
    </>
  );
}
