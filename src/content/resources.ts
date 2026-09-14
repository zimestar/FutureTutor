export interface ResourceArticle {
  slug: string;
  category: "choosingATutor" | "parentGuides" | "tutoringBasics";
  publishedAt: string;
  updatedAt: string;
  /** Draft articles exist in the registry (so their route resolves during
   * review) but are excluded from the index page and the sitemap, and are
   * served with `robots: {index:false}`. */
  draft?: boolean;
}

/**
 * SEO-3 resource content registry. Deliberately a small static list (the
 * same pattern as src/content/subjects.ts), not a CMS/DB model — at most one
 * representative article was authorized for this mission. Display copy
 * lives in messages/*.json under `resourceArticles.items.<slug>`.
 */
export const resourceArticles: ResourceArticle[] = [
  {
    slug: "how-to-choose-a-tutor",
    category: "choosingATutor",
    publishedAt: "2026-09-14",
    updatedAt: "2026-09-14",
  },
];

export function getResourceArticle(slug: string): ResourceArticle | undefined {
  return resourceArticles.find((article) => article.slug === slug);
}

export function listPublishedResourceArticles(): ResourceArticle[] {
  return resourceArticles.filter((article) => !article.draft);
}
