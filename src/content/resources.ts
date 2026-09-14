export interface ResourceArticle {
  slug: string;
  category: "choosingATutor" | "parentGuides" | "tutoringBasics";
  publishedAt: string;
  updatedAt: string;
  /** The article's one primary commercial next-step — usually /find-tutors,
   * but a trust-focused article may point to /how-it-works instead. Kept
   * per-article (not hardcoded in the page template) so each resource's
   * CTA matches its actual supporting money page. */
  primaryLinkHref: string;
  /** Other resource-article slugs genuinely related to this one, for a
   * small "related guides" cluster-linking section. Every entry must be a
   * real slug present in this same array. */
  relatedSlugs?: string[];
  /** Draft articles exist in the registry (so their route resolves during
   * review) but are excluded from the index page and the sitemap, and are
   * served with `robots: {index:false}`. */
  draft?: boolean;
}

/**
 * SEO-3/SEO-4B resource content registry. Deliberately a small static list
 * (the same pattern as src/content/subjects.ts), not a CMS/DB model.
 * Display copy lives in messages/*.json under `resourceArticles.items.<slug>`.
 *
 * SEO-4B — these are FutureTutor's six certified Tier-1 informational
 * topics (docs/seo/SEO-2-KEYWORD-STRATEGY.md §18/§21): choosing a tutor
 * (seeded in SEO-3), homework help, cost of tutoring, online vs in-person
 * tutoring, how tutors are vetted, and when to get a tutor. See
 * docs/seo/SEO-4B-TIER1-CONTENT.md for the full ownership/linking matrix.
 */
export const resourceArticles: ResourceArticle[] = [
  {
    slug: "how-to-choose-a-tutor",
    category: "choosingATutor",
    publishedAt: "2026-09-14",
    updatedAt: "2026-09-14",
    primaryLinkHref: "/find-tutors",
    relatedSlugs: ["how-tutors-are-vetted", "online-vs-in-person-tutoring"],
  },
  {
    slug: "homework-help",
    category: "tutoringBasics",
    publishedAt: "2026-09-14",
    updatedAt: "2026-09-14",
    primaryLinkHref: "/find-tutors",
    relatedSlugs: ["when-to-get-a-tutor", "online-vs-in-person-tutoring"],
  },
  {
    slug: "cost-of-tutoring",
    category: "tutoringBasics",
    publishedAt: "2026-09-14",
    updatedAt: "2026-09-14",
    primaryLinkHref: "/find-tutors",
    relatedSlugs: ["how-to-choose-a-tutor", "online-vs-in-person-tutoring"],
  },
  {
    slug: "online-vs-in-person-tutoring",
    category: "tutoringBasics",
    publishedAt: "2026-09-14",
    updatedAt: "2026-09-14",
    primaryLinkHref: "/find-tutors",
    relatedSlugs: ["homework-help", "how-tutors-are-vetted"],
  },
  {
    slug: "how-tutors-are-vetted",
    category: "choosingATutor",
    publishedAt: "2026-09-14",
    updatedAt: "2026-09-14",
    primaryLinkHref: "/how-it-works",
    relatedSlugs: ["how-to-choose-a-tutor", "cost-of-tutoring"],
  },
  {
    slug: "when-to-get-a-tutor",
    category: "parentGuides",
    publishedAt: "2026-09-14",
    updatedAt: "2026-09-14",
    primaryLinkHref: "/find-tutors",
    relatedSlugs: ["homework-help", "how-to-choose-a-tutor"],
  },
];

export function getResourceArticle(slug: string): ResourceArticle | undefined {
  return resourceArticles.find((article) => article.slug === slug);
}

export function listPublishedResourceArticles(): ResourceArticle[] {
  return resourceArticles.filter((article) => !article.draft);
}
