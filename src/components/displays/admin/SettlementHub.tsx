import {
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  Mail,
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
  return (
    <section
      id={props.embedded ? undefined : "payout-requests"}
      className="scroll-mt-20 space-y-4"
      aria-label={props.embedded ? "Payout requests" : undefined}
      aria-labelledby={props.embedded ? undefined : "payout-requests-title"}
    >
      {props.embedded ? (
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
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-white px-4 py-3">
                <p className="text-xs text-muted-foreground">Open requests</p>
                <p className="mt-1 text-xl font-bold">{props.pendingCount}</p>
              </div>
              <div className="rounded-xl border bg-white px-4 py-3">
                <p className="text-xs text-muted-foreground">E-transfers due</p>
                <p className="mt-1 text-xl font-bold">
                  {formatMoney(props.pendingTransferTotal, true)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2" aria-label="Filter payout requests">
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
                <SettlementChecklistItem
                  requestId={request._id}
                  item="transfer"
                  label="Send e-transfer"
                  amountCents={request.transferCents}
                  detail={request.payoutEmail}
                  completedAt={request.transferCompletedAt}
                  disabled={
                    request.status === "cancelled" ||
                    request.status === "completed"
                  }
                  busy={props.busyKey === `${request._id}:transfer`}
                  onComplete={props.onComplete}
                />
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
