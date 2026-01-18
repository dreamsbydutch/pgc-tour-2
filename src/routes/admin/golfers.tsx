import { createFileRoute } from "@tanstack/react-router";

import { AdminGolfersPage } from "@/components/pages/admin/AdminGolfersPage";

export const Route = createFileRoute("/admin/golfers")({
  component: AdminGolfersRoute,
});

function AdminGolfersRoute() {
  return <AdminGolfersPage />;
}
