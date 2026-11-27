import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Tutor Profile — Supporting documents section reuses the existing document pipeline", () => {
  const profilePage = readFileSync("src/app/[locale]/tutor/profile/page.tsx", "utf8");
  const documentsPage = readFileSync("src/app/[locale]/tutor/documents/page.tsx", "utf8");
  const section = readFileSync("src/components/dashboard/TutorDocumentsSection.tsx", "utf8");

  it("both the profile page and the standalone documents page render the same shared section — no second upload system", () => {
    expect(profilePage).toContain('import { TutorDocumentsSection } from "@/components/dashboard/TutorDocumentsSection"');
    expect(profilePage).toContain("<TutorDocumentsSection");
    expect(documentsPage).toContain('import { TutorDocumentsSection } from "@/components/dashboard/TutorDocumentsSection"');
    expect(documentsPage).toContain("<TutorDocumentsSection");
  });

  it("the shared section reuses the existing upload form and row actions, not a new implementation", () => {
    expect(section).toContain('import { TutorDocumentUploadForm } from "@/components/dashboard/TutorDocumentUploadForm"');
    expect(section).toContain('import { TutorDocumentRowActions } from "@/components/dashboard/TutorDocumentRowActions"');
    expect(section).not.toMatch(/fetch\(.*supabase/i);
    expect(section).not.toMatch(/base64/i);
  });

  it("the profile page fetches the Tutor's own documents scoped to their own tutorProfileId, never a client-supplied id", () => {
    const documentsFetchIdx = profilePage.indexOf("db.tutorDocument.findMany");
    expect(documentsFetchIdx).toBeGreaterThan(-1);
    const scopeIdx = profilePage.indexOf("tutorProfileId: tutorProfile.id", documentsFetchIdx);
    expect(scopeIdx).toBeGreaterThan(documentsFetchIdx);
  });

  it("the profile page exposes a distinctly labeled Supporting documents section", () => {
    expect(profilePage).toMatch(/id="profile-documents-title"/);
    expect(profilePage).toContain('t("sections.documents.title")');
  });
});

describe("Public Tutor profile — metadata cards do not overflow with long localized labels", () => {
  const source = readFileSync("src/app/[locale]/tutors/[slug]/page.tsx", "utf8");
  const CARD = 'className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-surface p-4"';

  it("every metadata card container allows its content to shrink and wrap (min-w-0), not stay a rigid unbreakable box", () => {
    // Mode, city, languages, levels — four metadata cards.
    expect(source.split(CARD).length - 1).toBe(4);
  });

  it("every metadata card's icon is shrink-0 so text space is preferred over icon distortion", () => {
    const iconMatches = source.match(/size=\{18\} className="mt-0\.5 shrink-0 text-blue"/g) ?? [];
    expect(iconMatches.length).toBe(4);
  });

  it("every metadata card's text block is itself min-w-0 so long text wraps instead of overflowing its flex parent", () => {
    const blocks = source.split(CARD).slice(1);
    expect(blocks).toHaveLength(4);
    for (const block of blocks) {
      expect(block.slice(0, 400)).toContain('<div className="min-w-0">');
    }
  });

  it("does not fix the overflow by hard-coding a narrow card width", () => {
    expect(source).not.toMatch(/w-(?:20|24|28|32|36|40)\b.*rounded-xl border border-border bg-surface p-4/);
  });
});

describe("Public Tutor profile — two-up metadata layout keys off the actual column width, not the viewport", () => {
  const source = readFileSync("src/app/[locale]/tutors/[slug]/page.tsx", "utf8");

  it("marks the left profile column as a CSS container so descendants can query its real rendered width", () => {
    expect(source).toContain('<div className="@container min-w-0">');
  });

  it("gates the two-up metadata grid on a container-query breakpoint, never a viewport-only sm:/md:/lg: prefix", () => {
    expect(source).toContain("grid grid-cols-1 gap-3 @xl:grid-cols-2");
    expect(source).not.toMatch(/<dl className="[^"]*\b(?:sm|md|lg):grid-cols-2/);
  });

  it("keeps the booking card at a fixed width so it can never squeeze the profile column", () => {
    expect(source).toContain("lg:grid-cols-[minmax(0,1fr)_25rem]");
    expect(source).not.toContain("lg:grid-cols-[2fr_1fr]");
  });
});
