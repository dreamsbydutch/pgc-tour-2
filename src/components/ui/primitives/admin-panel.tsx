import { Shield, Settings, Database, Timer } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../primitives/card";
import { Button } from "../primitives/button";
import { Skeleton } from "../primitives/skeleton";
import type { AdminDashboardView, AdminPanelProps } from "@/lib/types.ts";

/**
 * AdminPanel
 *
 * Renders a simple, admin-only shortcuts card for navigating to management screens.
 *
 * Data sources:
 * - None. This component does not fetch data. It expects upstream auth/role gating (e.g. the route)
 *   to decide whether this should be rendered.
 *
 * Major render states:
 * - `loading`: renders `AdminPanelSkeleton`.
 * - Default: renders a grid of shortcut buttons.
 *
 * Navigation:
 * - Uses `onViewChange(view)` to switch tools within the single `/admin` URL.
 * - Items without a `view` are rendered as disabled placeholders.
 *
 * @param props - Component props.
 * @param props.loading - Whether to render the loading skeleton (default: `false`).
 * @returns A card containing admin shortcut buttons.
 *
 * @example
 * <AdminPanel />
 *
 * @example
 * <AdminPanel loading />
 */
export function AdminPanel({
  loading = false,
  activeView,
  onViewChange,
}: AdminPanelProps) {
  const { items } = useAdminPanel();
  if (loading) {
    return <AdminPanelSkeleton />;
  }

  return (
    <Card className="border-red-200 bg-red-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-red-600" />
          Admin Panel
        </CardTitle>
        <CardDescription>
          Administrator controls and system management
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const isActive =
              item.view !== undefined && item.view === activeView;

            return (
              <Button
                key={item.label}
                variant={isActive ? "default" : "outline"}
                className="justify-start"
                size="sm"
                disabled={!item.view || !onViewChange}
                onClick={() => {
                  if (item.view && onViewChange) {
                    onViewChange(item.view);
                  }
                }}
              >
                <item.Icon className="mr-2 h-4 w-4" />
                {item.label}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Provides the list of admin shortcut items rendered by `AdminPanel`.
 */
function useAdminPanel() {
  const items = [
    { label: "System Settings", view: undefined, Icon: Settings },
    {
      label: "League Setup",
      view: "leagueSetup" as AdminDashboardView,
      Icon: Database,
    },
    {
      label: "Missing Tour Cards",
      view: "missingTourCards" as AdminDashboardView,
      Icon: Database,
    },
    {
      label: "Tournaments",
      view: "tournaments" as AdminDashboardView,
      Icon: Database,
    },
    {
      label: "Tour Cards",
      view: "tourCards" as AdminDashboardView,
      Icon: Database,
    },
    { label: "Seasons", view: "seasons" as AdminDashboardView, Icon: Database },
    { label: "Teams", view: "teams" as AdminDashboardView, Icon: Database },
    {
      label: "Manage Golfers",
      view: "golfers" as AdminDashboardView,
      Icon: Database,
    },
    {
      label: "Member Merge",
      view: "memberMerge" as AdminDashboardView,
      Icon: Database,
    },
    {
      label: "Account Audit",
      view: "accountAudit" as AdminDashboardView,
      Icon: Database,
    },
    { label: "Crons", view: "crons" as AdminDashboardView, Icon: Timer },
    { label: "View Audit Logs", view: undefined, Icon: Shield },
  ] as const;

  return { items };
}

/**
 * Loading state for `AdminPanel`.
 */
function AdminPanelSkeleton() {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-28" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-4 w-64" />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
