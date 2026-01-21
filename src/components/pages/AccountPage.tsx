import { useCallback, useEffect, useMemo, useState } from "react";

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
import { formatMoney } from "@/lib";
import { useSeasonIdOrCurrent } from "@/hooks";

/**
 * Renders the `/account` screen.
 *
 * This page handles:
 * - Sign-in/sign-out entry points (Clerk)
 * - Updating the member profile and optionally submitting donations and/or an e-transfer request
 *   through a single combined form
 * - Showing the current account balance
 * - Listing the signed-in member’s tournament history (season filter + sortable columns)
 *
 * Data sources:
 * - `api.functions.members.getMembers` (member record by Clerk id)
 * - `api.functions.members.updateMembers` (profile updates)
 * - `api.functions.transactions.createMyDonationTransaction` (donations)
 * - `api.functions.transactions.createMyWithdrawalRequest` (withdrawal requests)
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
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    value={vm.email}
                    onChange={(e) => vm.setEmail(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="name@example.com"
                    inputMode="email"
                    autoComplete="email"
                  />
                  <div className="text-xs text-muted-foreground">
                    Used as your preferred email and e-transfer payout email.
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-start gap-2">
                    <div className="text-lg font-semibold">
                      Available balance
                    </div>
                    <div className="text-lg font-semibold">
                      {vm.memberAccountCents !== undefined
                        ? formatMoney(vm.memberAccountCents)
                        : "—"}
                    </div>
                  </div>
                  <div className="text-sm font-medium">Request e-transfer</div>
                  <div className="space-y-2">
                    <input
                      value={vm.withdrawAmount}
                      onChange={(e) => vm.setWithdrawAmount(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="Amount (CAD)"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="text-sm font-medium">Donate to the PGC</div>
                  <div className="space-y-2">
                    <input
                      value={vm.leagueDonationAmount}
                      onChange={(e) =>
                        vm.setLeagueDonationAmount(e.target.value)
                      }
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="PGC Donation (CAD)"
                      inputMode="decimal"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  onClick={vm.onSubmitAccountForm}
                  disabled={vm.submitting || !vm.memberRaw}
                >
                  {vm.submitting ? "Submitting…" : "Submit"}
                </Button>

                {vm.submitError ? (
                  <div className="text-sm text-red-600">{vm.submitError}</div>
                ) : null}
                {vm.submitSuccess ? (
                  <div className="text-sm text-green-700">
                    {vm.submitSuccess}
                  </div>
                ) : null}
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
                        <th className="hidden py-2 pr-4 sm:table-cell">
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() =>
                              vm.setTSort((prev) =>
                                vm.toggleSort(prev, "start"),
                              )
                            }
                          >
                            Start{vm.sortIndicator("start")}
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
                            Season{vm.sortIndicator("season")}
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
                            Tournament{vm.sortIndicator("tournament")}
                          </button>
                        </th>
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
                            Pos{vm.sortIndicator("position")}
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
                            Pts{vm.sortIndicator("points")}
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
                            Earnings{vm.sortIndicator("earnings")}
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
                          <td className="hidden py-2 pr-4 sm:table-cell">
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
    | "tourCard"
    | "points"
    | "earnings"
    | "position";

  type MemberForAccount = Pick<
    Doc<"members">,
    "_id" | "firstname" | "lastname" | "email" | "account"
  >;
  type SeasonForLabel = Pick<Doc<"seasons">, "_id" | "year" | "number">;
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
    position: string | undefined;
    earnings: number | undefined;
    updatedAt: number | undefined;
  };

  const isMemberForAccount = useCallback(
    (value: unknown): value is MemberForAccount => {
      if (!value || typeof value !== "object") return false;
      if (!("_id" in value) || !("account" in value) || !("email" in value)) {
        return false;
      }
      const record = value as Record<string, unknown>;
      return (
        typeof record.account === "number" && typeof record.email === "string"
      );
    },
    [],
  );

  const isSeasonForLabel = useCallback(
    (value: unknown): value is SeasonForLabel => {
      if (!value || typeof value !== "object") return false;
      if (!("_id" in value) || !("year" in value) || !("number" in value)) {
        return false;
      }
      const record = value as Record<string, unknown>;
      return (
        typeof record.year === "number" && typeof record.number === "number"
      );
    },
    [],
  );

  function formatDateTime(ms: number | undefined): string {
    if (!ms) return "";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(ms);
  }

  function cmp(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  }

  function positionToNumber(pos: string | undefined): number | null {
    if (!pos) return null;
    const raw = pos === "CUT" ? null : pos.startsWith("T") ? pos.slice(1) : pos;
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }

  function toggleSort<T extends string>(
    current: { key: T; dir: SortDir } | null,
    nextKey: T,
  ): { key: T; dir: SortDir } {
    if (!current || current.key !== nextKey)
      return { key: nextKey, dir: "desc" };
    return { key: nextKey, dir: current.dir === "desc" ? "asc" : "desc" };
  }

  const { openSignIn, signOut } = useClerk();
  const { user: clerkUser } = useUser();

  const memberRaw = useQuery(
    api.functions.members.getMembers,
    clerkUser ? { options: { clerkId: clerkUser.id } } : "skip",
  );

  const updateMember = useMutation(api.functions.members.updateMembers);
  const createMyDonationTransaction = useMutation(
    api.functions.transactions.createMyDonationTransaction,
  );
  const createMyWithdrawalRequest = useMutation(
    api.functions.transactions.createMyWithdrawalRequest,
  );

  const seasonIdForTransactions = useSeasonIdOrCurrent();

  const memberForAccount = useMemo<MemberForAccount | null>(() => {
    return isMemberForAccount(memberRaw) ? memberRaw : null;
  }, [isMemberForAccount, memberRaw]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [charityDonationAmount, setCharityDonationAmount] = useState("");
  const [leagueDonationAmount, setLeagueDonationAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  useEffect(() => {
    if (!memberForAccount) return;
    setFirstName(memberForAccount.firstname ?? "");
    setLastName(memberForAccount.lastname ?? "");
    setEmail(memberForAccount.email ?? "");
  }, [memberForAccount]);

  const memberAccountCents = memberForAccount?.account;

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
  const [tSort, setTSort] = useState<{ key: SortKey; dir: SortDir } | null>({
    key: "start",
    dir: "desc",
  });

  function dollarsToCents(input: string): number | null {
    const trimmed = input.trim();
    if (!trimmed) return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    if (n < 0) return null;
    return Math.round(n * 100);
  }

  async function onSubmitAccountForm() {
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!memberForAccount) {
      setSubmitError("You must be signed in");
      return;
    }
    if (!seasonIdForTransactions) {
      setSubmitError("No season is available for this transaction");
      return;
    }

    const charityCents = dollarsToCents(charityDonationAmount);
    const leagueCents = dollarsToCents(leagueDonationAmount);
    const withdrawCents = dollarsToCents(withdrawAmount);

    if (
      charityCents === null ||
      leagueCents === null ||
      withdrawCents === null
    ) {
      setSubmitError("Enter valid amounts");
      return;
    }

    const donationTotal = charityCents + leagueCents;
    const withdrawalTotal = withdrawCents;
    const totalDebit = donationTotal + withdrawalTotal;

    if (totalDebit > 0 && memberForAccount.account < totalDebit) {
      setSubmitError("Total requested exceeds your available balance");
      return;
    }

    const payoutEmail = email.trim();
    if (withdrawalTotal > 0 && !payoutEmail) {
      setSubmitError("Enter an email address for e-transfer payout");
      return;
    }

    const profileChanged =
      (firstName ?? "") !== (memberForAccount.firstname ?? "") ||
      (lastName ?? "") !== (memberForAccount.lastname ?? "") ||
      (email ?? "") !== (memberForAccount.email ?? "");

    if (!profileChanged && donationTotal === 0 && withdrawalTotal === 0) {
      setSubmitError("Nothing to submit");
      return;
    }

    setSubmitting(true);
    try {
      if (profileChanged) {
        await updateMember({
          memberId: memberForAccount._id,
          data: {
            firstname: firstName,
            lastname: lastName,
            email,
          },
          options: {
            returnEnhanced: false,
          },
        });
      }

      if (charityCents > 0) {
        await createMyDonationTransaction({
          seasonId: seasonIdForTransactions,
          donationType: "CharityDonation",
          amountCents: charityCents,
        });
      }
      if (leagueCents > 0) {
        await createMyDonationTransaction({
          seasonId: seasonIdForTransactions,
          donationType: "LeagueDonation",
          amountCents: leagueCents,
        });
      }
      if (withdrawalTotal > 0) {
        await createMyWithdrawalRequest({
          seasonId: seasonIdForTransactions,
          payoutEmail,
          amountCents: withdrawalTotal,
        });
      }

      if (donationTotal > 0) {
        setCharityDonationAmount("");
        setLeagueDonationAmount("");
      }
      if (withdrawalTotal > 0) {
        setWithdrawAmount("");
      }

      const parts: string[] = [];
      if (profileChanged) parts.push("Profile updated");
      if (donationTotal > 0) parts.push("Donation submitted");
      if (withdrawalTotal > 0) parts.push("E-transfer requested (pending)");
      setSubmitSuccess(parts.join(" • "));
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

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
        return true;
      })
      .sort((a, b) => {
        if (!tSort) return 0;
        const dir = tSort.dir === "asc" ? 1 : -1;
        switch (tSort.key) {
          case "start":
            return dir * cmp(a.tournamentStartDate, b.tournamentStartDate);
          case "season": {
            const aLabel = seasonLabelById.get(a.seasonId) ?? "";
            const bLabel = seasonLabelById.get(b.seasonId) ?? "";
            return dir * cmp(aLabel, bLabel);
          }
          case "tournament":
            return dir * cmp(a.tournamentName, b.tournamentName);
          case "tourCard":
            return dir * cmp(a.tourCardDisplayName, b.tourCardDisplayName);
          case "points":
            return dir * cmp(a.points, b.points);
          case "earnings":
            return dir * cmp(a.earnings, b.earnings);
          case "position":
            return (
              dir *
              cmp(positionToNumber(a.position), positionToNumber(b.position))
            );
        }
      });
  }, [seasonLabelById, tSeasonFilter, tSort, tournamentHistory]);

  function sortIndicator(key: string) {
    if (!tSort || tSort.key !== key) return "";
    return tSort.dir === "asc" ? " ▲" : " ▼";
  }

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
    email,
    setEmail,
    submitting,
    submitError,
    submitSuccess,
    memberAccountCents,
    seasonIdForTransactions,
    charityDonationAmount,
    setCharityDonationAmount,
    leagueDonationAmount,
    setLeagueDonationAmount,
    withdrawAmount,
    setWithdrawAmount,
    onSubmitAccountForm,
    seasonLabelById,
    tSeasonFilter,
    setTSeasonFilter,
    tSort,
    setTSort,
    toggleSort,
    sortIndicator,
    historyKind,
    filteredHistoryRows,
    formatDateTime,
  };
}
