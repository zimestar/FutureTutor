import { describe, expect, it } from "vitest";
import { resourceArticles, getResourceArticle, listPublishedResourceArticles } from "./resources";

// SEO-3 — resource content registry. At most one representative article was
// authorized for this mission; these tests protect the registry's
// invariants (unique slugs, draft exclusion), not a specific article count.

describe("resourceArticles registry", () => {
  it("has no duplicate slugs", () => {
    const slugs = resourceArticles.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("contains at most one article, per this mission's explicit scope boundary", () => {
    expect(resourceArticles.length).toBeLessThanOrEqual(1);
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
});
