import { createFileRoute } from "@tanstack/react-router";

import { AdminCronsPage } from "@/components/pages/admin/AdminCronsPage";
import { HardGateAdmin } from "@/components/internal/HardGateAdmin";

export const Route = createFileRoute("/admin/crons")({
  component: AdminCronsRoute,
});

function AdminCronsRoute() {
  return (
    <HardGateAdmin>
      <AdminCronsPage />
    </HardGateAdmin>
  );
}
