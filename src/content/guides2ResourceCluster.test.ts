import { describe, expect, it } from "vitest";
import { resourceArticles } from "./resources";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// GUIDES-2 — four guides added on 2026-11-27 (parents, Alberta exams,
// tutors, online sessions). Same quality bar as the Tier-1 cluster.
const GUIDES2_SLUGS = [
  "help-child-with-high-school-math",
  "alberta-provincial-exams",
  "become-a-tutor-as-a-student",
  "first-online-tutoring-session",
] as const;

type Item = { metaTitle: string; metaDescription: string; title: string; intro: string; sections: Record<string, { heading: string; body: string }>; cta: { title: string; description: string; primary: string } };

describe("GUIDES-2 resource articles", () => {
  it("are registered, published and link to real related slugs", () => {
    const known = new Set(resourceArticles.map((article) => article.slug));
    for (const slug of GUIDES2_SLUGS) {
      const article = resourceArticles.find((entry) => entry.slug === slug);
      expect(article).toBeDefined();
      expect(article?.draft).not.toBe(true);
      for (const related of article?.relatedSlugs ?? []) expect(known.has(related)).toBe(true);
    }
  });

  for (const [locale, messages] of [["en", en], ["fr", fr]] as const) {
    for (const slug of GUIDES2_SLUGS) {
      it(`${locale} ${slug} has complete copy without the brand in its title`, () => {
        const item = (messages.resourceArticles.items as Record<string, Item>)[slug];
        expect(item.metaTitle.length).toBeGreaterThan(0);
        expect(item.metaDescription.length).toBeGreaterThan(0);
        expect(item.intro.length).toBeGreaterThan(0);
        expect(item.title).not.toMatch(/FutureTutor/);
        for (const index of [0, 1, 2, 3]) {
          expect(item.sections[index].heading.length).toBeGreaterThan(0);
          expect(item.sections[index].body.length).toBeGreaterThan(40);
        }
        expect(item.cta.title.length).toBeGreaterThan(0);
        expect(item.cta.primary.length).toBeGreaterThan(0);
      });
    }
  }

  it("the forTutors category has a label in both languages", () => {
    expect(en.resourceHub.categories.forTutors).toBe("For tutors");
    expect(fr.resourceHub.categories.forTutors).toBe("Pour les tuteurs");
  });
});
