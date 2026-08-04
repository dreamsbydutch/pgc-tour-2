import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/facilitators";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "PGC Clubhouse | Pure Golf Collective" },
      {
        name: "description",
        content:
          "View the PGC Tour schedule, countdown, account status, and tour card registration.",
      },
    ],
  }),
});
