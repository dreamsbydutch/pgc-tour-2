import { createFileRoute } from "@tanstack/react-router";

import { AdminSetupPage } from "@/components/pages/admin/AdminSetupPage";

export const Route = createFileRoute("/admin/setup")({
  component: AdminSetupRoute,
});

function AdminSetupRoute() {
  return <AdminSetupPage />;
}
