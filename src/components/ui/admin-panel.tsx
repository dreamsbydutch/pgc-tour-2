import { Shield, Settings, Database, Timer } from "lucide-react";
import { Link } from "@tanstack/react-router";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card";
import { Button } from "./button";
import { Skeleton } from "./skeleton";
import type { AdminPanelProps } from "@/lib/types";

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
 * - Uses TanStack Router `Link` for route navigation.
 * - Some items are intentionally rendered as disabled placeholders until routes exist.
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
export function AdminPanel({ loading = false }: AdminPanelProps) {
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
            if (item.to) {
              return (
                <Button
                  key={item.label}
                  asChild
                  variant="outline"
                  className="justify-start"
                  size="sm"
                >
                  <Link to={item.to}>
                    <item.Icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
              );
            }

            return (
              <Button
                key={item.label}
                variant="outline"
                className="justify-start"
                size="sm"
                disabled
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
    { label: "System Settings", to: undefined, Icon: Settings },
    {
      label: "Tournaments",
      to: "/admin/tournaments",
      Icon: Database,
    },
    {
      label: "League Setup",
      to: "/admin/setup",
      Icon: Database,
    },
    {
      label: "Account Audit",
      to: undefined,
      Icon: Database,
    },
    {
      label: "Seasons",
      to: "/admin/seasons",
      Icon: Database,
    },
    {
      label: "Teams",
      to: "/admin/teams",
      Icon: Database,
    },
    {
      label: "Manage Golfers",
      to: "/admin/golfers",
      Icon: Database,
    },
    {
      label: "Crons",
      to: "/admin/crons",
      Icon: Timer,
    },
    { label: "View Audit Logs", to: undefined, Icon: Shield },
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
