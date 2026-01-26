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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui";

import { ADMIN_FORM_CONTROL_CLASSNAME, formatCentsAsDollars } from "@/lib";

/**
 * Renders the Admin Dashboard "Account Audit" section.
 *
 * Reconciles each member's stored `members.account` balance (cents) against a computed sum of their transactions.
 * It shows:
 * - Any discrepancies (account != transaction sum)
 * - Any non-zero balances (outstanding)
 *
 * Data sources:
 * - `api.functions.transactions.adminGetMemberAccountAudit`
 * - `api.functions.transactions.adminGetMemberLedgerForAudit`
 *
 * @returns The account audit admin UI.
 */
export function MemberAccountAuditPage() {
  const [sumMode, setSumMode] = useState<"completed" | "all">("all");
  const [openMemberId, setOpenMemberId] = useState<Id<"members"> | null>(null);

  const audit = useQuery(
    api.functions.transactions.adminGetMemberAccountAudit,
    {
      options: { sumMode },
    },
  );

  const mismatches = useMemo(() => audit?.mismatches ?? [], [audit]);
  const outstanding = useMemo(() => audit?.outstandingBalances ?? [], [audit]);

  const ledger = useQuery(
    api.functions.transactions.adminGetMemberLedgerForAudit,
    openMemberId ? { memberId: openMemberId, options: { sumMode } } : "skip",
  );

  const openLabel = useMemo(() => {
    if (!openMemberId) return null;

    const row =
      mismatches.find((m) => m.member._id === openMemberId) ??
      outstanding.find((m) => m.member._id === openMemberId) ??
      null;

    if (!row) return null;
    const name = [row.member.firstname, row.member.lastname]
      .filter(Boolean)
      .join(" ");
    return name || row.member.email;
  }, [mismatches, openMemberId, outstanding]);

  if (!audit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Audit</CardTitle>
          <CardDescription>Loading account reconciliation…</CardDescription>
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
            Checks each member’s stored balance against the sum of transactions
            and lists non-zero balances.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {audit.mismatchCount} discrepancy(ies) · {audit.outstandingCount}{" "}
            outstanding · {audit.memberCount} total
          </div>

          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Sum mode</div>
            <select
              value={sumMode}
              onChange={(e) =>
                setSumMode(e.target.value as "completed" | "all")
              }
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            >
              <option value="all">All transactions</option>
              <option value="completed">Completed only</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {mismatches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No discrepancies</CardTitle>
            <CardDescription>
              No members found where the stored account differs from the
              transaction sum.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Discrepancies</CardTitle>
            <CardDescription>
              Members where stored account balance does not match the
              transaction sum.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Account</TableHead>
                  <TableHead className="text-right">Txn sum</TableHead>
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
                        {formatCentsAsDollars(row.accountCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCentsAsDollars(row.includedSumCents)}
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
                          View transactions ({row.transactions.length})
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

      {outstanding.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No outstanding balances</CardTitle>
            <CardDescription>All member balances are $0.00.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Outstanding balances</CardTitle>
            <CardDescription>
              Members with a non-zero stored account balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Txn sum</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstanding.map((row) => {
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
                        {formatCentsAsDollars(row.accountCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCentsAsDollars(row.includedSumCents)}
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
                      <TableCell>
                        {row.isMismatch ? (
                          <span className="text-red-700">Mismatch</span>
                        ) : (
                          <span className="text-muted-foreground">OK</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setOpenMemberId(row.member._id)}
                        >
                          View transactions
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
            <DialogTitle>
              {openLabel ? `${openLabel} — Ledger` : "Ledger"}
            </DialogTitle>
            {ledger ? (
              <DialogDescription>
                Account {formatCentsAsDollars(ledger.accountCents)} · Txn sum{" "}
                {formatCentsAsDollars(ledger.includedSumCents)} · Delta{" "}
                {formatCentsAsDollars(ledger.deltaCents)}
              </DialogDescription>
            ) : (
              <DialogDescription>Loading transactions…</DialogDescription>
            )}
          </DialogHeader>

          <div className="px-6 pb-4">
            {ledger ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Season</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.transactions.map((t) => {
                    const dateValue = t.processedAt ?? t._creationTime;
                    const dateLabel = dateValue
                      ? new Date(dateValue).toLocaleString()
                      : "—";
                    const seasonLabel =
                      (t as unknown as { seasonLabel?: string }).seasonLabel ??
                      String(t.seasonId);

                    return (
                      <TableRow key={t._id}>
                        <TableCell className="whitespace-nowrap">
                          {dateLabel}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {seasonLabel}
                        </TableCell>
                        <TableCell>{t.transactionType}</TableCell>
                        <TableCell>{t.status ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {formatCentsAsDollars(t.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
