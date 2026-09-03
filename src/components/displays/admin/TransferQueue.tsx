import { Check, CheckCircle2, Loader2, Mail } from "lucide-react";

import type { AdminSettlementHubProps } from "@/types";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/ui";
import { formatMoney } from "@/utils/app";
import { cn } from "@/utils/classNames";

export function TransferQueue(props: {
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
