import { createFileRoute } from "@tanstack/react-router";

import { AdminTeamsPage } from "@/components/pages/admin/AdminTeamsPage";

export const Route = createFileRoute("/admin/teams")({
  component: AdminTeamsRoute,
});
function AdminTeamsRoute() {
  return <AdminTeamsPage />;
}
