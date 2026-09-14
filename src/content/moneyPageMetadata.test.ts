import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// SEO-4A — regression coverage for the exact duplicated-brand-suffix defect
// found and fixed this mission (how-it-works' metaTitle embedded
// "FutureTutor" itself, which the root layout's title template then
// suffixed again with "— FutureTutor"). Every Tier A ("money page")
// metaTitle must never embed the brand name — the root layout's template
// (`%s — FutureTutor`) always appends it exactly once.

const TIER_A_TITLES = {
  home: en.site.tagline,
  findTutors: en.findTutorsPage.metaTitle,
  tutoringEdmonton: en.tutoringMarkets.items.edmonton.metaTitle,
  becomeATutor: en.publicExperience.forTutors.metaTitle,
  howItWorks: en.publicExperience.how.metaTitle,
} as const;

const TIER_A_TITLES_FR = {
  home: fr.site.tagline,
  findTutors: fr.findTutorsPage.metaTitle,
  tutoringEdmonton: fr.tutoringMarkets.items.edmonton.metaTitle,
  becomeATutor: fr.publicExperience.forTutors.metaTitle,
  howItWorks: fr.publicExperience.how.metaTitle,
} as const;

describe.each(Object.entries(TIER_A_TITLES))("EN %s metaTitle", (_page, title) => {
  it("never embeds the FutureTutor brand name (the root layout's title template appends it exactly once)", () => {
    expect(title.toLowerCase()).not.toContain("futuretutor");
  });
});

describe.each(Object.entries(TIER_A_TITLES_FR))("FR %s metaTitle", (_page, title) => {
  it("never embeds the FutureTutor brand name", () => {
    expect(title.toLowerCase()).not.toContain("futuretutor");
  });
});

describe("Tier A metaTitle uniqueness", () => {
  it("every EN Tier A title is distinct — no two money pages share a title", () => {
    const titles = Object.values(TIER_A_TITLES);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("every FR Tier A title is distinct", () => {
    const titles = Object.values(TIER_A_TITLES_FR);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("subjects.page.title template", () => {
  it("EN: never embeds the brand name once the {subject} placeholder is filled", () => {
    const filled = en.subjects.page.title.replace("{subject}", "Mathematics");
    expect(filled.toLowerCase()).not.toContain("futuretutor");
  });

  it("FR: never embeds the brand name once the {subject} placeholder is filled", () => {
    const filled = fr.subjects.page.title.replace("{subject}", "mathématiques");
    expect(filled.toLowerCase()).not.toContain("futuretutor");
  });
});

describe("subjects.page level-depth content (SEO-4A)", () => {
  it("EN declares the levels and mode sections added this mission", () => {
    expect(en.subjects.page.levelsHeading).toBeTruthy();
    expect(en.subjects.page.levelsDescription).toContain("{subject}");
    expect(en.subjects.page.levelsNote).toContain("{subject}");
    expect(en.subjects.page.modeHeading).toBeTruthy();
    expect(en.subjects.page.modeDescription).toContain("{subject}");
  });

  it("FR declares the levels and mode sections added this mission", () => {
    expect(fr.subjects.page.levelsHeading).toBeTruthy();
    expect(fr.subjects.page.levelsDescription).toContain("{subject}");
    expect(fr.subjects.page.levelsNote).toContain("{subject}");
    expect(fr.subjects.page.modeHeading).toBeTruthy();
    expect(fr.subjects.page.modeDescription).toContain("{subject}");
  });

  it("the levels note explicitly avoids claiming every tutor teaches every level (product-honesty guard)", () => {
    expect(en.subjects.page.levelsNote.toLowerCase()).toMatch(/not every|specific levels/);
    expect(fr.subjects.page.levelsNote.toLowerCase()).toMatch(/ne couvre pas|précisément les niveaux/);
  });
});

describe("become-a-tutor local Edmonton framing (SEO-4A)", () => {
  it("EN makes no compensation/earnings claims in the new local section", () => {
    const text = `${en.publicExperience.forTutors.local.title} ${en.publicExperience.forTutors.local.description}`.toLowerCase();
    expect(text).not.toMatch(/\$|per hour|\/hr|guarantee|earn/);
  });

  it("FR makes no compensation/earnings claims in the new local section", () => {
    const text = `${fr.publicExperience.forTutors.local.title} ${fr.publicExperience.forTutors.local.description}`.toLowerCase();
    expect(text).not.toMatch(/\$|de l'heure|garanti|gagner/);
  });
});
