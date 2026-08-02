"use client";

import { Show, SignInButton } from "@clerk/tanstack-react-start";

import { Button } from "@/ui";
import { Card, CardContent, CardHeader } from "@/ui";

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
      <Show when="signed-in">{props.children}</Show>
      <Show when="signed-out">
        <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h1 className="text-2xl font-semibold">Sign in required</h1>
            </CardHeader>
            <CardContent className="flex items-center justify-end">
              <SignInButton>
                <Button>Sign In</Button>
              </SignInButton>
            </CardContent>
          </Card>
        </div>
      </Show>
    </>
  );
}
