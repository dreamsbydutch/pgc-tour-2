import { useMemo, useState } from "react";

import { api, useQuery } from "@/convex";
import type { Id } from "@/convex";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui";

import {
  ADMIN_FORM_CONTROL_CLASSNAME,
  formatCentsAsDollars,
  normalizeList,
} from "@/lib";

/**
 * Renders the Admin Dashboard "Account Audit" section.
 *
 * This screen reconciles each member's stored `members.account` balance (cents) against a computed sum of their transactions.
 * It lists only the members where the two numbers do not match, and lets an admin open a dialog to inspect the full
 * transaction history for that member.
 *
 * Data sources:
 * - `api.functions.transactions.adminGetMemberAccountAudit` (mismatch detection + transaction lists)
 *
 * Major render states:
 * - Loading (query pending)
 * - No mismatches
 * - Mismatch table + per-member transaction dialog
 */
export function MemberAccountAuditPage() {
  const vm = useMemberAccountAuditPage();
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  const audit = useQuery(
    api.functions.transactions.adminGetTournamentWinningsAudit,
    vm.seasonId ? { seasonId: vm.seasonId } : "skip",
  );

  const mismatches = audit?.mismatches ?? [];

  const selected = useMemo(() => {
    if (!openMemberId) return null;
    return mismatches.find((m) => m.member._id === openMemberId) ?? null;
  }, [mismatches, openMemberId]);

  if (!vm.seasonsLoaded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Audit</CardTitle>
          <CardDescription>Loading seasons…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!vm.seasonId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Audit</CardTitle>
          <CardDescription>No seasons found.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!audit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Audit</CardTitle>
          <CardDescription>Loading tournament winnings audit…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account Audit</CardTitle>
          <CardDescription>
            Audits tournament-by-tournament earnings vs Tournament Winnings
            transactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {audit.mismatchCount} mismatch(es) across {audit.memberCount}{" "}
            member(s) · {audit.tournamentCount} tournament(s)
          </div>

          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Season</div>
            <select
              value={vm.seasonId}
              onChange={(e) => vm.setSeasonId(e.target.value as Id<"seasons">)}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            >
              {vm.seasons.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.year} #{s.number}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {mismatches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>All good</CardTitle>
            <CardDescription>
              No members found where computed tournament earnings differ from
              Tournament Winnings transactions for this season.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Mismatched Members</CardTitle>
            <CardDescription>
              Click “View transactions” to inspect the full ledger.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead className="text-right">Winnings Txns</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mismatches.map((row) => {
                  const name = [row.member.firstname, row.member.lastname]
                    .filter(Boolean)
                    .join(" ");
                  const memberLabel = name || row.member.email;

                  return (
                    <TableRow key={row.member._id}>
                      <TableCell>
                        <div className="font-medium">{memberLabel}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.member.email} · {row.member.role}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCentsAsDollars(row.tournamentEarningsTotalCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCentsAsDollars(
                          row.tournamentWinningsTransactionSumCents,
                        )}
                      </TableCell>
                      <TableCell
                        className={
                          row.deltaCents === 0
                            ? "text-right"
                            : row.deltaCents > 0
                              ? "text-right text-amber-700"
                              : "text-right text-red-700"
                        }
                      >
                        {formatCentsAsDollars(row.deltaCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setOpenMemberId(row.member._id)}
                        >
                          View details (
                          {row.tournamentWinningsTransactions.length})
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={openMemberId !== null}
        onOpenChange={() => setOpenMemberId(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Member Audit Details</DialogTitle>
            {selected ? (
              <DialogDescription>
                {selected.member.email} — Earnings{" "}
                {formatCentsAsDollars(selected.tournamentEarningsTotalCents)} ·
                Winnings Txns{" "}
                {formatCentsAsDollars(
                  selected.tournamentWinningsTransactionSumCents,
                )}{" "}
                · Delta {formatCentsAsDollars(selected.deltaCents)}
              </DialogDescription>
            ) : (
              <DialogDescription>Loading member details…</DialogDescription>
            )}
          </DialogHeader>

          <div className="px-6 pb-4">
            {selected ? (
              <div className="space-y-6">
                <div>
                  <div className="pb-2 text-sm font-medium">
                    Tournament earnings
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tournament</TableHead>
                        <TableHead className="text-right">Earnings</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.tournamentEarningsByTournament.map((row) => (
                        <TableRow key={row.tournamentId}>
                          <TableCell>{row.tournamentName}</TableCell>
                          <TableCell className="text-right">
                            {formatCentsAsDollars(row.earningsCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <div className="pb-2 text-sm font-medium">
                    Tournament Winnings transactions
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.tournamentWinningsTransactions.map((t) => {
                        const dateValue = t.processedAt ?? t._creationTime;
                        const dateLabel = dateValue
                          ? new Date(dateValue).toLocaleString()
                          : "—";

                        return (
                          <TableRow key={t._id}>
                            <TableCell className="whitespace-nowrap">
                              {dateLabel}
                            </TableCell>
                            <TableCell>{t.status ?? "—"}</TableCell>
                            <TableCell className="text-right">
                              {formatCentsAsDollars(t.amount)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenMemberId(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Hook backing the tournament-winnings audit UI.
 *
 * Fetches seasons to drive the season selector and manages the selected season id.
 * The audit data itself is fetched in the component via `useQuery` so it can be skipped until a season is selected.
 */
function useMemberAccountAuditPage() {
  const seasonsResult = useQuery(api.functions.seasons.getSeasons, {
    options: {
      pagination: { limit: 50 },
      sort: { sortBy: "year", sortOrder: "desc" },
    },
  });

  const seasons = useMemo(() => {
    const list = normalizeList<
      { _id: Id<"seasons">; year: number; number: number },
      "seasons"
    >(seasonsResult as unknown, "seasons");

    return [...list].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.number - a.number;
    });
  }, [seasonsResult]);

  const seasonsLoaded = seasonsResult !== undefined;

  const [seasonId, setSeasonId] = useState<Id<"seasons"> | null>(() => {
    const first = seasons[0]?._id;
    return first ?? null;
  });

  const effectiveSeasonId = useMemo(() => {
    if (!seasonsLoaded) return null;
    if (!seasonId) return seasons[0]?._id ?? null;
    const stillExists = seasons.some((s) => s._id === seasonId);
    return stillExists ? seasonId : (seasons[0]?._id ?? null);
  }, [seasonId, seasons, seasonsLoaded]);

  return {
    seasonsLoaded,
    seasons,
    seasonId: effectiveSeasonId,
    setSeasonId,
  };
}
