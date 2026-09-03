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

import type {
  AdminSettlementHubProps,
  SettlementAdminFilter,
  SettlementChecklistItemProps,
} from "@/types";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/ui";
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
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted-foreground">Open requests</p>
              <p className="mt-1 text-xl font-bold">{props.pendingCount}</p>
            </div>
            <div className="rounded-xl border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted-foreground">E-transfers due</p>
              <p className="mt-1 text-xl font-bold">
                {formatMoney(props.pendingTransferTotal, true)}
              </p>
            </div>
          </div>
          <CreditWinningsButton {...props} />
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
                Financial operations
              </p>
              <h2
                id="payout-requests-title"
                className="mt-1 text-2xl font-bold"
              >
                Payout request hub
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Work through each real-world transfer or allocation, then check
                it off. The request closes automatically when every item is
                complete.
              </p>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-white px-4 py-3">
                  <p className="text-xs text-muted-foreground">Open requests</p>
                  <p className="mt-1 text-xl font-bold">{props.pendingCount}</p>
                </div>
                <div className="rounded-xl border bg-white px-4 py-3">
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

      <TransferQueue
        loading={props.requests === undefined}
        requests={transferRequests}
        requestedTotal={requestedTransferTotal}
        outstandingTotal={props.pendingTransferTotal}
        busyKey={props.busyKey}
        onComplete={props.onComplete}
      />

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
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle2
              className="h-10 w-10 text-golf-600"
              aria-hidden="true"
            />
            <p className="mt-3 font-semibold">No requests in this view</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The payout queue is clear.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {props.visibleRequests.map((request) => (
            <Card key={request._id} className="overflow-hidden">
              <CardHeader className="border-b bg-muted/30 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">
                      {request.memberName}
                    </CardTitle>
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
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                {request.transferCents > 0 ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
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
                  <div className="rounded-lg border border-golf-200 bg-golf-50/60 p-3">
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function TransferQueue(props: {
  loading: boolean;
  requests: AdminSettlementHubProps["visibleRequests"];
  requestedTotal: number;
  outstandingTotal: number;
  busyKey: string | null;
  onComplete: AdminSettlementHubProps["onComplete"];
}) {
  return (
    <Card className="overflow-hidden border-amber-200 shadow-none">
      <CardHeader className="border-b border-amber-200 bg-amber-50 p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">
              Payment queue
            </p>
            <CardTitle className="mt-1 text-xl">
              Requested e-transfers
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Send each transfer to the requested email, then mark it paid.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-64">
            <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="mt-0.5 font-bold text-amber-900">
                {formatMoney(props.outstandingTotal, true)}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
              <p className="text-xs text-muted-foreground">Total requested</p>
              <p className="mt-0.5 font-bold">
                {formatMoney(props.requestedTotal, true)}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {props.loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : props.requests.length === 0 ? (
          <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
            <CheckCircle2
              className="h-5 w-5 text-golf-600"
              aria-hidden="true"
            />
            No e-transfers have been requested.
          </div>
        ) : (
          <div className="divide-y">
            {props.requests.map((request) => {
              const paid = request.transferCompletedAt !== undefined;
              const busy = props.busyKey === `${request._id}:transfer`;
              return (
                <div
                  key={request._id}
                  className={cn(
                    "grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center",
                    paid && "bg-muted/30",
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{request.memberName}</p>
                    <p className="mt-1 flex items-center gap-1.5 break-all text-sm text-muted-foreground">
                      <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="select-all">
                        {request.payoutEmail ?? "Email unavailable"}
                      </span>
                    </p>
                  </div>
                  <p className="text-xl font-bold tabular-nums sm:text-right">
                    {formatMoney(request.transferCents, true)}
                  </p>
                  <Button
                    size="sm"
                    variant={paid ? "ghost" : "default"}
                    disabled={paid || busy}
                    onClick={() => props.onComplete(request._id, "transfer")}
                  >
                    {busy ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : paid ? (
                      <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                    ) : null}
                    {busy ? "Saving…" : paid ? "Paid" : "Mark paid"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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
        "flex items-center gap-3 rounded-lg border p-3",
        complete && "border-green-200 bg-green-50/60",
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
