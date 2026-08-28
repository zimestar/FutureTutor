import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { termsContentEn, TERMS_VERSION } from "./termsContent.en";
import { termsContentFr } from "./termsContent.fr";
import type { LegalBlock } from "./types";

function flatten(blocks: LegalBlock[]): string {
  return blocks
    .map((b) => (b.type === "p" ? b.text : b.items.join(" ")))
    .join(" ");
}

function fullText(doc: typeof termsContentEn): string {
  return doc.sections.map((s) => `${s.heading} ${flatten(s.blocks)}`).join(" ");
}

describe("Terms of Service content — FG-LEGAL1A", () => {
  const enText = fullText(termsContentEn);
  const frText = fullText(termsContentFr);

  it("LEGAL-3: has a real Effective Date, not a bracketed placeholder", () => {
    expect(termsContentEn.effectiveDate).toBe("August 30, 2026");
    expect(termsContentEn.effectiveDate).not.toMatch(/\[.*\]/);
    expect(termsContentFr.effectiveDate).toBe("30 août 2026");
  });

  it("has a real Last Updated date, not a bracketed placeholder", () => {
    expect(termsContentEn.lastUpdated).not.toMatch(/\[.*\]/);
    expect(termsContentFr.lastUpdated).not.toMatch(/\[.*\]/);
  });

  it("TERMS_VERSION matches the Effective Date convention", () => {
    expect(TERMS_VERSION).toBe("2026-08-30");
  });

  it("LEGAL-4: names the real legal entity (FYRA SERVICES INC.), not a placeholder", () => {
    expect(enText).toContain("FYRA SERVICES INC.");
    expect(frText).toContain("FYRA SERVICES INC.");
    expect(enText).not.toContain("[LEGAL CORPORATE NAME");
    expect(enText).not.toContain("[INSERT FULL LEGAL CORPORATE NAME]");
  });

  it("LEGAL-5: provides the real legal contact email, not a placeholder", () => {
    expect(enText).toContain("legal@futuretutor.ca");
    expect(frText).toContain("legal@futuretutor.ca");
    expect(enText).not.toMatch(/\[support@futuretutor\.ca or legal@futuretutor\.ca\]/);
  });

  it("LEGAL-6: provides the real Alberta, Canada mailing address, not a placeholder", () => {
    expect(enText).toContain("8830 62e Ave NW");
    expect(enText).toContain("Edmonton, AB T6E 0C8");
    expect(frText).toContain("8830 62e Ave NW");
    expect(enText).not.toContain("[INSERT BUSINESS MAILING ADDRESS]");
  });

  it("LEGAL-7: states the 48-hour, 100% refund cancellation boundary", () => {
    expect(enText).toContain("48 hours or more before the scheduled session");
    expect(enText).toContain("100% refund");
    expect(frText).toContain("48 heures ou plus avant la séance prévue");
    expect(frText).toContain("100 %");
  });

  it("LEGAL-8: states the 24-48 hour, 50% refund cancellation boundary", () => {
    expect(enText).toContain("24 hours or more but less than 48 hours before the scheduled session");
    expect(enText).toContain("50% refund");
    expect(frText).toContain("50 %");
  });

  it("LEGAL-9: states the under-24-hour, no-refund cancellation boundary", () => {
    expect(enText).toContain("Less than 24 hours before the scheduled session");
    expect(enText).toContain("No refund");
    expect(frText).toContain("aucun remboursement");
  });

  it("LEGAL-10: covers minors and Parent/Guardian consent, including the under-13 rule", () => {
    expect(enText).toContain("under 13");
    expect(enText).toContain("Parent or legal Guardian");
    expect(frText).toContain("moins de 13 ans");
    expect(frText).toContain("Parent ou Tuteur légal");
  });

  it("LEGAL-11: includes the Québec French-availability language provision (not a simplistic English-prevails clause)", () => {
    expect(enText).toContain("Charter of the French Language");
    expect(enText).not.toMatch(/English version (shall |will )?prevail/i);
    expect(frText).toContain("Charte de la langue française");
  });

  it("LEGAL-12: includes the Québec / mandatory-rights carve-out in the Governing Law section", () => {
    const governingLaw = termsContentEn.sections.find((s) => s.number === 54)!;
    const text = flatten(governingLaw.blocks);
    expect(text).toContain("Québec");
    expect(text).toContain("non-waivable");
    const governingLawFr = termsContentFr.sections.find((s) => s.number === 54)!;
    expect(flatten(governingLawFr.blocks)).toContain("Québec");
  });

  it("does not claim an Alberta forum clause eliminates a Québec consumer's mandatory jurisdictional rights", () => {
    const disputeResolution = termsContentEn.sections.find((s) => s.number === 55)!;
    const text = flatten(disputeResolution.blocks);
    expect(text).toContain("Subject to any mandatory consumer rights or jurisdictional rules");
  });

  it("LEGAL-13: English and French have identical section numbering and count (full structural parity)", () => {
    expect(termsContentFr.sections.length).toBe(termsContentEn.sections.length);
    const enNumbers = termsContentEn.sections.map((s) => s.number);
    const frNumbers = termsContentFr.sections.map((s) => s.number);
    expect(frNumbers).toEqual(enNumbers);
    expect(enNumbers.length).toBe(65);
  });

  it("every English section has a non-empty French counterpart (real translation, not an empty stub)", () => {
    for (const enSection of termsContentEn.sections) {
      const frSection = termsContentFr.sections.find((s) => s.number === enSection.number);
      expect(frSection, `missing FR section ${enSection.number}`).toBeDefined();
      expect(frSection!.blocks.length).toBeGreaterThan(0);
      expect(flatten(frSection!.blocks).length).toBeGreaterThan(20);
    }
  });

  it("LEGAL-16: no placeholder Terms text remains anywhere in the content", () => {
    expect(enText).not.toMatch(/is being finalized/i);
    expect(enText).not.toMatch(/\[DATE TO BE INSERTED\]/);
    expect(frText).not.toMatch(/est en cours de finalisation/i);
  });

  it("preserves the mandatory-law liability carve-out and the exact CAD $100 / 6-month cap", () => {
    const liability = termsContentEn.sections.find((s) => s.number === 52)!;
    const text = flatten(liability.blocks);
    expect(text).toContain("CAD $100");
    expect(text).toContain("six (6) months");
    expect(text).toContain("cannot lawfully be excluded or limited");
  });

  it("states Tutors are independent service providers, not FutureTutor employees, in Nature of the Marketplace", () => {
    const nature = termsContentEn.sections.find((s) => s.number === 2)!;
    const text = flatten(nature.blocks);
    expect(text).toContain("independent service providers");
    expect(text).toContain("not employees of FutureTutor");
    const natureFr = termsContentFr.sections.find((s) => s.number === 2)!;
    expect(flatten(natureFr.blocks)).toContain("prestataires de services indépendants");
  });

  it("does not use the incorrect product name \"FutureTuteur\"", () => {
    expect(enText).not.toContain("FutureTuteur");
    expect(frText).not.toContain("FutureTuteur");
  });
});

describe("Terms page + signup surfaces — FG-LEGAL1A", () => {
  const termsPage = readFileSync("src/app/[locale]/terms/page.tsx", "utf8");
  const signupForm = readFileSync("src/components/marketing/SignupForm.tsx", "utf8");

  it("terms page renders real content (LegalDocument), not the ComingSoon placeholder", () => {
    expect(termsPage).toContain("LegalDocument");
    expect(termsPage).not.toContain("ComingSoon");
  });

  it("terms page selects locale-appropriate content", () => {
    expect(termsPage).toContain("termsContentFr");
    expect(termsPage).toContain("termsContentEn");
  });

  it("LEGAL-14: signup form links to the real Terms page", () => {
    expect(signupForm).toContain('href="/terms"');
  });

  it("signup form requires explicit Terms acceptance before submission", () => {
    expect(signupForm).toContain('name="termsAccepted"');
    expect(signupForm).toContain("required");
  });
});
