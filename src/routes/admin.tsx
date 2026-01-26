import { createFileRoute } from "@tanstack/react-router";

import { ADMIN_DASHBOARD_VIEWS } from "@/lib/constants";
import type { AdminDashboardView } from "@/lib/types";

import { HardGateAdmin } from "@/components/internal/HardGateAdmin";
import { AdminDashboardPage } from "@/components/pages/admin/AdminDashboardPage";

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
  validateSearch: (search: Record<string, unknown>) => {
    const viewRaw = search.view;
    const view: AdminDashboardView =
      typeof viewRaw === "string" &&
      (ADMIN_DASHBOARD_VIEWS as readonly string[]).includes(viewRaw)
        ? (viewRaw as AdminDashboardView)
        : "dashboard";

    return { view };
  },
});

function AdminRoute() {
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <HardGateAdmin>
      <AdminDashboardPage
        view={view}
        onViewChange={(next) => {
          navigate({ search: { view: next } });
        }}
      />
    </HardGateAdmin>
  );
}
