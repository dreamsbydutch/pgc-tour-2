import { createFileRoute } from "@tanstack/react-router";

import { ArticlesIndexPage } from "@/facilitators";

export const Route = createFileRoute("/articles/")({
  component: ArticlesIndexRoute,
});

function ArticlesIndexRoute() {
  return <ArticlesIndexPage />;
}
