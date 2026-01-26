import { createFileRoute } from "@tanstack/react-router";

import { HistoryPage } from "@/components";

export const Route = createFileRoute("/history" as never)({
  component: RouteComponent,
});

function RouteComponent() {
  return <HistoryPage />;
}
