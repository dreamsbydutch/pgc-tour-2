import { createFileRoute } from "@tanstack/react-router";

import { AdminDashboard } from "@/facilitators";
import { HardGateAdmin } from "@/widgets";

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
  head: () => ({
    meta: [
      { title: "Admin Dashboard | PGC Tour" },
      {
        name: "description",
        content:
          "Administer PGC Tour seasons, tournaments, members, and operations.",
      },
    ],
  }),
});

function AdminRoute() {
  return (
    <HardGateAdmin>
      <AdminDashboard />
    </HardGateAdmin>
  );
}
