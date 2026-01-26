import { Link } from "@tanstack/react-router";

import { getActiveArticles } from "@/lib";

/**
 * Renders the `/articles` index.
 *
 * Data source:
 * - Static module registry from `getActiveArticles()`.
 *
 * Major render states:
 * - Empty state when no articles are active
 * - List of published article cards linking to `/articles/$slug`
 */
export function ArticlesIndexPage() {
  const vm = useArticlesIndexPage();

  if (vm.kind === "loading") {
    return <ArticlesIndexPageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Articles</h1>

      <div className="mt-6 space-y-4">
        {vm.articles.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No articles published yet.
          </div>
        ) : (
          vm.articles.map((a) => (
            <div key={a.slug} className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">
                {a.publishedAt}
              </div>
              <Link
                className="text-lg font-medium underline"
                params={{ slug: a.slug }}
                to="/articles/$slug"
              >
                {a.title}
              </Link>
              <div className="mt-2 text-sm text-muted-foreground">
                {a.excerpt}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Builds the `/articles` index view model from the active article registry.
 */
function useArticlesIndexPage():
  | { kind: "ready"; articles: ReturnType<typeof getActiveArticles> }
  | { kind: "loading" } {
  const articles = getActiveArticles();
  return { kind: "ready", articles };
}

/**
 * Loading state for the articles index.
 */
function ArticlesIndexPageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}
