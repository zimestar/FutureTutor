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

  it("every metadata card container allows its content to shrink and wrap (min-w-0), not stay a rigid unbreakable box", () => {
    const cardMatches = source.match(/className="flex min-w-0 items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4"/g) ?? [];
    // Mode, city, languages, levels — four metadata cards.
    expect(cardMatches.length).toBe(4);
  });

  it("every metadata card's icon is shrink-0 so text space is preferred over icon distortion", () => {
    const iconMatches = source.match(/size=\{18\} className="shrink-0 text-blue"/g) ?? [];
    expect(iconMatches.length).toBe(4);
  });

  it("every metadata card's label span is itself min-w-0 so long text wraps instead of overflowing its flex parent", () => {
    const labelMatches = source.match(/<span className="min-w-0 text-sm font-semibold text-navy">/g) ?? [];
    expect(labelMatches.length).toBe(4);
  });

  it("does not fix the overflow by shrinking text size or hard-coding a narrow width", () => {
    expect(source).not.toMatch(/text-xs.*mode\./);
    expect(source).not.toMatch(/w-(?:20|24|28|32|36|40)\b.*rounded-lg border border-neutral-200/);
  });
});
