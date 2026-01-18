import { createFileRoute } from "@tanstack/react-router";

import { ArticlesIndexPage } from "@/components/pages/ArticlesIndexPage";

export const Route = createFileRoute("/articles/")({
  component: ArticlesIndexRoute,
});

function ArticlesIndexRoute() {
  return <ArticlesIndexPage />;
}
