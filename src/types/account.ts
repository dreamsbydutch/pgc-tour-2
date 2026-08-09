import type { FunctionReturnType } from "convex/server";
import type { api } from "convex/_generated/api";
import type { Id } from "@/convex";

export type AccountOverviewDto = FunctionReturnType<
  typeof api.functions.account.getMyOverview
>;
export type AccountAchievement = AccountOverviewDto["achievements"][number];
export type AccountTourCard = AccountOverviewDto["tourCards"][number];
export type AccountSeasonFinancial =
  AccountOverviewDto["seasonFinancials"][number];

export type AdminSettlementRequestsDto = FunctionReturnType<
  typeof api.functions.settlements.adminListRequests
>;
export type AdminSettlementRequest = AdminSettlementRequestsDto[number];
export type SettlementItemKind =
  | "transfer"
  | "charity"
  | "league"
  | "nextSeasonCard";
export type SettlementRequestStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";
export type SettlementAdminFilter = "open" | SettlementRequestStatus | "all";

export type AccountStatProps = {
  label: string;
  value: string | number;
  detail?: string;
};

export type SettlementAllocationInputProps = {
  id: string;
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
};

export type FinancialSummaryProps = AccountStatProps;

export type SettlementFeedback = {
  tone: "success" | "error";
  message: string;
};

export type AdminSettlementHubProps = {
  embedded?: boolean;
  requests: AdminSettlementRequest[] | undefined;
  visibleRequests: AdminSettlementRequest[];
  filter: SettlementAdminFilter;
  onFilterChange: (filter: SettlementAdminFilter) => void;
  pendingCount: number;
  pendingTransferTotal: number;
  busyKey: string | null;
  feedback: SettlementFeedback | null;
  onComplete: (
    requestId: Id<"settlementRequests">,
    item: SettlementItemKind,
  ) => void;
  onCancel: (requestId: Id<"settlementRequests">) => void;
};

export type SettlementChecklistItemProps = {
  requestId: Id<"settlementRequests">;
  item: SettlementItemKind;
  label: string;
  amountCents: number;
  detail?: string;
  completedAt?: number;
  disabled: boolean;
  busy: boolean;
  onComplete: AdminSettlementHubProps["onComplete"];
};
