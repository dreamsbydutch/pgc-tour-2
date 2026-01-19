import { createFileRoute } from "@tanstack/react-router";

import { AdminTeamsPage } from "@/components/pages/admin/AdminTeamsPage";
import { HardGateAdmin } from "@/components/internal/HardGateAdmin";

export const Route = createFileRoute("/admin/teams")({
  component: AdminTeamsRoute,
});
function AdminTeamsRoute() {
  return (
    <HardGateAdmin>
      <AdminTeamsPage />
    </HardGateAdmin>
  );
}
