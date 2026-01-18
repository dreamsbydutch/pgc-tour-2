import { createFileRoute } from "@tanstack/react-router";

import { AdminTournamentsPage } from "@/components/pages/admin/AdminTournamentsPage";

export const Route = createFileRoute("/admin/tournaments")({
  component: AdminTournamentsRoute,
});

function AdminTournamentsRoute() {
  return <AdminTournamentsPage />;
}
