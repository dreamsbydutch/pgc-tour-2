import { createFileRoute } from "@tanstack/react-router";

import { AdminCronsPage } from "@/components/pages/admin/AdminCronsPage";

export const Route = createFileRoute("/admin/crons")({
  component: AdminCronsRoute,
});

function AdminCronsRoute() {
  return <AdminCronsPage />;
}
