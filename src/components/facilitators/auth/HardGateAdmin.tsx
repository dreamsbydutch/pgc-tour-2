"use client";

import { SignedIn, SignedOut, SignInButton } from "@clerk/tanstack-react-start";

import { useRoleAccess } from "@/hooks";
import { Button } from "@/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui";

/**
 * Hard-gates a page behind Clerk authentication and an admin role.
 *
 * This wrapper prevents the gated page UI from rendering unless the user is:
 * - signed in via Clerk, and
 * - resolved (non-loading) as an `admin` via `useRoleAccess()`.
 *
 * Major render states:
 * - Signed out: sign-in required prompt.
 * - Signed in + loading role: loading screen.
 * - Signed in + non-admin: forbidden screen.
 * - Signed in + admin: renders `children`.
 *
 * @param props - `children` to render only when the user is an admin.
 * @returns The gated content when admin; otherwise a sign-in / loading / forbidden UI.
 */
export function HardGateAdmin(props: { children: React.ReactNode }) {
  return (
    <>
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

      <SignedIn>
        <AdminGateContent>{props.children}</AdminGateContent>
      </SignedIn>
    </>
  );
}

function AdminGateContent(props: { children: React.ReactNode }) {
  const access = useRoleAccess();

  if (access.isLoading || !access.isAuthenticated) {
    return (
      <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Loading…</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!access.isAdmin) {
    return (
      <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Forbidden</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <>{props.children}</>;
}
