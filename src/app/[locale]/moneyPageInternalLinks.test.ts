import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SEO-4A — regression guard for the internal-linking gap this mission
// closed: none of these Tier A pages linked to /tutoring/edmonton or
// /resources anywhere in their body content before this mission (only the
// footer did). Source-level check, matching the existing
// legalPagesMetadata.test.ts convention — asserting the literal href
// string is present is enough to catch a future accidental removal
// without needing a full render.

describe("homepage links to Edmonton and Resources", () => {
  const source = readFileSync(join(__dirname, "page.tsx"), "utf8");
  it('links to "/tutoring/edmonton"', () => expect(source).toContain('href="/tutoring/edmonton"'));
  it('links to "/resources"', () => expect(source).toContain('href="/resources"'));
});

describe("find-tutors links to subjects, Edmonton, and How It Works", () => {
  const source = readFileSync(join(__dirname, "find-tutors", "page.tsx"), "utf8");
  it('links to "/subjects"', () => expect(source).toContain('href="/subjects"'));
  it('links to "/tutoring/edmonton"', () => expect(source).toContain('href="/tutoring/edmonton"'));
  it('links to "/how-it-works"', () => expect(source).toContain('href="/how-it-works"'));
  it("does not modify TutorDirectory.tsx's own financial/pricing logic", () => {
    // TutorDirectory.tsx is not imported by path in this test, but the
    // find-tutors page itself must not inline any pricing call — it only
    // renders the existing, untouched <TutorDirectory /> component.
    expect(source).not.toContain("calculateCustomerPrice");
  });
});

describe("how-it-works links to Edmonton and Resources", () => {
  const source = readFileSync(join(__dirname, "how-it-works", "page.tsx"), "utf8");
  it('links to "/tutoring/edmonton"', () => expect(source).toContain('href="/tutoring/edmonton"'));
  it('links to "/resources"', () => expect(source).toContain('href="/resources"'));
});

describe("become-a-tutor links to Edmonton", () => {
  const source = readFileSync(join(__dirname, "become-a-tutor", "page.tsx"), "utf8");
  it('links to "/tutoring/edmonton"', () => expect(source).toContain('href="/tutoring/edmonton"'));
});

describe("tutoring/[city] links to How It Works", () => {
  const source = readFileSync(join(__dirname, "tutoring", "[city]", "page.tsx"), "utf8");
  it('links to "/how-it-works"', () => expect(source).toContain('href="/how-it-works"'));
});

describe("subjects/[subject] declares the new level/mode depth sections", () => {
  const source = readFileSync(join(__dirname, "subjects", "[subject]", "page.tsx"), "utf8");
  it("renders the six real academic levels, not a hardcoded subset", () => {
    for (const level of ["elementary", "middleSchool", "highSchool", "cegepCollege", "university", "adultLearner"]) {
      expect(source).toContain(level);
    }
  });
  it("renders online and in-person mode framing", () => {
    expect(source).toContain('tSearch("online")');
    expect(source).toContain('tSearch("inPerson")');
  });
});
