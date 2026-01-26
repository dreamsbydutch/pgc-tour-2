import { getActiveArticleBySlug } from "@/lib";

/**
 * Renders an individual article at `/articles/$slug`.
 *
 * Data source:
 * - Static module registry from `getActiveArticleBySlug(slug)`.
 *
 * Major render states:
 * - Not found when the slug is not published
 * - Published article body render
 */
export function ArticleDetailPage(props: { slug: string }) {
  const vm = useArticleDetailPage({ slug: props.slug });

  if (vm.kind === "loading") {
    return <ArticleDetailPageSkeleton />;
  }

  if (vm.kind === "notFound") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="mt-2 text-muted-foreground">
          That article isn’t published.
        </p>
      </div>
    );
  }

  const Body = vm.article.Body;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="text-sm text-muted-foreground">
        {vm.article.publishedAt}
      </div>
      <h1 className="mt-2 text-3xl font-semibold">{vm.article.title}</h1>
      <div className="mt-6">
        <Body />
      </div>
    </div>
  );
}

/**
 * Resolves the article for a given slug and returns the render state.
 */
function useArticleDetailPage(args: { slug: string }):
  | { kind: "loading" }
  | { kind: "notFound" }
  | {
      kind: "ready";
      article: NonNullable<ReturnType<typeof getActiveArticleBySlug>>;
    } {
  const article = getActiveArticleBySlug(args.slug);
  if (!article) return { kind: "notFound" };
  return { kind: "ready", article };
}

/**
 * Loading state for an article detail page.
 */
function ArticleDetailPageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}
