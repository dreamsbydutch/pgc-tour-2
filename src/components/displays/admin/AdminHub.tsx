import {
  Activity,
  BarChart3,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Database,
  HardDriveDownload,
  Mail,
  Radio,
  RotateCcw,
  ShieldCheck,
  WalletCards,
  Wrench,
} from "lucide-react";

import type {
  AdminActivityLineProps,
  AdminHubProps,
  AdminHubTaskRowProps,
  AdminQuickActionProps,
  AdminStageBadgeProps,
  AdminTaskKey,
  AdminToolGroupProps,
} from "@/types";
import { Button } from "@/ui";
import { formatMoney } from "@/utils/app";
import { cn } from "@/utils/classNames";

const taskIcons: Record<AdminTaskKey, typeof Activity> = {
  eventSetup: CalendarCheck2,
  liveScoring: Radio,
  weeklyRecap: Mail,
  memberPayment: WalletCards,
  settlements: CircleDollarSign,
  standings: BarChart3,
  teamMetadata: Database,
  repairTournament: RotateCcw,
  importTeams: HardDriveDownload,
};

export function AdminHub(props: AdminHubProps) {
  const recommendation = props.overview.recommendation;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl bg-golf-900 text-white shadow-sm">
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-golf-100">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-[0.18em]">
                Admin hub
              </span>
            </div>
            <StageBadge
              label={props.overview.stageLabel}
              tone={props.overview.stageTone}
            />
          </div>
          <h1 className="mt-4 text-2xl font-bold leading-tight sm:text-3xl">
            {props.overview.eventName}
          </h1>
          <p className="mt-1 text-sm text-golf-100">
            {props.overview.eventMeta}
          </p>
          <div className="mt-4 rounded-xl border border-white/15 bg-white/10 px-4 py-3">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0 text-golf-200"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold">
                  {props.overview.readinessLabel}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-golf-100">
                  {props.overview.readinessDetail}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section
        className="rounded-2xl border bg-background p-5 shadow-sm"
        aria-labelledby="admin-next-action"
      >
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-golf-700">
          {recommendation.eyebrow}
        </p>
        <h2 id="admin-next-action" className="mt-1 text-xl font-bold">
          {recommendation.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {recommendation.detail}
        </p>
        {recommendation.task && recommendation.actionLabel ? (
          <Button
            className="mt-4 min-h-11 w-full sm:w-auto"
            onClick={() => props.onOpenTask(recommendation.task!)}
          >
            {recommendation.actionLabel}
            <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </section>

      <section aria-labelledby="admin-quick-actions">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-golf-700">
              Start here
            </p>
            <h2 id="admin-quick-actions" className="mt-1 text-xl font-bold">
              Quick actions
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <QuickAction
            task="eventSetup"
            label="Event setup"
            onOpenTask={props.onOpenTask}
          />
          <QuickAction
            task="liveScoring"
            label="Live scoring"
            onOpenTask={props.onOpenTask}
          />
          <QuickAction
            task="weeklyRecap"
            label="Email members"
            onOpenTask={props.onOpenTask}
          />
          <QuickAction
            task="memberPayment"
            label="Record payment"
            onOpenTask={props.onOpenTask}
          />
        </div>
      </section>

      {props.pendingSettlementCount > 0 ? (
        <button
          type="button"
          className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => props.onOpenTask("settlements")}
        >
          <span className="rounded-lg bg-amber-100 p-2 text-amber-900">
            <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Payout requests</span>
            <span className="mt-0.5 block text-xs text-amber-900">
              {props.pendingSettlementCount} open ·{" "}
              {formatMoney(props.pendingTransferTotal, true)} in transfers due
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-amber-800" aria-hidden="true" />
        </button>
      ) : null}

      <section aria-labelledby="admin-all-tools" className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-golf-700">
            Everything else
          </p>
          <h2 id="admin-all-tools" className="mt-1 text-xl font-bold">
            All admin tools
          </h2>
        </div>

        <ToolGroup title="Tournament week" icon={CalendarCheck2}>
          <TaskRow
            task="eventSetup"
            title="Prepare tournament"
            description="World rankings and golfer groups"
            status={props.groupStatus.eventSetup}
            onOpenTask={props.onOpenTask}
          />
          <TaskRow
            task="liveScoring"
            title="Update live scoring"
            description="Normal sync and recovery sync"
            status={props.groupStatus.liveSync}
            onOpenTask={props.onOpenTask}
          />
          <TaskRow
            task="weeklyRecap"
            title="Send weekly recap"
            description="Test and bulk member email"
            status={props.groupStatus.weeklyRecap}
            onOpenTask={props.onOpenTask}
          />
        </ToolGroup>

        <ToolGroup title="Members & money" icon={WalletCards}>
          <TaskRow
            task="memberPayment"
            title="Record member payment"
            description="Add a completed payment to a balance"
            status={props.operationStatus.createPayment}
            onOpenTask={props.onOpenTask}
          />
          <TaskRow
            task="settlements"
            title="Process payout requests"
            description="Transfers, donations, and card credits"
            meta={`${props.pendingSettlementCount} open`}
            onOpenTask={props.onOpenTask}
          />
        </ToolGroup>

        <ToolGroup title="Fix a problem" icon={Wrench} tone="advanced">
          <TaskRow
            task="standings"
            title="Repair standings"
            description="Recalculate or rebuild a season"
            status={props.groupStatus.standings}
            onOpenTask={props.onOpenTask}
          />
          <TaskRow
            task="teamMetadata"
            title="Repair team metadata"
            description="Restore leaderboard lookup fields"
            status={props.operationStatus.backfillTeamMetadata}
            onOpenTask={props.onOpenTask}
          />
          <TaskRow
            task="repairTournament"
            title="Repair one tournament"
            description="Resync scores, awards, and standings"
            status={props.operationStatus.repairTournament}
            onOpenTask={props.onOpenTask}
          />
          <TaskRow
            task="importTeams"
            title="Import teams from JSON"
            description="Expert recovery tool"
            status={props.operationStatus.importTeams}
            onOpenTask={props.onOpenTask}
          />
        </ToolGroup>
      </section>

      <details className="group rounded-xl border bg-muted/20">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold marker:content-none">
          Recent job activity
          <ChevronRight
            className="h-4 w-4 transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
        </summary>
        <div className="grid gap-2 border-t p-3 sm:grid-cols-2">
          <ActivityLine
            label="Rankings"
            status={props.operationStatus.updateWorldRank}
          />
          <ActivityLine
            label="Groups"
            status={props.operationStatus.createGroups}
          />
          <ActivityLine
            label="Live sync"
            status={props.operationStatus.liveSync}
          />
          <ActivityLine
            label="Tournament repair"
            status={props.operationStatus.repairTournament}
          />
        </div>
      </details>
    </div>
  );
}

function StageBadge({ label, tone }: AdminStageBadgeProps) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-bold",
        tone === "neutral" && "border-white/20 bg-white/10 text-white",
        tone === "upcoming" && "border-blue-200 bg-blue-100 text-blue-900",
        tone === "open" && "border-amber-200 bg-amber-100 text-amber-900",
        tone === "live" && "border-red-200 bg-red-100 text-red-800",
        tone === "complete" && "border-golf-200 bg-golf-100 text-golf-900",
      )}
    >
      {label}
    </span>
  );
}

function QuickAction({ task, label, onOpenTask }: AdminQuickActionProps) {
  const Icon = taskIcons[task];
  return (
    <button
      type="button"
      className="flex min-h-28 flex-col items-start justify-between rounded-xl border bg-background p-4 text-left shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onOpenTask(task)}
    >
      <span className="rounded-lg bg-golf-100 p-2.5 text-golf-800">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-sm font-bold leading-5">{label}</span>
    </button>
  );
}

function ToolGroup({
  title,
  icon: Icon,
  tone = "routine",
  children,
}: AdminToolGroupProps) {
  return (
    <details
      className={cn(
        "group overflow-hidden rounded-xl border bg-background",
        tone === "advanced" && "border-red-200",
      )}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span
          className={cn(
            "rounded-lg p-2",
            tone === "advanced"
              ? "bg-red-100 text-red-800"
              : "bg-muted text-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="flex-1 text-left text-sm font-bold">{title}</span>
        <ChevronRight
          className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
      </summary>
      <div className="divide-y border-t">{children}</div>
    </details>
  );
}

function TaskRow({
  task,
  title,
  description,
  status,
  meta,
  onOpenTask,
}: AdminHubTaskRowProps) {
  const Icon = taskIcons[task];
  return (
    <button
      type="button"
      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      onClick={() => onOpenTask(task)}
    >
      <Icon
        className="h-5 w-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {meta ? (
          <span className="block text-xs font-semibold text-muted-foreground">
            {meta}
          </span>
        ) : status ? (
          <span
            className={cn(
              "block h-2.5 w-2.5 rounded-full",
              status.tone === "idle" && "bg-gray-300",
              status.tone === "running" && "animate-pulse bg-blue-500",
              status.tone === "success" && "bg-golf-500",
              status.tone === "error" && "bg-red-500",
            )}
            title={status.statusLabel}
          />
        ) : null}
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

function ActivityLine({ label, status }: AdminActivityLineProps) {
  return (
    <div className="rounded-lg bg-background px-3 py-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span
          className={cn(
            "font-medium",
            status.tone === "error" ? "text-red-700" : "text-muted-foreground",
          )}
        >
          {status.statusLabel}
        </span>
      </div>
      <p className="mt-1 text-muted-foreground">{status.lastRunLabel}</p>
    </div>
  );
}
