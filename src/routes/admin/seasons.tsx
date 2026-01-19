import { createFileRoute } from "@tanstack/react-router";

import { AdminSeasonsPage } from "@/components/pages/admin/AdminSeasonsPage";
import { HardGateAdmin } from "@/components/internal/HardGateAdmin";

export const Route = createFileRoute("/admin/seasons")({
  component: AdminSeasonsRoute,
});

function AdminSeasonsRoute() {
  return (
    <HardGateAdmin>
      <AdminSeasonsPage />
    </HardGateAdmin>
  );
}
