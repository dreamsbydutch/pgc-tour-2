import { Show } from "@clerk/tanstack-react-start";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@/ui";
import { formatMoney } from "@/utils/app";
import { useAccountPage } from "@/hooks";

/**
 * Renders the `/account` screen.
 *
 * This page handles:
 * - Sign-in/sign-out entry points (Clerk)
 * - Editing the member profile (first/last name)
 * - Showing the current account balance
 * - Listing and filtering the signed-in member’s tournament history
 *
 * Data sources:
 * - `api.functions.members.getCurrentMember` (authenticated member record)
 * - `api.functions.members.updateMyProfile` (profile updates)
 * - `api.functions.seasons.getSeasons` (season labels)
 * - `api.functions.membersViews.getMyTournamentHistory` (history rows)
 *
 * Major render states:
 * - Signed out (sign-in card)
 * - Signed in (profile editor + history table)
 */
export function AccountPage() {
  const vm = useAccountPage();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Account</h1>
            <p className="text-sm text-muted-foreground">
              Update your profile and review your history.
            </p>
          </div>

          <Show when="signed-in">
            <Button
              variant="destructive"
              onClick={() => vm.signOut({ redirectUrl: "/" })}
            >
              Log out
            </Button>
          </Show>
        </div>

        <Show when="signed-out">
          <Card>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={() => vm.openSignIn()}>Sign In</Button>
            </CardContent>
          </Card>
        </Show>

        <Show when="signed-in">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="account-first-name"
                    className="text-sm font-medium"
                  >
                    First name
                  </label>
                  <input
                    id="account-first-name"
                    value={vm.firstName}
                    onChange={(e) => vm.setFirstName(e.target.value)}
                    className="min-h-11 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="account-last-name"
                    className="text-sm font-medium"
                  >
                    Last name
                  </label>
                  <input
                    id="account-last-name"
                    value={vm.lastName}
                    onChange={(e) => vm.setLastName(e.target.value)}
                    className="min-h-11 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  onClick={vm.onSaveProfile}
                  disabled={vm.saving || !vm.memberRaw}
                >
                  {vm.saving ? "Saving…" : "Save"}
                </Button>

                {vm.memberAccountCents !== undefined ? (
                  <div className="text-sm text-muted-foreground">
                    Balance:{" "}
                    <span className="font-medium">
                      {formatMoney(vm.memberAccountCents, true)}
                    </span>
                  </div>
                ) : null}

                {vm.saveError ? (
                  <div className="text-sm text-red-600">{vm.saveError}</div>
                ) : null}
                {vm.saveSuccess ? (
                  <div className="text-sm text-green-700">{vm.saveSuccess}</div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </Show>
      </div>
    </div>
  );
}
