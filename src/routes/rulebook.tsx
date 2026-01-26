import { createFileRoute } from "@tanstack/react-router";

import { RulebookPage } from "@/components";

export const Route = createFileRoute("/rulebook")({
  component: Rulebook,
});

function Rulebook() {
  return <RulebookPage />;
}
