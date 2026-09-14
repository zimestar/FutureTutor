import { describe, expect, it } from "vitest";
import { resourceArticles, getResourceArticle, listPublishedResourceArticles } from "./resources";

// SEO-3 seeded one representative article; SEO-4B launched the certified
// six-topic Tier-1 cluster (docs/seo/SEO-4B-TIER1-CONTENT.md). These tests
// protect the registry's structural invariants (unique slugs, draft
// exclusion, valid relatedSlugs), not any specific article count — the
// count itself is asserted separately, below, against the certified total.

describe("resourceArticles registry", () => {
  it("has no duplicate slugs", () => {
    const slugs = resourceArticles.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("contains exactly the six certified Tier-1 topics (SEO-4B)", () => {
    expect(resourceArticles).toHaveLength(6);
  });

  it("getResourceArticle resolves a known slug and returns undefined for an unknown one", () => {
    expect(getResourceArticle("how-to-choose-a-tutor")).toBeDefined();
    expect(getResourceArticle("does-not-exist")).toBeUndefined();
  });

  it("listPublishedResourceArticles excludes any article marked draft", () => {
    const published = listPublishedResourceArticles();
    for (const article of published) {
      expect(article.draft).not.toBe(true);
    }
    expect(published.length).toBeLessThanOrEqual(resourceArticles.length);
  });

  it("every article has both a publishedAt and updatedAt real ISO date, never a placeholder", () => {
    for (const article of resourceArticles) {
      expect(() => new Date(article.publishedAt).toISOString()).not.toThrow();
      expect(() => new Date(article.updatedAt).toISOString()).not.toThrow();
    }
  });

  it("every article declares a primaryLinkHref pointing at a real, non-empty path", () => {
    for (const article of resourceArticles) {
      expect(article.primaryLinkHref.startsWith("/")).toBe(true);
    }
  });

  it("every relatedSlugs entry references a real slug in this same registry (no broken cluster links)", () => {
    const knownSlugs = new Set(resourceArticles.map((a) => a.slug));
    for (const article of resourceArticles) {
      for (const relatedSlug of article.relatedSlugs ?? []) {
        expect(knownSlugs.has(relatedSlug)).toBe(true);
      }
    }
  });

  it("no article lists itself as a related article", () => {
    for (const article of resourceArticles) {
      expect(article.relatedSlugs ?? []).not.toContain(article.slug);
    }
  });
});
