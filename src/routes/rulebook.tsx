import { createFileRoute } from "@tanstack/react-router";

import { RulebookPage } from "@/facilitators";

export const Route = createFileRoute("/rulebook")({
  component: RulebookPage,
  head: () => ({
    meta: [
      { title: "Rulebook | PGC Tour" },
      {
        name: "description",
        content:
          "Read the PGC Tour rules for scoring, schedules, payouts, rosters, and playoffs.",
      },
    ],
  }),
});
