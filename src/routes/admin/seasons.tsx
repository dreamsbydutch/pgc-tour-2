import { createFileRoute } from "@tanstack/react-router";

import { AdminSeasonsPage } from "@/components/pages/admin/AdminSeasonsPage";

export const Route = createFileRoute("/admin/seasons")({
  component: AdminSeasonsRoute,
});

function AdminSeasonsRoute() {
  return <AdminSeasonsPage />;
}
