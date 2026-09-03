import {
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  Mail,
  WalletCards,
  XCircle,
} from "lucide-react";
import { lazy, Suspense } from "react";

import type {
  AdminSettlementHubProps,
  SettlementAdminFilter,
  SettlementChecklistItemProps,
} from "@/types";
import { Button, Skeleton } from "@/ui";
import { settlementStatusLabel } from "@/utils";
import { formatMoney } from "@/utils/app";
import { cn } from "@/utils/classNames";

const filters: Array<{ value: SettlementAdminFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const TransferQueue = lazy(async () => {
  const module = await import("./TransferQueue");
  return { default: module.TransferQueue };
});

export function SettlementHub(props: AdminSettlementHubProps) {
  const transferRequests = (props.requests ?? [])
    .filter(
      (request) => request.transferCents > 0 && request.status !== "cancelled",
    )
    .sort((a, b) => {
      const aPaid = a.transferCompletedAt === undefined ? 0 : 1;
      const bPaid = b.transferCompletedAt === undefined ? 0 : 1;
      return aPaid - bPaid || a.submittedAt - b.submittedAt;
    });
  const requestedTransferTotal = transferRequests.reduce(
    (total, request) => total + request.transferCents,
    0,
  );

  return (
    <section
      id={props.embedded ? undefined : "payout-requests"}
      className="scroll-mt-20 space-y-4"
      aria-label={props.embedded ? "Payout requests" : undefined}
      aria-labelledby={props.embedded ? undefined : "payout-requests-title"}
    >
      {props.embedded ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 divide-x py-2">
            <div className="pr-4">
              <p className="text-xs text-muted-foreground">Open requests</p>
              <p className="mt-1 text-xl font-bold">{props.pendingCount}</p>
            </div>
            <div className="pl-4">
              <p className="text-xs text-muted-foreground">E-transfers due</p>
              <p className="mt-1 text-xl font-bold">
                {formatMoney(props.pendingTransferTotal, true)}
              </p>
            </div>
          </div>
          <CreditWinningsButton {...props} />
        </div>
      ) : (
        <div>
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h2 id="payout-requests-title" className="text-2xl font-bold">
                Payout request hub
              </h2>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 divide-x">
                <div className="pr-4">
                  <p className="text-xs text-muted-foreground">Open requests</p>
                  <p className="mt-1 text-xl font-bold">{props.pendingCount}</p>
                </div>
                <div className="pl-4">
                  <p className="text-xs text-muted-foreground">
                    E-transfers due
                  </p>
                  <p className="mt-1 text-xl font-bold">
                    {formatMoney(props.pendingTransferTotal, true)}
                  </p>
                </div>
              </div>
              <CreditWinningsButton {...props} />
            </div>
          </div>
        </div>
      )}

      {props.feedback ? (
        <div
          role={props.feedback.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            props.feedback.tone === "success" &&
              "border-green-200 bg-green-50 text-green-800",
            props.feedback.tone === "error" &&
              "border-red-200 bg-red-50 text-red-800",
          )}
        >
          {props.feedback.message}
        </div>
      ) : null}

      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <TransferQueue
          loading={props.requests === undefined}
          requests={transferRequests}
          requestedTotal={requestedTransferTotal}
          outstandingTotal={props.pendingTransferTotal}
          busyKey={props.busyKey}
          onComplete={props.onComplete}
        />
      </Suspense>

      <div className="space-y-2 pt-2">
        <h3 className="text-lg font-bold">All allocation requests</h3>
        <div
          className="flex flex-wrap gap-2"
          aria-label="Filter payout requests"
        >
          {filters.map((filter) => (
            <Button
              key={filter.value}
              size="sm"
              variant={props.filter === filter.value ? "default" : "outline"}
              onClick={() => props.onFilterChange(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {props.requests === undefined ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : props.visibleRequests.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <CheckCircle2
            className="h-10 w-10 text-golf-600"
            aria-hidden="true"
          />
          <p className="mt-3 font-semibold">No requests in this view</p>
        </div>
      ) : (
        <div className="divide-y">
          {props.visibleRequests.map((request) => (
            <article key={request._id} className="py-5 first:pt-2">
              <header className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-semibold">
                      {request.memberName}
                    </h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {request.seasonLabel}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-bold",
                      request.status === "pending" &&
                        "bg-amber-100 text-amber-900",
                      request.status === "in_progress" &&
                        "bg-blue-100 text-blue-800",
                      request.status === "completed" &&
                        "bg-green-100 text-green-800",
                      request.status === "cancelled" &&
                        "bg-red-100 text-red-800",
                    )}
                  >
                    {settlementStatusLabel(request.status)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {new Intl.DateTimeFormat("en-CA", {
                      dateStyle: "medium",
                    }).format(request.submittedAt)}
                  </span>
                  <span>
                    Official {formatMoney(request.earningsCents, true)}
                  </span>
                  {request.accountOffsetCents > 0 ? (
                    <span>
                      {formatMoney(request.accountOffsetCents, true)} to balance
                    </span>
                  ) : null}
                </div>
              </header>
              <div className="space-y-2">
                {request.transferCents > 0 ? (
                  <div className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="font-semibold">E-transfer</span>
                    <span className="text-right text-muted-foreground">
                      {formatMoney(request.transferCents, true)} ·{" "}
                      {request.transferCompletedAt ? "Paid" : "Use queue above"}
                    </span>
                  </div>
                ) : null}
                <SettlementChecklistItem
                  requestId={request._id}
                  item="charity"
                  label="Record charity donation"
                  amountCents={request.charityCents}
                  completedAt={request.charityCompletedAt}
                  disabled={
                    request.status === "cancelled" ||
                    request.status === "completed"
                  }
                  busy={props.busyKey === `${request._id}:charity`}
                  onComplete={props.onComplete}
                />
                <SettlementChecklistItem
                  requestId={request._id}
                  item="league"
                  label="Record league donation"
                  amountCents={request.leagueCents}
                  completedAt={request.leagueCompletedAt}
                  disabled={
                    request.status === "cancelled" ||
                    request.status === "completed"
                  }
                  busy={props.busyKey === `${request._id}:league`}
                  onComplete={props.onComplete}
                />
                <SettlementChecklistItem
                  requestId={request._id}
                  item="nextSeasonCard"
                  label="Reserve next-season card credit"
                  amountCents={request.nextSeasonCardCents}
                  completedAt={request.nextSeasonCardCompletedAt}
                  disabled={
                    request.status === "cancelled" ||
                    request.status === "completed"
                  }
                  busy={props.busyKey === `${request._id}:nextSeasonCard`}
                  onComplete={props.onComplete}
                />
                {(request.retainedCents ?? 0) > 0 ? (
                  <div className="bg-golf-50/60 px-3 py-2">
                    <p className="text-sm font-semibold">
                      Left in member account
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatMoney(request.retainedCents ?? 0, true)} · no admin
                      action needed
                    </p>
                  </div>
                ) : null}

                {request.status === "pending" ? (
                  <div className="border-t pt-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-700 hover:bg-red-50 hover:text-red-800"
                      onClick={() => props.onCancel(request._id)}
                      disabled={props.busyKey !== null}
                    >
                      <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                      Cancel request
                    </Button>
                  </div>
                ) : null}
                {request.cancellationReason ? (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
                    Cancelled: {request.cancellationReason}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CreditWinningsButton(props: AdminSettlementHubProps) {
  return (
    <Button
      className="w-full"
      variant="outline"
      onClick={props.onCreditWinnings}
      disabled={props.creditingWinnings}
    >
      {props.creditingWinnings ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <WalletCards className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      {props.creditingWinnings
        ? "Crediting winnings…"
        : "Credit season winnings"}
    </Button>
  );
}

function SettlementChecklistItem(props: SettlementChecklistItemProps) {
  if (props.amountCents === 0) return null;
  const complete = props.completedAt !== undefined;
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2",
        complete && "bg-green-50/60 px-3",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          complete
            ? "bg-green-600 text-white"
            : "bg-muted text-muted-foreground",
        )}
      >
        {props.busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : complete ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Circle className="h-4 w-4" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{props.label}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {formatMoney(props.amountCents, true)}
          {props.detail ? (
            <span className="ml-2 inline-flex items-center gap-1">
              <Mail className="h-3 w-3" aria-hidden="true" />
              {props.detail}
            </span>
          ) : null}
        </p>
      </div>
      <Button
        size="sm"
        variant={complete ? "ghost" : "outline"}
        disabled={props.disabled || props.busy || complete}
        onClick={() => props.onComplete(props.requestId, props.item)}
      >
        {complete ? "Done" : "Check off"}
      </Button>
    </div>
  );
}
