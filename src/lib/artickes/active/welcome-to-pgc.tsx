import type { Article } from "@/lib/articles";

function Body() {
  return (
    <div className="prose prose-invert max-w-none">
      <h2>Welcome to PGC Articles</h2>
      <p>
        This is a sample article file. You can copy/paste AI-generated content
        into files like this and control what’s live by moving files between the
        active and inactive folders.
      </p>
      <h3>How publishing works</h3>
      <ul>
        <li>In src/content/articles/active → shows on the site</li>
        <li>In src/content/articles/inactive → hidden but kept in repo</li>
      </ul>
    </div>
  );
}

export const article = {
  slug: "welcome-to-pgc",
  title: "Welcome to PGC Articles",
  excerpt: "A quick guide to adding static articles to the site.",
  author: "Dutch",
  publishedAt: "2026-01-17",
  tags: ["pgc", "articles"],
  Body,
} satisfies Article;
