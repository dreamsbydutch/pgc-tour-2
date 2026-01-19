import { createFileRoute } from "@tanstack/react-router";

import { AdminTournamentsPage } from "@/components/pages/admin/AdminTournamentsPage";
import { HardGateAdmin } from "@/components/internal/HardGateAdmin";

export const Route = createFileRoute("/admin/tournaments")({
  component: AdminTournamentsRoute,
});

function AdminTournamentsRoute() {
  return (
    <HardGateAdmin>
      <AdminTournamentsPage />
    </HardGateAdmin>
  );
}
