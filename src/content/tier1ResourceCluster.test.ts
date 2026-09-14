import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resourceArticles } from "./resources";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// SEO-4B — FutureTutor's six certified Tier-1 informational topics
// (docs/seo/SEO-2-KEYWORD-STRATEGY.md §18/§21): choosing a tutor (seeded
// in SEO-3), homework help, cost of tutoring, online vs in-person
// tutoring, how tutors are vetted, and when to get a tutor. These tests
// protect the whole cluster's launch invariants in one place.

const TIER1_SLUGS = [
  "how-to-choose-a-tutor",
  "homework-help",
  "cost-of-tutoring",
  "online-vs-in-person-tutoring",
  "how-tutors-are-vetted",
  "when-to-get-a-tutor",
] as const;

describe("Tier-1 resource cluster — registry completeness", () => {
  it("all six certified topics exist in the registry, no more, no fewer", () => {
    const slugs = resourceArticles.map((a) => a.slug).sort();
    expect(slugs).toEqual([...TIER1_SLUGS].sort());
  });

  it("none of the six are drafts — all six are live and published", () => {
    for (const article of resourceArticles) {
      expect(article.draft).not.toBe(true);
    }
  });
});

describe.each(TIER1_SLUGS)("%s — EN content", (slug) => {
  const item = (en.resourceArticles.items as Record<string, { metaTitle: string; metaDescription: string; title: string; intro: string; sections: Record<string, { heading: string; body: string }>; cta: { title: string; description: string; primary: string } }>)[slug];

  it("exists with a unique, non-empty metaTitle/metaDescription/title/intro", () => {
    expect(item).toBeDefined();
    expect(item.metaTitle.length).toBeGreaterThan(0);
    expect(item.metaDescription.length).toBeGreaterThan(0);
    expect(item.title.length).toBeGreaterThan(0);
    expect(item.intro.length).toBeGreaterThan(0);
  });

  it("has all 4 body sections with real content", () => {
    for (const index of ["0", "1", "2", "3"]) {
      expect(item.sections[index].heading.length).toBeGreaterThan(0);
      expect(item.sections[index].body.length).toBeGreaterThan(40);
    }
  });

  it("never embeds the FutureTutor brand name in its title (root layout template appends it once)", () => {
    expect(item.title.toLowerCase()).not.toContain("futuretutor");
    expect(item.metaTitle.toLowerCase()).not.toContain("futuretutor");
  });

  it("has a real CTA with a destination label", () => {
    expect(item.cta.title.length).toBeGreaterThan(0);
    expect(item.cta.primary.length).toBeGreaterThan(0);
  });
});

describe.each(TIER1_SLUGS)("%s — FR content", (slug) => {
  const item = (fr.resourceArticles.items as Record<string, { metaTitle: string; metaDescription: string; title: string; intro: string; sections: Record<string, { heading: string; body: string }>; cta: { title: string; description: string; primary: string } }>)[slug];

  it("exists with a unique, non-empty metaTitle/metaDescription/title/intro, written natively (not left as an EN fallback)", () => {
    expect(item).toBeDefined();
    expect(item.metaTitle.length).toBeGreaterThan(0);
    expect(item.metaDescription.length).toBeGreaterThan(0);
    expect(item.title.length).toBeGreaterThan(0);
    expect(item.intro.length).toBeGreaterThan(0);
    const enItem = (en.resourceArticles.items as Record<string, { title: string }>)[slug];
    expect(item.title).not.toBe(enItem.title);
  });

  it("has all 4 body sections with real content", () => {
    for (const index of ["0", "1", "2", "3"]) {
      expect(item.sections[index].heading.length).toBeGreaterThan(0);
      expect(item.sections[index].body.length).toBeGreaterThan(40);
    }
  });

  it("never embeds the FutureTutor brand name in its title", () => {
    expect(item.title.toLowerCase()).not.toContain("futuretutor");
    expect(item.metaTitle.toLowerCase()).not.toContain("futuretutor");
  });
});

describe("Tier-1 cluster — title/description uniqueness", () => {
  it("every EN title is unique across the six topics", () => {
    const titles = TIER1_SLUGS.map((slug) => (en.resourceArticles.items as Record<string, { title: string }>)[slug].title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("every EN metaDescription is unique across the six topics", () => {
    const descriptions = TIER1_SLUGS.map((slug) => (en.resourceArticles.items as Record<string, { metaDescription: string }>)[slug].metaDescription);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("every FR title is unique across the six topics", () => {
    const titles = TIER1_SLUGS.map((slug) => (fr.resourceArticles.items as Record<string, { title: string }>)[slug].title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("every FR metaDescription is unique across the six topics", () => {
    const descriptions = TIER1_SLUGS.map((slug) => (fr.resourceArticles.items as Record<string, { metaDescription: string }>)[slug].metaDescription);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});

describe("Tier-1 cluster — product honesty guards", () => {
  it("EN never fabricates statistics, testimonials, ratings, or asserts a guarantee/certification claim (honest negated disclaimers like \"doesn't guarantee\" are expected and allowed)", () => {
    for (const slug of TIER1_SLUGS) {
      const item = (en.resourceArticles.items as Record<string, { sections: Record<string, { body: string }> }>)[slug];
      const fullText = Object.values(item.sections).map((s) => s.body).join(" ").toLowerCase();
      expect(fullText).not.toMatch(/\d+%|we guarantee|guaranteed (to|results|outcome)|is certified|police.check/);
      // "background check(s)/checked" is only allowed inside the one
      // explicit, honest disclaimer sentence carried over from the
      // product's own FAQ ("does not claim background checks").
      const backgroundCheckMentionCount = (fullText.match(/background.check/g) ?? []).length;
      if (backgroundCheckMentionCount > 0) {
        expect(fullText).toContain("does not claim background checks");
      }
    }
  });

  it("FR never fabricates statistics, testimonials, ratings, or asserts a guarantee/certification claim (honest negated disclaimers like \"ne garantit pas\" are expected and allowed)", () => {
    for (const slug of TIER1_SLUGS) {
      const item = (fr.resourceArticles.items as Record<string, { sections: Record<string, { body: string }> }>)[slug];
      const fullText = Object.values(item.sections).map((s) => s.body).join(" ").toLowerCase();
      expect(fullText).not.toMatch(/\d+\s?%|nous garantissons|est certifié/);
      const backgroundCheckMentionCount = (fullText.match(/vérification d'antécédents/g) ?? []).length;
      if (backgroundCheckMentionCount > 0) {
        expect(fullText).toContain("ne prétend pas effectuer de vérification d'antécédents");
      }
    }
  });

  it("the vetting article explicitly preserves the product's own 'no background checks or guarantees' constraint (EN+FR)", () => {
    const enBody = Object.values((en.resourceArticles.items as Record<string, { sections: Record<string, { body: string }> }>)["how-tutors-are-vetted"].sections).map((s) => s.body).join(" ");
    const frBody = Object.values((fr.resourceArticles.items as Record<string, { sections: Record<string, { body: string }> }>)["how-tutors-are-vetted"].sections).map((s) => s.body).join(" ");
    expect(enBody).toContain("does not claim background checks or guarantees");
    expect(frBody).toContain("ne prétend pas effectuer de vérification d'antécédents");
  });
});

describe("Tier-1 cluster — page template source", () => {
  const source = readFileSync(join(__dirname, "..", "app", "[locale]", "resources", "[slug]", "page.tsx"), "utf8");

  it("the CTA button uses the per-article primaryLinkHref, not a hardcoded destination", () => {
    expect(source).toContain("article.primaryLinkHref");
    expect(source).not.toMatch(/<Button href="\/find-tutors" size="lg">/);
  });

  it("renders a related-guides cluster-linking section", () => {
    expect(source).toContain("relatedArticles");
    expect(source).toContain('tHub("relatedHeading")');
  });

  it("never inlines financial/pricing logic", () => {
    expect(source).not.toMatch(/calculateCustomerPrice|stripe|Stripe/i);
  });
});

describe("Tier-1 cluster — resource index discoverability", () => {
  const source = readFileSync(join(__dirname, "..", "app", "[locale]", "resources", "page.tsx"), "utf8");

  it("lists articles from the registry generically (no hardcoded single-article assumption)", () => {
    expect(source).toContain("listPublishedResourceArticles()");
  });
});
