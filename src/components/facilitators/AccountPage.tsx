import { useEffect, useMemo, useState } from "react";

import {
  SignedIn,
  SignedOut,
  useClerk,
  useUser,
} from "@clerk/tanstack-react-start";
import { api, useMutation, useQuery } from "@/convex";
import type { Doc, Id } from "@/convex";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@/ui";
import {
  formatDateTime,
  formatMoney,
  isMemberForAccountValue,
  isSeasonForLabelValue,
  toggleSort,
} from "@/lib";

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
 * - `api.functions.members.getMembers` (member record by Clerk id)
 * - `api.functions.members.updateMembers` (profile updates)
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
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Account</h1>
            <p className="text-sm text-muted-foreground">
              Update your profile and review your history.
            </p>
          </div>

          <SignedIn>
            <Button
              variant="destructive"
              onClick={() => vm.signOut({ redirectUrl: "/" })}
            >
              Log out
            </Button>
          </SignedIn>
        </div>

        <SignedOut>
          <Card>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={() => vm.openSignIn()}>Sign In</Button>
            </CardContent>
          </Card>
        </SignedOut>

        <SignedIn>
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">First name</label>
                  <input
                    value={vm.firstName}
                    onChange={(e) => vm.setFirstName(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Last name</label>
                  <input
                    value={vm.lastName}
                    onChange={(e) => vm.setLastName(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
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
        </SignedIn>
      </div>
    </div>
  );
}

/**
 * Encapsulates all `/account` state and Convex reads/writes.
 *
 * The hook resolves the signed-in member, manages the profile editing state,
 * fetches season labels, fetches tournament history, and derives the filtered
 * and sorted history table rows along with sort toggling helpers.
 */
function useAccountPage() {
  type SortDir = "asc" | "desc";
  type SortKey =
    | "start"
    | "season"
    | "tournament"
    | "points"
    | "earnings"
    | "position";

  type MemberForAccount = Pick<
    Doc<"members">,
    "_id" | "firstname" | "lastname" | "account"
  >;
  const isMemberForAccount = isMemberForAccountValue;
  const isSeasonForLabel = isSeasonForLabelValue;

  const { openSignIn, signOut } = useClerk();
  const { user: clerkUser } = useUser();

  const memberRaw = useQuery(
    api.functions.members.getMembers,
    clerkUser ? { options: { clerkId: clerkUser.id } } : "skip",
  );

  const updateMember = useMutation(api.functions.members.updateMembers);

  const memberForAccount = useMemo<MemberForAccount | null>(() => {
    return isMemberForAccount(memberRaw) ? memberRaw : null;
  }, [isMemberForAccount, memberRaw]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!memberForAccount) return;
    setFirstName(memberForAccount.firstname ?? "");
    setLastName(memberForAccount.lastname ?? "");
  }, [memberForAccount]);

  const memberAccountCents = memberForAccount?.account;

  const seasons = useQuery(api.functions.seasons.getSeasons, {
    options: {
      sort: { sortBy: "year", sortOrder: "desc" },
    },
  });

  const seasonLabelById = useMemo(() => {
    const map = new Map<Id<"seasons">, string>();
    if (!Array.isArray(seasons)) return map;
    for (const s of seasons) {
      if (!isSeasonForLabel(s)) continue;
      map.set(s._id, `${s.year} #${s.number}`);
    }
    return map;
  }, [isSeasonForLabel, seasons]);

  const [tSeasonFilter, setTSeasonFilter] = useState<Id<"seasons"> | "all">(
    "all",
  );
  const [tTourCardFilter, setTTourCardFilter] = useState<
    Id<"tourCards"> | "all"
  >("all");
  const [tSort, setTSort] = useState<{ key: SortKey; dir: SortDir } | null>({
    key: "start",
    dir: "desc",
  });

  async function onSaveProfile() {
    if (!memberForAccount) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      await updateMember({
        memberId: memberForAccount._id,
        data: {
          firstname: firstName,
          lastname: lastName,
        },
        options: {
          returnEnhanced: false,
        },
      });
      setSaveSuccess("Saved");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return {
    openSignIn,
    signOut,
    memberRaw,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    saving,
    saveError,
    saveSuccess,
    memberAccountCents,
    seasonLabelById,
    tSeasonFilter,
    setTSeasonFilter,
    tTourCardFilter,
    setTTourCardFilter,
    tSort,
    setTSort,
    toggleSort,
    onSaveProfile,
    formatDateTime,
  };
}
