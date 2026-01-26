import type { AdminDashboardView } from "@/lib/types";

import { SecondaryToolbar } from "@/displays";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/ui";

import { AdminCronsPage } from "./AdminCronsPage";
import { AdminGolfersPage } from "./AdminGolfersPage";
import { AdminMemberMergePage } from "./AdminMemberMergePage";
import { AdminSeasonsPage } from "./AdminSeasonsPage";
import { AdminSetupPage } from "./AdminSetupPage";
import { AdminTeamsPage } from "./AdminTeamsPage";
import { AdminTourCardsPage } from "./AdminTourCardsPage";
import { AdminTournamentsPage } from "./AdminTournamentsPage";
import { MemberAccountAuditPage } from "./MemberAccountAuditPage";
import { MissingTourCardsSection } from "@/facilitators";

/**
 * AdminDashboardPage
 *
 * Single-URL admin dashboard rendered at `/admin`.
 *
 * Behavior:
 * - Always shows an Admin Panel for navigation.
 * - Renders the selected admin tool inside the same URL via the `view` search param.
 *
 * Data sources:
 * - This component does not fetch data directly.
 * - Child tool views (setup, tournaments, etc.) may fetch their own data.
 *
 * @param props.view Selected view key.
 * @param props.onViewChange Callback for switching views (updates the route search params).
 * @returns Admin dashboard UI.
 */
export function AdminDashboardPage(props: {
  view: AdminDashboardView;
  onViewChange: (view: AdminDashboardView) => void;
}) {
  const items = useAdminSecondaryToolbarItems();

  return (
    <div className="container mx-auto px-4 py-8 pb-32 lg:pb-10 lg:pt-20">
      <div className="mx-auto max-w-7xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>

        <div className="min-w-0">
          {props.view === "dashboard" ? (
            <Card>
              <CardHeader>
                <CardTitle>Select an admin tool</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Use the toolbar to open a tool.
              </CardContent>
            </Card>
          ) : null}

          {props.view === "leagueSetup" ? <AdminSetupPage /> : null}
          {props.view === "missingTourCards" ? (
            <MissingTourCardsSection />
          ) : null}
          {props.view === "tournaments" ? <AdminTournamentsPage /> : null}
          {props.view === "tourCards" ? <AdminTourCardsPage /> : null}
          {props.view === "seasons" ? <AdminSeasonsPage /> : null}
          {props.view === "teams" ? <AdminTeamsPage /> : null}
          {props.view === "golfers" ? <AdminGolfersPage /> : null}
          {props.view === "memberMerge" ? <AdminMemberMergePage /> : null}
          {props.view === "accountAudit" ? <MemberAccountAuditPage /> : null}
          {props.view === "crons" ? <AdminCronsPage /> : null}
        </div>
      </div>

      <SecondaryToolbar className="px-2">
        <div className="flex w-full items-center justify-start gap-2 overflow-x-auto">
          {items.map((item) => {
            const isActive = item.view === props.view;

            return (
              <Button
                key={item.view}
                type="button"
                size="sm"
                variant={isActive ? "default" : "outline"}
                className="shrink-0"
                onClick={() => props.onViewChange(item.view)}
              >
                {item.label}
              </Button>
            );
          })}
        </div>
      </SecondaryToolbar>
    </div>
  );
}

/**
 * Defines the admin views shown in the secondary toolbar.
 *
 * @returns Ordered view items for rendering navigation buttons.
 */
function useAdminSecondaryToolbarItems(): Array<{
  view: AdminDashboardView;
  label: string;
}> {
  return [
    { view: "dashboard", label: "Home" },
    { view: "leagueSetup", label: "Setup" },
    { view: "missingTourCards", label: "Missing" },
    { view: "tournaments", label: "Tourn." },
    { view: "tourCards", label: "Cards" },
    { view: "seasons", label: "Seasons" },
    { view: "teams", label: "Teams" },
    { view: "golfers", label: "Golfers" },
    { view: "memberMerge", label: "Merge" },
    { view: "accountAudit", label: "Audit" },
    { view: "crons", label: "Crons" },
  ];
}
