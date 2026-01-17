import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  MemberDoc,
  SeasonDoc,
  TransactionDoc,
} from "../../../convex/types/types";
import { AdminDataTable } from "@/components/admin/AdminDataTable";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type TransactionType =
  | "TourCardFee"
  | "TournamentWinnings"
  | "Withdrawal"
  | "Deposit"
  | "LeagueDonation"
  | "CharityDonation"
  | "Payment"
  | "Refund"
  | "Adjustment";

type TransactionStatus = "pending" | "completed" | "failed" | "cancelled";

const TRANSACTION_TYPES: TransactionType[] = [
  "TourCardFee",
  "TournamentWinnings",
  "Withdrawal",
  "Deposit",
  "LeagueDonation",
  "CharityDonation",
  "Payment",
  "Refund",
  "Adjustment",
];

const TRANSACTION_STATUSES: TransactionStatus[] = [
  "pending",
  "completed",
  "failed",
  "cancelled",
];

type TransactionFormState = {
  transactionId: Id<"transactions"> | "";
  memberId: Id<"members"> | "";
  seasonId: Id<"seasons"> | "";
  amountCents: string;
  transactionType: TransactionType | "";
  status: TransactionStatus | "";
  processedAt: string;
};

function msToDateTimeLocal(ms: number | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function dateTimeLocalToMs(value: string): number {
  return new Date(value).getTime();
}

function formatCentsAsDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function normalizeList<T, K extends string>(
  result: Array<T | null> | Record<K, Array<T | null>> | undefined,
  key: K,
): T[] {
  if (!result) return [];
  if (Array.isArray(result)) {
    return result.filter((x): x is T => x !== null);
  }
  const value = result[key];
  if (Array.isArray(value)) {
    return value.filter((x): x is T => x !== null);
  }
  return [];
}

export function TransactionsManager() {
  const createTransaction = useMutation(
    api.functions.transactions.createTransactions,
  );
  const updateTransaction = useMutation(
    api.functions.transactions.updateTransactions,
  );

  const membersResult = useQuery(api.functions.members.getMembers, {
    options: {
      pagination: { limit: 500 },
      sort: { sortBy: "email", sortOrder: "asc" },
    },
  });

  const seasonsResult = useQuery(api.functions.seasons.getSeasons, {
    options: {
      pagination: { limit: 50 },
      sort: { sortBy: "year", sortOrder: "desc" },
    },
  });

  const seasons = useMemo(() => {
    return normalizeList<SeasonDoc, "seasons">(
      seasonsResult as
        | Array<SeasonDoc | null>
        | { seasons: Array<SeasonDoc | null> }
        | undefined,
      "seasons",
    ).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.number - a.number;
    });
  }, [seasonsResult]);

  const members = useMemo(() => {
    return normalizeList<MemberDoc, "members">(
      membersResult as
        | Array<MemberDoc | null>
        | { members: Array<MemberDoc | null> }
        | undefined,
      "members",
    );
  }, [membersResult]);

  const membersById = useMemo(() => {
    const map = new Map<string, MemberDoc>();
    for (const m of members) map.set(m._id, m);
    return map;
  }, [members]);

  const [seasonFilter, setSeasonFilter] = useState<Id<"seasons"> | "">("");
  const [typeFilter, setTypeFilter] = useState<TransactionType | "">("");
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | "">("");

  const transactionsResult = useQuery(
    api.functions.transactions.getTransactions,
    {
      options: {
        ...(seasonFilter ? { filter: { seasonId: seasonFilter } } : {}),
        limit: 100,
      },
    },
  );

  const transactions = useMemo(() => {
    const raw = transactionsResult as unknown;
    const list = Array.isArray(raw)
      ? (raw as Array<TransactionDoc | null>).filter(
          (t): t is TransactionDoc => t !== null,
        )
      : [];

    return [...list].sort((a, b) => b._creationTime - a._creationTime);
  }, [transactionsResult]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (typeFilter && tx.transactionType !== typeFilter) return false;
      if (statusFilter && (tx.status ?? "") !== statusFilter) return false;
      return true;
    });
  }, [transactions, typeFilter, statusFilter]);

  const [form, setForm] = useState<TransactionFormState>({
    transactionId: "",
    memberId: "",
    seasonId: "",
    amountCents: "",
    transactionType: "",
    status: "",
    processedAt: "",
  });

  const [memberSearch, setMemberSearch] = useState("");
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const term = memberSearch.toLowerCase();
    return members.filter((m) => {
      const email = m.email?.toLowerCase() ?? "";
      const first = m.firstname?.toLowerCase() ?? "";
      const last = m.lastname?.toLowerCase() ?? "";
      const full = `${first} ${last}`.trim();
      return (
        email.includes(term) ||
        first.includes(term) ||
        last.includes(term) ||
        full.includes(term)
      );
    });
  }, [members, memberSearch]);

  const isEditing = Boolean(form.transactionId);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateField<K extends keyof TransactionFormState>(
    key: K,
    value: TransactionFormState[K],
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function resetForm() {
    setForm({
      transactionId: "",
      memberId: "",
      seasonId: "",
      amountCents: "",
      transactionType: "",
      status: "",
      processedAt: "",
    });
    setError(null);
    setSuccess(null);
  }

  function loadTransaction(t: TransactionDoc) {
    const legacyClerkId = (t as unknown as { clerkId?: string }).clerkId;
    const fallbackMemberId =
      !t.memberId && legacyClerkId
        ? (members.find((m) => m.clerkId === legacyClerkId)?._id as
            | Id<"members">
            | undefined)
        : undefined;

    const txType = (t.transactionType ??
      "") as TransactionFormState["transactionType"];
    const amountCents = typeof t.amount === "number" ? t.amount : 0;
    const displayCents =
      txType === "Adjustment" ? amountCents : Math.abs(amountCents);

    setForm({
      transactionId: t._id,
      memberId: t.memberId ?? fallbackMemberId ?? "",
      seasonId: t.seasonId,
      amountCents: `${displayCents}`,
      transactionType: txType,
      status: (t.status ?? "") as TransactionFormState["status"],
      processedAt: msToDateTimeLocal(t.processedAt),
    });
    setError(null);
    setSuccess(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.seasonId) {
      setError("Season is required.");
      return;
    }

    if (!form.transactionType) {
      setError("Transaction type is required.");
      return;
    }

    if (!form.memberId) {
      setError("Member is required.");
      return;
    }

    const rawCents = Number(form.amountCents);
    const amount = Math.trunc(rawCents);
    if (!Number.isFinite(rawCents) || amount === 0) {
      setError(
        "Amount is required (non-zero). Use cents (e.g. 2500 = $25.00).",
      );
      return;
    }

    const normalizedAmount =
      form.transactionType === "Adjustment" ? amount : Math.abs(amount);

    const processedAt = form.processedAt
      ? dateTimeLocalToMs(form.processedAt)
      : undefined;

    setSubmitting(true);
    try {
      if (isEditing) {
        await updateTransaction({
          transactionId: form.transactionId as Id<"transactions">,
          data: {
            memberId: form.memberId as Id<"members">,
            seasonId: form.seasonId as Id<"seasons">,
            amount: normalizedAmount,
            transactionType: form.transactionType as TransactionType,
            ...(form.status
              ? { status: form.status as TransactionStatus }
              : {}),
            ...(processedAt !== undefined ? { processedAt } : {}),
          },
        });
        setSuccess("Transaction updated.");
      } else {
        await createTransaction({
          data: {
            memberId: form.memberId as Id<"members">,
            seasonId: form.seasonId as Id<"seasons">,
            amount: normalizedAmount,
            transactionType: form.transactionType as TransactionType,
            ...(form.status
              ? { status: form.status as TransactionStatus }
              : {}),
            ...(processedAt !== undefined ? { processedAt } : {}),
          },
        });
        setSuccess("Transaction created.");
        resetForm();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {isEditing ? "Update Transaction" : "Create Transaction"}
          </CardTitle>
          <CardDescription>
            Enter payouts, fees, donations, and other ledger entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Season">
              <select
                value={form.seasonId}
                onChange={(e) =>
                  updateField("seasonId", e.target.value as Id<"seasons">)
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Select season</option>
                {seasons.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.year} #{s.number}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Member">
              <div className="space-y-2">
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search by name or email"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
                <select
                  value={form.memberId}
                  onChange={(e) =>
                    updateField("memberId", e.target.value as Id<"members">)
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select member</option>
                  {filteredMembers.map((m) => {
                    const name =
                      (m.firstname || m.lastname
                        ? `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim()
                        : m.email) || m.email;
                    const label = m.email ? `${name} — ${m.email}` : name;
                    return (
                      <option key={m._id} value={m._id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                {filteredMembers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No members match this search.
                  </p>
                ) : null}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <select
                  value={form.transactionType}
                  onChange={(e) =>
                    updateField(
                      "transactionType",
                      e.target.value as TransactionFormState["transactionType"],
                    )
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select type</option>
                  {TRANSACTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Amount (cents)">
                <input
                  value={form.amountCents}
                  onChange={(e) => updateField("amountCents", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  inputMode="numeric"
                  placeholder={
                    form.transactionType === "Adjustment"
                      ? "e.g. -2500 or 2500"
                      : "e.g. 2500"
                  }
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status (optional)">
                <select
                  value={form.status}
                  onChange={(e) =>
                    updateField(
                      "status",
                      e.target.value as TransactionFormState["status"],
                    )
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">(none)</option>
                  {TRANSACTION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Processed At (optional)">
                <input
                  type="datetime-local"
                  value={form.processedAt}
                  onChange={(e) => updateField("processedAt", e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </Field>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? (
              <p className="text-sm text-green-700">{success}</p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? "Saving…"
                  : isEditing
                    ? "Update Transaction"
                    : "Create Transaction"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={submitting}
              >
                {isEditing ? "Cancel" : "Reset"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>
            Filter list by season and click “Edit” to load.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-4 md:grid-cols-3">
            <Field label="Filter by season (optional)">
              <select
                value={seasonFilter}
                onChange={(e) =>
                  setSeasonFilter(e.target.value as Id<"seasons"> | "")
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">All seasons</option>
                {seasons.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.year} #{s.number}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Filter by type (optional)">
              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value as TransactionType | "")
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">All types</option>
                {TRANSACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Filter by status (optional)">
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as TransactionStatus | "")
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                {TRANSACTION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <AdminDataTable<TransactionDoc>
            rows={filteredTransactions}
            emptyMessage="No transactions found."
            columns={[
              { id: "type", header: "Type", cell: (t) => t.transactionType },
              {
                id: "amount",
                header: "Amount",
                cell: (t) =>
                  formatCentsAsDollars(
                    typeof t.amount === "number" ? t.amount : 0,
                  ),
              },
              {
                id: "member",
                header: "Member",
                cell: (t) => (
                  <span className="block max-w-[200px] truncate">
                    {(() => {
                      const memberId = (t as unknown as { memberId?: string })
                        .memberId;
                      const m = memberId
                        ? membersById.get(memberId)
                        : undefined;
                      if (m) return m.email;
                      return (
                        (t as unknown as { clerkId?: string }).clerkId ?? ""
                      );
                    })()}
                  </span>
                ),
              },
              { id: "status", header: "Status", cell: (t) => t.status ?? "" },
              {
                id: "actions",
                header: "",
                headClassName: "w-[1%]",
                cell: (t) => (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadTransaction(t)}
                  >
                    Edit
                  </Button>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
