import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex";
import type { Id } from "@/convex";
import type {
  MemberDoc,
  SeasonDoc,
  TransactionDoc,
} from "../../../convex/types/types";

import { AdminEditDeleteActions } from "@/ui";
import { AdminCrudSection } from "@/components/internal/AdminCrudSection";
import { Card, CardContent, CardHeader, Skeleton } from "@/ui";
import { Field } from "@/components/internal/AdminField";
import { ADMIN_FORM_CONTROL_CLASSNAME } from "@/lib/constants";
import { adminActionsColumn } from "@/lib/adminTable";

/**
 * Admin UI for creating and editing ledger transactions.
 *
 * Data sources:
 * - Convex queries for members, seasons, and recent transactions.
 * - Convex mutations for creating and updating transactions.
 *
 * Major render states:
 * - Loading: renders an internal skeleton until required lists are available.
 * - Ready: renders a create/update form and a filterable list of recent transactions.
 *
 * @returns Transactions management UI.
 */
export function TransactionsManager() {
  const model = useTransactionsManager();

  if (model.status === "loading") return <TransactionsManagerSkeleton />;

  return (
    <AdminCrudSection<TransactionDoc>
      formTitle={model.isEditing ? "Update Transaction" : "Create Transaction"}
      formDescription="Enter payouts, fees, donations, and other ledger entries."
      formFields={
        <>
          <Field label="Season">
            <select
              value={model.form.seasonId}
              onChange={(e) =>
                model.updateField("seasonId", e.target.value as Id<"seasons">)
              }
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            >
              <option value="">Select season</option>
              {model.seasons.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.year} #{s.number}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Member">
            <div className="space-y-2">
              <input
                value={model.memberSearch}
                onChange={(e) => model.setMemberSearch(e.target.value)}
                placeholder="Search by name or email"
                className={ADMIN_FORM_CONTROL_CLASSNAME}
              />
              <select
                value={model.form.memberId}
                onChange={(e) =>
                  model.updateField("memberId", e.target.value as Id<"members">)
                }
                className={ADMIN_FORM_CONTROL_CLASSNAME}
              >
                <option value="">Select member</option>
                {model.filteredMembers.map((m) => {
                  const name =
                    (m.firstname || m.lastname
                      ? `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim()
                      : m.email) || m.email;
                  const label = m.email ? `${name}  ${m.email}` : name;
                  return (
                    <option key={m._id} value={m._id}>
                      {label}
                    </option>
                  );
                })}
              </select>
              {model.filteredMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No members match this search.
                </p>
              ) : null}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <select
                value={model.form.transactionType}
                onChange={(e) => model.setTransactionType(e.target.value)}
                className={ADMIN_FORM_CONTROL_CLASSNAME}
              >
                <option value="">Select type</option>
                {model.transactionTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Amount (cents)">
              <input
                value={model.form.amountCents}
                onChange={(e) =>
                  model.updateField("amountCents", e.target.value)
                }
                className={ADMIN_FORM_CONTROL_CLASSNAME}
                inputMode="numeric"
                placeholder={
                  model.form.transactionType === "Adjustment"
                    ? "e.g. -2500 or 2500"
                    : "e.g. 2500"
                }
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status (optional)">
              <select
                value={model.form.status}
                onChange={(e) => model.setFormStatus(e.target.value)}
                className={ADMIN_FORM_CONTROL_CLASSNAME}
              >
                <option value="">(none)</option>
                {model.transactionStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Processed At (optional)">
              <input
                type="datetime-local"
                value={model.form.processedAt}
                onChange={(e) =>
                  model.updateField("processedAt", e.target.value)
                }
                className={ADMIN_FORM_CONTROL_CLASSNAME}
              />
            </Field>
          </div>
        </>
      }
      formError={model.error}
      formSuccess={model.success}
      submitting={model.submitting}
      primaryActionLabel={
        model.submitting
          ? "Saving"
          : model.isEditing
            ? "Update Transaction"
            : "Create Transaction"
      }
      secondaryActionLabel={model.isEditing ? "Cancel" : "Reset"}
      onSecondaryAction={model.resetForm}
      onSubmit={model.onSubmit}
      tableTitle="Recent Transactions"
      tableDescription="Filter list by season and click Edit to load."
      tableControls={
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Filter by season (optional)">
            <select
              value={model.seasonFilter}
              onChange={(e) =>
                model.setSeasonFilter(e.target.value as Id<"seasons"> | "")
              }
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            >
              <option value="">All seasons</option>
              {model.seasons.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.year} #{s.number}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Filter by type (optional)">
            <select
              value={model.typeFilter}
              onChange={(e) => model.setTypeFilter(e.target.value)}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            >
              <option value="">All types</option>
              {model.transactionTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Filter by status (optional)">
            <select
              value={model.statusFilter}
              onChange={(e) => model.setStatusFilter(e.target.value)}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            >
              <option value="">All statuses</option>
              {model.transactionStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
        </div>
      }
      tableRows={model.filteredTransactions}
      tableEmptyMessage="No transactions found."
      tableColumns={[
        { id: "type", header: "Type", cell: (t) => t.transactionType },
        {
          id: "amount",
          header: "Amount",
          cell: (t) =>
            model.formatCentsAsDollars(
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
                  ? model.membersById.get(memberId)
                  : undefined;
                if (m) return m.email;
                return (t as unknown as { clerkId?: string }).clerkId ?? "";
              })()}
            </span>
          ),
        },
        { id: "status", header: "Status", cell: (t) => t.status ?? "" },
        adminActionsColumn((t) => (
          <AdminEditDeleteActions
            onEdit={() => model.loadTransaction(t)}
            disabled={model.submitting}
          />
        )),
      ]}
    />
  );
}

/**
 * Fetches and manages form/list state for `TransactionsManager`.
 *
 * @returns View-model used by the UI to render and to perform create/update actions.
 */
function useTransactionsManager() {
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

  type TransactionFormState = {
    transactionId: Id<"transactions"> | "";
    memberId: Id<"members"> | "";
    seasonId: Id<"seasons"> | "";
    amountCents: string;
    transactionType: TransactionType | "";
    status: TransactionStatus | "";
    processedAt: string;
  };

  type Model =
    | { status: "loading" }
    | {
        status: "ready";
        seasons: SeasonDoc[];
        membersById: Map<string, MemberDoc>;
        transactionTypes: TransactionType[];
        transactionStatuses: TransactionStatus[];
        seasonFilter: Id<"seasons"> | "";
        setSeasonFilter: (next: Id<"seasons"> | "") => void;
        typeFilter: TransactionType | "";
        setTypeFilter: (next: string) => void;
        statusFilter: TransactionStatus | "";
        setStatusFilter: (next: string) => void;
        filteredTransactions: TransactionDoc[];
        form: TransactionFormState;
        updateField: <K extends keyof TransactionFormState>(
          key: K,
          value: TransactionFormState[K],
        ) => void;
        setTransactionType: (next: string) => void;
        setFormStatus: (next: string) => void;
        resetForm: () => void;
        loadTransaction: (t: TransactionDoc) => void;
        onSubmit: (e: FormEvent) => Promise<void>;
        isEditing: boolean;
        memberSearch: string;
        setMemberSearch: (next: string) => void;
        filteredMembers: MemberDoc[];
        error: string | null;
        success: string | null;
        submitting: boolean;
        formatCentsAsDollars: (cents: number) => string;
      };

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

  const DEFAULT_AMOUNT_CENTS = "10000";
  const DEFAULT_TRANSACTION_TYPE: TransactionType = "Payment";
  const DEFAULT_STATUS: TransactionStatus = "completed";

  const msToDateTimeLocal = (ms: number | undefined): string => {
    if (!ms) return "";
    const d = new Date(ms);
    const pad = (n: number) => `${n}`.padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const dateTimeLocalToMs = (value: string): number => {
    return new Date(value).getTime();
  };

  const formatCentsAsDollars = (cents: number): string => {
    const sign = cents < 0 ? "-" : "";
    return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
  };

  const normalizeList = <T, K extends string>(
    result: Array<T | null> | Record<K, Array<T | null>> | undefined,
    key: K,
  ): T[] => {
    if (!result) return [];
    if (Array.isArray(result)) {
      return result.filter((x): x is T => x !== null);
    }
    const value = result[key];
    if (Array.isArray(value)) {
      return value.filter((x): x is T => x !== null);
    }
    return [];
  };

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
  const [typeFilter, setTypeFilterState] = useState<TransactionType | "">("");
  const [statusFilter, setStatusFilterState] = useState<TransactionStatus | "">(
    "",
  );

  const isTransactionType = (value: string): value is TransactionType => {
    return (TRANSACTION_TYPES as string[]).includes(value);
  };

  const isTransactionStatus = (value: string): value is TransactionStatus => {
    return (TRANSACTION_STATUSES as string[]).includes(value);
  };

  const setTypeFilter = (next: string) => {
    setTypeFilterState(isTransactionType(next) ? next : "");
  };

  const setStatusFilter = (next: string) => {
    setStatusFilterState(isTransactionStatus(next) ? next : "");
  };

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
    amountCents: DEFAULT_AMOUNT_CENTS,
    transactionType: DEFAULT_TRANSACTION_TYPE,
    status: DEFAULT_STATUS,
    processedAt: "",
  });

  const isEditing = Boolean(form.transactionId);

  useEffect(() => {
    if (isEditing) return;
    const defaultSeasonId = seasons[0]?._id ?? "";
    if (!defaultSeasonId) return;

    setForm((prev) => {
      if (prev.transactionId) return prev;

      let changed = false;
      const next: TransactionFormState = { ...prev };

      if (!next.seasonId) {
        next.seasonId = defaultSeasonId;
        changed = true;
      }

      if (!next.amountCents) {
        next.amountCents = DEFAULT_AMOUNT_CENTS;
        changed = true;
      }

      if (!next.transactionType) {
        next.transactionType = DEFAULT_TRANSACTION_TYPE;
        changed = true;
      }

      if (!next.status) {
        next.status = DEFAULT_STATUS;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [DEFAULT_AMOUNT_CENTS, DEFAULT_STATUS, DEFAULT_TRANSACTION_TYPE, isEditing, seasons]);

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateField = <K extends keyof TransactionFormState>(
    key: K,
    value: TransactionFormState[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const setTransactionType = (next: string) => {
    updateField("transactionType", isTransactionType(next) ? next : "");
  };

  const setFormStatus = (next: string) => {
    updateField("status", isTransactionStatus(next) ? next : "");
  };

  const resetForm = () => {
    const defaultSeasonId = seasons[0]?._id ?? "";
    setForm({
      transactionId: "",
      memberId: "",
      seasonId: defaultSeasonId,
      amountCents: DEFAULT_AMOUNT_CENTS,
      transactionType: DEFAULT_TRANSACTION_TYPE,
      status: DEFAULT_STATUS,
      processedAt: "",
    });
    setError(null);
    setSuccess(null);
  };

  const loadTransaction = (t: TransactionDoc) => {
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
  };

  const onSubmit = async (e: FormEvent) => {
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
  };

  const isStillLoading =
    membersResult === undefined ||
    seasonsResult === undefined ||
    transactionsResult === undefined;

  if (isStillLoading) return { status: "loading" } as const satisfies Model;

  return {
    status: "ready",
    seasons,
    membersById,
    transactionTypes: TRANSACTION_TYPES,
    transactionStatuses: TRANSACTION_STATUSES,
    seasonFilter,
    setSeasonFilter,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    filteredTransactions,
    form,
    updateField,
    setTransactionType,
    setFormStatus,
    resetForm,
    loadTransaction,
    onSubmit,
    isEditing,
    memberSearch,
    setMemberSearch,
    filteredMembers,
    error,
    success,
    submitting,
    formatCentsAsDollars,
  } as const satisfies Model;
}

/**
 * Loading UI for `TransactionsManager`.
 */
function TransactionsManagerSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
