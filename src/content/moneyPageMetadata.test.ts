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

describe("tutor-resources university-students section (SEO-4)", () => {
  const enSection = en.publicExperience.resources.universityStudents;
  const frSection = fr.publicExperience.resources.universityStudents;

  it("EN declares the new section with real content, not placeholders", () => {
    expect(enSection.eyebrow).toBeTruthy();
    expect(enSection.title).toBeTruthy();
    expect(enSection.description.length).toBeGreaterThan(80);
    expect(enSection.cta).toBeTruthy();
  });

  it("FR declares the new section with real content, not placeholders", () => {
    expect(frSection.eyebrow).toBeTruthy();
    expect(frSection.title).toBeTruthy();
    expect(frSection.description.length).toBeGreaterThan(80);
    expect(frSection.cta).toBeTruthy();
  });

  it("FR is written natively, not a literal copy of EN", () => {
    expect(frSection.title).not.toBe(enSection.title);
    expect(frSection.description).not.toBe(enSection.description);
  });

  it("EN makes no compensation/earnings claims and never invents a separate student program", () => {
    const text = `${enSection.title} ${enSection.description}`.toLowerCase();
    expect(text).not.toMatch(/\$|per hour|\/hr|\bearn\b/);
    // "student program"/"student-tutor program" as an invented product
    // feature is forbidden; the honest negation ("no separate student
    // program") is required — checked positively below, not here.
    expect(text).not.toMatch(/a separate student program exists|a dedicated student program/);
  });

  it("FR makes no compensation/earnings claims and never invents a separate student program", () => {
    const text = `${frSection.title} ${frSection.description}`.toLowerCase();
    expect(text).not.toMatch(/\$|de l'heure|\bgagner\b/);
    expect(text).not.toMatch(/programme étudiant distinct existe/);
  });

  it("EN/FR both explicitly state there is no guaranteed volume of requests and no separate program (honesty guard, matching SEO-2's own recruitment-content constraint) — the only occurrence of \"guarantee\"/\"garanti\" is this negation, never a positive claim", () => {
    expect(enSection.description.toLowerCase()).toMatch(/no guaranteed number/);
    expect(enSection.description.toLowerCase()).toMatch(/no separate student program/);
    expect(frSection.description.toLowerCase()).toMatch(/aucun nombre garanti/);
    expect(frSection.description.toLowerCase()).toMatch(/aucun programme distinct/);
    // Every occurrence of "guarant-"/"garanti" in the EN/FR text is part
    // of a "no guarantee" negation, never a standalone positive claim.
    const enGuaranteeMatches = enSection.description.match(/\bguarant\w*/gi) ?? [];
    for (const match of enGuaranteeMatches) {
      const index = enSection.description.toLowerCase().indexOf(match.toLowerCase());
      expect(enSection.description.slice(Math.max(0, index - 4), index).toLowerCase()).toContain("no ");
    }
    const frGuaranteeMatches = frSection.description.match(/garanti\w*/gi) ?? [];
    for (const match of frGuaranteeMatches) {
      const index = frSection.description.toLowerCase().indexOf(match.toLowerCase());
      expect(frSection.description.slice(Math.max(0, index - 20), index).toLowerCase()).toContain("aucun");
    }
  });
});
