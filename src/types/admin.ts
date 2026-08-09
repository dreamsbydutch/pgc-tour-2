import type { FunctionReturnType } from "convex/server";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { api } from "convex/_generated/api";

export type AdminDashboardDto = FunctionReturnType<
  typeof api.functions.readModels.adminGetDashboard
>;

export type StandingsBackfillResult = FunctionReturnType<
  typeof api.functions.standings.adminBackfillSeason
>;

export type TeamMetadataBackfillResult = FunctionReturnType<
  typeof api.functions.migrations.adminBackfillTeamMetadata
>;

export type AdminOperationKey =
  | "createGroups"
  | "liveSync"
  | "liveSyncForce"
  | "updateWorldRank"
  | "weeklyRecapTest"
  | "weeklyRecapSendAll"
  | "createPayment"
  | "recomputeStandings"
  | "backfillStandings"
  | "backfillTeamMetadata"
  | "repairTournament"
  | "importTeams";

export type AdminOperationRun = {
  status: "running" | "succeeded" | "skipped" | "failed" | "abandoned";
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  changedRows?: number;
  skipReason?: string;
  error?: string;
  result?: string;
};

export type AdminOperationStatus = {
  isBusy: boolean;
  statusLabel: string;
  lastRunLabel: string;
  result?: string;
  tone: "idle" | "running" | "success" | "error";
};

export type AdminPreviewLine = {
  label: string;
  value: string;
};

export type AdminDryRunPreview = {
  title: string;
  description: string;
  lines: AdminPreviewLine[];
  warnings: string[];
  canRun: boolean;
};

export type AdminConfirmationRequest = {
  operation: Extract<
    AdminOperationKey,
    "weeklyRecapSendAll" | "createPayment" | "repairTournament" | "importTeams"
  >;
  title: string;
  description: string;
  confirmLabel: string;
  preview: AdminDryRunPreview;
};

export type AdminOperationCardProps = {
  id?: string;
  category: string;
  title: string;
  description: string;
  whenToUse: string;
  icon: LucideIcon;
  status: AdminOperationStatus;
  children: ReactNode;
  tone?: "routine" | "communication" | "financial" | "advanced";
};

export type AdminOperationFeedbackProps = {
  status: AdminOperationStatus;
  label?: string;
};

export type AdminDryRunPreviewProps = {
  preview: AdminDryRunPreview;
};

export type AdminConfirmationDialogProps = {
  request: AdminConfirmationRequest | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export type AdminOperationGroupProps = {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export type AdminBusyIconProps = {
  busy: boolean;
};

export type AdminTaskShortcutProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  detail: string;
};

export type AdminTaskKey =
  | "eventSetup"
  | "liveScoring"
  | "weeklyRecap"
  | "memberPayment"
  | "settlements"
  | "standings"
  | "teamMetadata"
  | "repairTournament"
  | "importTeams";

export type AdminHubStageTone =
  | "neutral"
  | "upcoming"
  | "open"
  | "live"
  | "complete";

export type AdminHubOverview = {
  eventName: string;
  eventMeta: string;
  stageLabel: string;
  stageTone: AdminHubStageTone;
  readinessLabel: string;
  readinessDetail: string;
  recommendation: {
    task: AdminTaskKey | null;
    eyebrow: string;
    title: string;
    detail: string;
    actionLabel: string | null;
  };
};

export type BuildAdminHubOverviewArgs = {
  now: number;
  appState?: Partial<AdminDashboardDto["appState"]>;
  focusTournament?: AdminDashboardDto["focusTournament"];
  recentLiveSync?: AdminOperationRun;
  pendingSettlementCount: number;
};

export type AdminHubProps = {
  overview: AdminHubOverview;
  operationStatus: Record<AdminOperationKey, AdminOperationStatus>;
  groupStatus: {
    eventSetup: AdminOperationStatus;
    liveSync: AdminOperationStatus;
    weeklyRecap: AdminOperationStatus;
    standings: AdminOperationStatus;
  };
  pendingSettlementCount: number;
  pendingTransferTotal: number;
  onOpenTask: (task: AdminTaskKey) => void;
};

export type AdminTaskPanelProps = {
  open: boolean;
  title: string;
  description: string;
  tone?: "routine" | "communication" | "financial" | "advanced";
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
};

export type AdminHubTaskRowProps = {
  task: AdminTaskKey;
  title: string;
  description: string;
  status?: AdminOperationStatus;
  meta?: string;
  onOpenTask: (task: AdminTaskKey) => void;
};

export type AdminStageBadgeProps = {
  label: string;
  tone: AdminHubStageTone;
};

export type AdminQuickActionProps = Pick<
  AdminHubTaskRowProps,
  "task" | "onOpenTask"
> & {
  label: string;
};

export type AdminToolGroupProps = {
  title: string;
  icon: LucideIcon;
  tone?: "routine" | "advanced";
  children: ReactNode;
};

export type AdminActivityLineProps = {
  label: string;
  status: AdminOperationStatus;
};

export type AdminOperationStatusBadgeProps = {
  status: AdminOperationStatus;
};

export type AdminImportRow = Record<string, unknown>;

export type AdminImportPreviewArgs = {
  teamsJson: string;
  tournamentId: string;
  tournamentName?: string;
};

export type AdminPaymentPreviewArgs = {
  memberName?: string;
  seasonName?: string;
  currentBalanceCents?: number;
  amountDollars: string;
};

export type AdminRepairPreviewArgs = {
  tournamentName?: string;
  tournamentStatus?: string;
  tournamentStartDate?: number;
};

export type AdminBulkEmailPreviewArgs = {
  tournamentName?: string;
  recipientCount?: number;
  customBlurb: string;
};
