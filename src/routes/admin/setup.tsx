import { createFileRoute } from "@tanstack/react-router";

import { AdminSetupPage } from "@/components/pages/admin/AdminSetupPage";
import { HardGateAdmin } from "@/components/internal/HardGateAdmin";

export const Route = createFileRoute("/admin/setup")({
  component: AdminSetupRoute,
});

function AdminSetupRoute() {
  return (
    <HardGateAdmin>
      <AdminSetupPage />
    </HardGateAdmin>
  );
}
