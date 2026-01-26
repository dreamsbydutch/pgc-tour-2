import { createFileRoute } from "@tanstack/react-router";

import { RulebookPage } from "@/facilitators";

export const Route = createFileRoute("/rulebook")({
  component: Rulebook,
});

function Rulebook() {
  return <RulebookPage />;
}
