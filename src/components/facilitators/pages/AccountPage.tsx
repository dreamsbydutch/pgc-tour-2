import { useEffect, useMemo, useState } from "react";

import {
  SignedIn,
  SignedOut,
  useClerk,
  useUser,
} from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { api, useMutation, useQuery } from "@/convex";
import type { Doc, Id } from "@/convex";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@/ui";
import {
  compareUnknown,
  formatDateTime,
  formatMoney,
  formatMoneyWithCents,
  getSortIndicator,
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
 * - Requesting e-transfer withdrawals and making league/charity donations
 * - Listing and filtering the signed-in member’s tournament history
 *
 * Data sources:
 * - `api.functions.members.getMembers` (member record by Clerk id)
 * - `api.functions.members.updateMembers` (profile updates)
 * - `api.functions.seasons.getCurrentSeason` (default season for transactions)
 * - `api.functions.transactions.getMyBalanceSummary` (available balance)
 * - `api.functions.transactions.createMyWithdrawalAndDonations` (withdrawals + donations)
 * - `api.functions.seasons.getSeasons` (season labels)
 * - `api.functions.members.getMyTournamentHistory` (history rows)
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
                      {formatMoney(vm.memberAccountCents)}
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

              <div className="mt-8 border-t pt-6">
                <div className="mb-2 text-sm font-medium">
                  Request payout / donate
                </div>
                <div className="mb-4 text-sm text-muted-foreground">
                  Donations are completed immediately. Withdrawal requests are
                  marked pending until processed.
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {vm.balanceSummary ? (
                    <>
                      <div>
                        Balance: <span className="font-medium">{formatMoney(vm.balanceSummary.accountCents)}</span>
                      </div>
                      <div>
                        Pending withdrawals:{" "}
                        <span className="font-medium">
                          {formatMoneyWithCents(vm.balanceSummary.pendingWithdrawalCents)}
                        </span>
                      </div>
                      <div>
                        Available:{" "}
                        <span className="font-medium">
                          {formatMoneyWithCents(vm.balanceSummary.availableCents)}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      E-transfer email
                    </label>
                    <input
                      value={vm.payoutEmail}
                      onChange={(e) => vm.setPayoutEmail(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      E-transfer amount
                    </label>
                    <input
                      value={vm.withdrawalAmount}
                      onChange={(e) => vm.setWithdrawalAmount(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="$25.00"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      League donation
                    </label>
                    <input
                      value={vm.leagueDonationAmount}
                      onChange={(e) =>
                        vm.setLeagueDonationAmount(e.target.value)
                      }
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="$10.00"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Charity donation
                    </label>
                    <input
                      value={vm.charityDonationAmount}
                      onChange={(e) =>
                        vm.setCharityDonationAmount(e.target.value)
                      }
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="$10.00"
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    onClick={vm.onSubmitPayoutAndDonations}
                    disabled={
                      vm.submittingPayout ||
                      vm.payoutFormDisabledReason !== null
                    }
                  >
                    {vm.submittingPayout ? "Submitting…" : "Submit"}
                  </Button>

                  {vm.payoutFormDisabledReason ? (
                    <div className="text-sm text-muted-foreground">
                      {vm.payoutFormDisabledReason}
                    </div>
                  ) : null}

                  {vm.payoutError ? (
                    <div className="text-sm text-red-600">{vm.payoutError}</div>
                  ) : null}
                  {vm.payoutSuccess ? (
                    <div className="text-sm text-green-700">
                      {vm.payoutSuccess}
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tournament history</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Season
                  </div>
                  <select
                    value={vm.tSeasonFilter}
                    onChange={(e) =>
                      vm.setTSeasonFilter(
                        e.target.value as Id<"seasons"> | "all",
                      )
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="all">All seasons</option>
                    {Array.from(vm.seasonLabelById.entries()).map(
                      ([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    Tour card
                  </div>
                  <select
                    value={vm.tTourCardFilter}
                    onChange={(e) =>
                      vm.setTTourCardFilter(
                        e.target.value as Id<"tourCards"> | "all",
                      )
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="all">All tour cards</option>
                    {vm.tourCardOptions.map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {vm.historyKind === "loading" ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : vm.historyKind === "empty" ? (
                <div className="text-sm text-muted-foreground">
                  No tournament history found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-4">
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() =>
                              vm.setTSort((prev) =>
                                vm.toggleSort(prev, "start"),
                              )
                            }
                          >
                            Start{getSortIndicator(vm.tSort, "start")}
                          </button>
                        </th>
                        <th className="py-2 pr-4">
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() =>
                              vm.setTSort((prev) =>
                                vm.toggleSort(prev, "season"),
                              )
                            }
                          >
                            Season{getSortIndicator(vm.tSort, "season")}
                          </button>
                        </th>
                        <th className="py-2 pr-4">
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() =>
                              vm.setTSort((prev) =>
                                vm.toggleSort(prev, "tournament"),
                              )
                            }
                          >
                            Tournament{getSortIndicator(vm.tSort, "tournament")}
                          </button>
                        </th>
                        <th className="py-2 pr-4">Tour card</th>
                        <th className="py-2 pr-4">
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() =>
                              vm.setTSort((prev) =>
                                vm.toggleSort(prev, "position"),
                              )
                            }
                          >
                            Pos{getSortIndicator(vm.tSort, "position")}
                          </button>
                        </th>
                        <th className="py-2 pr-4">
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() =>
                              vm.setTSort((prev) =>
                                vm.toggleSort(prev, "points"),
                              )
                            }
                          >
                            Pts{getSortIndicator(vm.tSort, "points")}
                          </button>
                        </th>
                        <th className="py-2 pr-4">
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() =>
                              vm.setTSort((prev) =>
                                vm.toggleSort(prev, "earnings"),
                              )
                            }
                          >
                            Earnings{getSortIndicator(vm.tSort, "earnings")}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {vm.filteredHistoryRows.map((row) => (
                        <tr
                          key={row.teamId}
                          className="border-b last:border-b-0"
                        >
                          <td className="py-2 pr-4">
                            {vm.formatDateTime(row.tournamentStartDate)}
                          </td>
                          <td className="py-2 pr-4">
                            {vm.seasonLabelById.get(row.seasonId) ?? "—"}
                          </td>
                          <td className="py-2 pr-4 font-medium">
                            <Link
                              to="/tournament"
                              search={{
                                tournamentId: row.tournamentId,
                                tourId: row.tourCardId,
                                variant: "regular",
                              }}
                              className="hover:underline"
                            >
                              {row.tournamentName}
                            </Link>
                          </td>
                          <td className="py-2 pr-4">
                            {row.tourCardDisplayName}
                          </td>
                          <td className="py-2 pr-4">{row.position ?? "—"}</td>
                          <td className="py-2 pr-4">
                            {typeof row.points === "number" ? row.points : "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {typeof row.earnings === "number"
                              ? formatMoney(row.earnings)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
  type TournamentHistoryRow = {
    teamId: Id<"teams">;
    tournamentId: Id<"tournaments">;
    tournamentName: string;
    tournamentStartDate: number | undefined;
    tournamentEndDate: number | undefined;
    seasonId: Id<"seasons">;
    tourCardId: Id<"tourCards">;
    tourCardDisplayName: string;
    teamName: string | undefined;
    points: number | undefined;
    position: number | undefined;
    earnings: number | undefined;
    updatedAt: number | undefined;
  };

  const isMemberForAccount = isMemberForAccountValue;
  const isSeasonForLabel = isSeasonForLabelValue;

  const { openSignIn, signOut } = useClerk();
  const { user: clerkUser } = useUser();

  const memberRaw = useQuery(
    api.functions.members.getMembers,
    clerkUser ? { options: { clerkId: clerkUser.id } } : "skip",
  );

  const updateMember = useMutation(api.functions.members.updateMembers);

  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason, {});
  const balanceSummary = useQuery(
    api.functions.transactions.getMyBalanceSummary,
    clerkUser ? {} : "skip",
  );
  const submitPayoutAndDonations = useMutation(
    api.functions.transactions.createMyWithdrawalAndDonations,
  );

  const memberForAccount = useMemo<MemberForAccount | null>(() => {
    return isMemberForAccount(memberRaw) ? memberRaw : null;
  }, [isMemberForAccount, memberRaw]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [payoutEmail, setPayoutEmail] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [leagueDonationAmount, setLeagueDonationAmount] = useState("");
  const [charityDonationAmount, setCharityDonationAmount] = useState("");
  const [submittingPayout, setSubmittingPayout] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSuccess, setPayoutSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!memberForAccount) return;
    setFirstName(memberForAccount.firstname ?? "");
    setLastName(memberForAccount.lastname ?? "");
  }, [memberForAccount]);

  useEffect(() => {
    const next = (memberRaw && "email" in memberRaw ? memberRaw.email : "") as
      | string
      | undefined;
    if (!next || payoutEmail.trim()) return;
    setPayoutEmail(next);
  }, [memberRaw, payoutEmail]);

  const memberAccountCents = memberForAccount?.account;

  function parseOptionalDollarsToCents(value: string): number {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    const cleaned = trimmed.replace(/[$,\s]/g, "");
    if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(cleaned)) {
      throw new Error("Enter a dollar amount like 25.00");
    }

    const [dollarsPart, centsPartRaw] = cleaned.split(".");
    const dollars = Number.parseInt(dollarsPart, 10);
    const centsPart = (centsPartRaw ?? "").padEnd(2, "0");
    const cents = centsPart ? Number.parseInt(centsPart, 10) : 0;
    const total = dollars * 100 + cents;
    if (!Number.isFinite(total) || total < 0) {
      throw new Error("Enter a dollar amount like 25.00");
    }
    return total;
  }

  const payoutFormDisabledReason = useMemo(() => {
    if (!clerkUser) return "Sign in to request payouts or donate.";
    if (!currentSeason) return "No current season found.";
    if (!balanceSummary) return "Loading balance…";

    let withdrawalCents = 0;
    let leagueCents = 0;
    let charityCents = 0;
    try {
      withdrawalCents = parseOptionalDollarsToCents(withdrawalAmount);
      leagueCents = parseOptionalDollarsToCents(leagueDonationAmount);
      charityCents = parseOptionalDollarsToCents(charityDonationAmount);
    } catch {
      return "Enter valid dollar amounts.";
    }

    if (withdrawalCents === 0 && leagueCents === 0 && charityCents === 0) {
      return "Enter an amount to submit.";
    }

    if (withdrawalCents > 0 && !payoutEmail.trim()) {
      return "Enter an e-transfer email.";
    }

    const requestedTotal = withdrawalCents + leagueCents + charityCents;
    if (requestedTotal > balanceSummary.availableCents) {
      return "Total exceeds available balance.";
    }

    return null;
  }, [
    balanceSummary,
    charityDonationAmount,
    clerkUser,
    currentSeason,
    leagueDonationAmount,
    payoutEmail,
    withdrawalAmount,
  ]);

  async function onSubmitPayoutAndDonations() {
    if (!clerkUser) return;
    if (!currentSeason) return;

    setSubmittingPayout(true);
    setPayoutError(null);
    setPayoutSuccess(null);

    try {
      const withdrawalCents = parseOptionalDollarsToCents(withdrawalAmount);
      const leagueCents = parseOptionalDollarsToCents(leagueDonationAmount);
      const charityCents = parseOptionalDollarsToCents(charityDonationAmount);

      await submitPayoutAndDonations({
        seasonId: currentSeason._id,
        payoutEmail: payoutEmail.trim() || undefined,
        withdrawalAmountCents: withdrawalCents || undefined,
        leagueDonationCents: leagueCents || undefined,
        charityDonationCents: charityCents || undefined,
      });

      setWithdrawalAmount("");
      setLeagueDonationAmount("");
      setCharityDonationAmount("");
      setPayoutSuccess("Submitted.");
    } catch (e) {
      setPayoutError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmittingPayout(false);
    }
  }

  const seasons = useQuery(api.functions.seasons.getSeasons, {
    options: {
      sort: { sortBy: "year", sortOrder: "desc" },
      pagination: { limit: 200 },
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

  const tournamentHistory = useQuery(
    api.functions.members.getMyTournamentHistory,
    clerkUser ? {} : "skip",
  );

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

  const tourCardOptions = useMemo(() => {
    if (!Array.isArray(tournamentHistory)) {
      return [] as Array<{ id: Id<"tourCards">; label: string }>;
    }
    const uniqueIds = Array.from(
      new Set(tournamentHistory.map((r) => r.tourCardId)),
    );
    return uniqueIds
      .map((id) => {
        const row = tournamentHistory.find((r) => r.tourCardId === id);
        return { id, label: row?.tourCardDisplayName ?? String(id) };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tournamentHistory]);

  const filteredHistoryRows = useMemo(() => {
    if (!Array.isArray(tournamentHistory) || tournamentHistory.length === 0) {
      return [] as TournamentHistoryRow[];
    }

    const rows = tournamentHistory as TournamentHistoryRow[];
    return rows
      .filter((r) => {
        if (tSeasonFilter !== "all" && r.seasonId !== tSeasonFilter) {
          return false;
        }
        if (tTourCardFilter !== "all" && r.tourCardId !== tTourCardFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (!tSort) return 0;
        const dir = tSort.dir === "asc" ? 1 : -1;
        switch (tSort.key) {
          case "start":
            return (
              dir * compareUnknown(a.tournamentStartDate, b.tournamentStartDate)
            );
          case "season": {
            const aLabel = seasonLabelById.get(a.seasonId) ?? "";
            const bLabel = seasonLabelById.get(b.seasonId) ?? "";
            return dir * compareUnknown(aLabel, bLabel);
          }
          case "tournament":
            return dir * compareUnknown(a.tournamentName, b.tournamentName);
          case "points":
            return dir * compareUnknown(a.points, b.points);
          case "earnings":
            return dir * compareUnknown(a.earnings, b.earnings);
          case "position":
            return dir * compareUnknown(a.position, b.position);
        }
      });
  }, [
    seasonLabelById,
    tSeasonFilter,
    tSort,
    tTourCardFilter,
    tournamentHistory,
  ]);

  const historyKind =
    tournamentHistory === undefined
      ? "loading"
      : !Array.isArray(tournamentHistory) || tournamentHistory.length === 0
        ? "empty"
        : "ready";

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
    balanceSummary,
    payoutEmail,
    setPayoutEmail,
    withdrawalAmount,
    setWithdrawalAmount,
    leagueDonationAmount,
    setLeagueDonationAmount,
    charityDonationAmount,
    setCharityDonationAmount,
    submittingPayout,
    payoutError,
    payoutSuccess,
    payoutFormDisabledReason,
    onSubmitPayoutAndDonations,
    seasonLabelById,
    tSeasonFilter,
    setTSeasonFilter,
    tTourCardFilter,
    setTTourCardFilter,
    tSort,
    setTSort,
    toggleSort,
    onSaveProfile,
    tourCardOptions,
    historyKind,
    filteredHistoryRows,
    formatDateTime,
  };
}
