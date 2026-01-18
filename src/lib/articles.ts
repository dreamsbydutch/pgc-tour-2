import type { ComponentType } from "react";

export type Article = {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  tags?: string[];
  Body: ComponentType;
};

type ArticleModule = { article: Article };

const activeModules = import.meta.glob<ArticleModule>(
  "@/content/articles/active/*.tsx",
  { eager: true },
);

const activeArticles: Article[] = Object.values(activeModules).map(
  (m) => m.article,
);

function sortByPublishedAtDesc(a: Article, b: Article) {
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}

/**
 * Returns all active articles, newest first.
 */
export function getActiveArticles(): Article[] {
  return [...activeArticles].sort(sortByPublishedAtDesc);
}

/**
 * Looks up an active article by slug.
 */
export function getActiveArticleBySlug(slug: string): Article | null {
  return activeArticles.find((a) => a.slug === slug) ?? null;
}
