import type { AdminDashboardView } from "@/lib/types";

import { AdminPanel } from "@/displays";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui";

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
  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-7xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="min-w-0">
            <AdminPanel
              activeView={props.view}
              onViewChange={props.onViewChange}
            />
          </div>

          <div className="min-w-0">
            {props.view === "dashboard" ? (
              <Card>
                <CardHeader>
                  <CardTitle>Select an admin tool</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Use the Admin Panel to open a tool.
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
      </div>
    </div>
  );
}
