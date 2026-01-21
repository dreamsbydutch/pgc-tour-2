import { createFileRoute } from "@tanstack/react-router";

import type { AdminDashboardSection } from "@/lib/types";
import { ADMIN_DASHBOARD_SECTIONS } from "@/lib/constants";

import { HardGateAdmin } from "@/components/internal/HardGateAdmin";
import { AdminSetupPage } from "@/components/pages/admin/AdminSetupPage";

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
  validateSearch: (search: Record<string, unknown>) => {
    const sectionRaw = search.section;

    const section: AdminDashboardSection =
      typeof sectionRaw === "string" &&
      (ADMIN_DASHBOARD_SECTIONS as readonly string[]).includes(sectionRaw)
        ? (sectionRaw as AdminDashboardSection)
        : "seasons";

    return { section };
  },
});

function AdminRoute() {
  const { section } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <HardGateAdmin>
      <AdminSetupPage
        section={section}
        onSectionChange={(nextSection) => {
          navigate({
            search: { section: nextSection },
          });
        }}
      />
    </HardGateAdmin>
  );
}
