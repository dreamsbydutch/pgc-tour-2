import { HardGateAdmin } from "@/components/displays";
import { createFileRoute } from "@tanstack/react-router";


export const Route = createFileRoute("/admin")({
  component: AdminRoute,
});

function AdminRoute() {
  return (
    <HardGateAdmin>
      <div> ADMIN PAGE </div>
    </HardGateAdmin>
  );
}
