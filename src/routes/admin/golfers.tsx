import { createFileRoute } from "@tanstack/react-router";

import { AdminGolfersPage } from "@/components/pages/admin/AdminGolfersPage";
import { HardGateAdmin } from "@/components/internal/HardGateAdmin";

export const Route = createFileRoute("/admin/golfers")({
  component: AdminGolfersRoute,
});

function AdminGolfersRoute() {
  return (
    <HardGateAdmin>
      <AdminGolfersPage />
    </HardGateAdmin>
  );
}
