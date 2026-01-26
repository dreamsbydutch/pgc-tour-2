import { createFileRoute } from "@tanstack/react-router";

import { ArticlesIndexPage } from "@/components";

export const Route = createFileRoute("/articles/")({
  component: ArticlesIndexRoute,
});

function ArticlesIndexRoute() {
  return <ArticlesIndexPage />;
}
