import { createFileRoute } from "@tanstack/react-router";

import { ArticleDetailPage } from "@/components/pages/ArticleDetailPage";

export const Route = createFileRoute("/articles/$slug")({
  component: ArticleRoute,
});

function ArticleRoute() {
  const { slug } = Route.useParams();
  return <ArticleDetailPage slug={slug} />;
}
