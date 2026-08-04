import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  XCircle,
} from "lucide-react";

import type {
  AdminConfirmationDialogProps,
  AdminDryRunPreviewProps,
  AdminOperationCardProps,
  AdminOperationFeedbackProps,
  AdminOperationStatusBadgeProps,
} from "@/types";
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
} from "@/ui";
import { cn } from "@/utils/classNames";

export function AdminOperationCard({
  id,
  category,
  title,
  description,
  whenToUse,
  icon: Icon,
  status,
  children,
  tone = "routine",
}: AdminOperationCardProps) {
  return (
    <Card
      id={id}
      className={cn(
        "scroll-mt-20 overflow-hidden border-l-4 shadow-none",
        tone === "routine" && "border-l-golf-600",
        tone === "communication" && "border-l-violet-500",
        tone === "financial" && "border-l-amber-500",
        tone === "advanced" && "border-l-red-500",
      )}
    >
      <CardHeader className="space-y-3 p-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider",
              tone === "routine" && "bg-golf-100 text-golf-800",
              tone === "communication" && "bg-violet-100 text-violet-800",
              tone === "financial" && "bg-amber-100 text-amber-900",
              tone === "advanced" && "bg-red-100 text-red-800",
            )}
          >
            {category}
          </span>
          <OperationStatusBadge status={status} />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "mt-0.5 rounded-lg p-2.5",
                tone === "routine" && "bg-golf-100 text-golf-800",
                tone === "communication" && "bg-violet-100 text-violet-800",
                tone === "financial" && "bg-amber-100 text-amber-900",
                tone === "advanced" && "bg-red-100 text-red-800",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-lg leading-6">{title}</CardTitle>
              <CardDescription className="mt-1 leading-5">
                {description}
              </CardDescription>
            </div>
          </div>
        </div>
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-sm leading-5",
            tone === "advanced"
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-border bg-muted/60 text-foreground",
          )}
        >
          <span className="font-semibold">Use this when: </span>
          {whenToUse}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">{children}</CardContent>
    </Card>
  );
}

export function AdminOperationFeedback({
  status,
  label,
}: AdminOperationFeedbackProps) {
  return (
    <div
      className="rounded-md border bg-background/80 px-3 py-2.5"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
        <span>
          {label ? `${label} last run` : "Last run"}: {status.lastRunLabel}
        </span>
      </div>
      {status.result ? (
        <details className="mt-2 border-t pt-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            View technical result
          </summary>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-5 text-foreground">
            {status.result}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

export function AdminDryRunPreview({ preview }: AdminDryRunPreviewProps) {
  return (
    <div className="rounded-md border border-dashed bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Circle className="h-3.5 w-3.5 fill-golf-500 text-golf-500" />
          {preview.title}
        </div>
        <span className="rounded-full bg-golf-100 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-golf-800">
          Preview only — nothing changed
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {preview.description}
      </p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {preview.lines.map((line) => (
          <div key={line.label} className="rounded bg-background px-2.5 py-2">
            <dt className="text-muted-foreground">{line.label}</dt>
            <dd className="mt-0.5 break-words font-medium text-foreground">
              {line.value}
            </dd>
          </div>
        ))}
      </dl>
      {preview.warnings.length > 0 ? (
        <div className="mt-3 space-y-1.5" role="alert">
          {preview.warnings.map((warning) => (
            <p
              key={warning}
              className="flex items-start gap-2 text-xs leading-5 text-amber-800"
            >
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminConfirmationDialog({
  request,
  busy,
  onCancel,
  onConfirm,
}: AdminConfirmationDialogProps) {
  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(open) => !open && onCancel()}
    >
      <DialogContent className="max-w-lg">
        {request ? (
          <>
            <DialogHeader>
              <DialogTitle>{request.title}</DialogTitle>
              <DialogDescription>{request.description}</DialogDescription>
            </DialogHeader>
            <div className="px-6 py-3">
              <AdminDryRunPreview preview={request.preview} />
              <p className="mt-4 flex items-start gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                This operation changes production data or contacts other people.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={onConfirm}
                disabled={busy || !request.preview.canRun}
              >
                {busy ? (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {busy ? "Working…" : request.confirmLabel}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function OperationStatusBadge({ status }: AdminOperationStatusBadgeProps) {
  const Icon =
    status.tone === "running"
      ? Loader2
      : status.tone === "success"
        ? CheckCircle2
        : status.tone === "error"
          ? XCircle
          : Circle;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium",
        status.tone === "idle" && "bg-muted text-muted-foreground",
        status.tone === "running" && "border-blue-200 bg-blue-50 text-blue-700",
        status.tone === "success" && "border-golf-200 bg-golf-50 text-golf-800",
        status.tone === "error" && "border-red-200 bg-red-50 text-red-700",
      )}
    >
      <Icon
        className={cn("h-3 w-3", status.tone === "running" && "animate-spin")}
        aria-hidden="true"
      />
      {status.statusLabel}
    </span>
  );
}
