import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { tutorAgreementContentEn, TUTOR_AGREEMENT_VERSION } from "./tutorAgreementContent.en";
import { tutorAgreementContentFr } from "./tutorAgreementContent.fr";
import type { LegalBlock } from "./types";

function flatten(blocks: LegalBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "p") return b.text;
      if (b.type === "table") return [b.headers.join(" "), ...b.rows.map((row) => row.join(" "))].join(" ");
      return b.items.join(" ");
    })
    .join(" ");
}

function fullText(doc: typeof tutorAgreementContentEn): string {
  return doc.sections.map((s) => `${s.heading} ${flatten(s.blocks)}`).join(" ");
}

describe("Tutor Agreement content — FG-LEGAL2", () => {
  const enText = fullText(tutorAgreementContentEn);
  const frText = fullText(tutorAgreementContentFr);

  it("TUTOR-LEGAL-04: has the real Effective Date, not a placeholder", () => {
    expect(tutorAgreementContentEn.effectiveDate).toBe("August 30, 2026");
    expect(tutorAgreementContentFr.effectiveDate).toBe("30 août 2026");
  });

  it("TUTOR-LEGAL-05: has the real Last Updated date", () => {
    expect(tutorAgreementContentEn.lastUpdated).toBe("August 30, 2026");
    expect(tutorAgreementContentFr.lastUpdated).toBe("30 août 2026");
  });

  it("TUTOR_AGREEMENT_VERSION matches the Effective Date convention", () => {
    expect(TUTOR_AGREEMENT_VERSION).toBe("2026-08-30");
  });

  it("TUTOR-LEGAL-06: names the real legal entity (FYRA SERVICES INC.)", () => {
    expect(enText).toContain("FYRA SERVICES INC.");
    expect(frText).toContain("FYRA SERVICES INC.");
  });

  it("TUTOR-LEGAL-07: provides the real Alberta, Canada address", () => {
    expect(enText).toContain("8830 62e Ave NW");
    expect(enText).toContain("Edmonton, Alberta T6E 0C8");
  });

  it("TUTOR-LEGAL-08: provides the real legal contact email", () => {
    expect(enText).toContain("legal@futuretutor.ca");
    expect(frText).toContain("legal@futuretutor.ca");
  });

  it("TUTOR-LEGAL-09: independent-provider clause present", () => {
    expect(enText).toContain("independent service provider and independent contractor");
    expect(enText).toContain("is intended to create");
  });

  it("TUTOR-LEGAL-10: non-exclusivity present", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 7)!;
    expect(section.heading).toBe("Non-Exclusivity");
    expect(flatten(section.blocks)).toContain("not required to provide tutoring services exclusively");
  });

  it("TUTOR-LEGAL-11: no minimum hours present", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 4)!;
    expect(section.heading).toBe("No Minimum Hours");
    expect(flatten(section.blocks)).toContain("does not guarantee Tutor any minimum number");
  });

  it("TUTOR-LEGAL-12: right to decline opportunities present", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 6)!;
    expect(flatten(section.blocks)).toContain("may accept or decline tutoring opportunities");
  });

  it("TUTOR-LEGAL-13: no guaranteed earnings present", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 104)!;
    expect(section.heading).toBe("No Guarantee of Opportunities");
  });

  it("TUTOR-LEGAL-14: Tutor payout independence present", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 24)!;
    expect(flatten(section.blocks)).toContain("independent Tutor Payout Engine");
  });

  it("TUTOR-LEGAL-15: customer price vs payout distinction present", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 26)!;
    expect(flatten(section.blocks)).toContain("Customer Price");
    expect(flatten(section.blocks)).toContain("Tutor Payout");
  });

  it("TUTOR-LEGAL-16: Stripe Connect section present", () => {
    expect(enText).toContain("Stripe Connect");
    expect(enText).toContain("Stripe Connected Account Agreement");
  });

  it("TUTOR-LEGAL-17: tax section present, no invented mandatory GST/HST claim", () => {
    expect(enText).toContain("responsible for determining and satisfying Tutor's own");
    expect(enText).toContain("represents that every Tutor is automatically required to register for GST/HST");
  });

  it("TUTOR-LEGAL-18: minor safety section present", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 44)!;
    expect(section.partTitle).toBe("Part XIII — Safeguarding Minors");
    expect(enText).toContain("Tutor must never engage in");
  });

  it("TUTOR-LEGAL-19: in-person privacy present, consistent with the certified IP1 model", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 51)!;
    expect(flatten(section.blocks)).toContain("approximate location information");
    const exact = tutorAgreementContentEn.sections.find((s) => s.number === 52)!;
    expect(flatten(exact.blocks)).toContain("after authoritative Booking confirmation");
  });

  it("TUTOR-LEGAL-20: Virtual Classroom rules present", () => {
    expect(enText).toContain("Daily");
    expect(enText).toContain("Virtual Classroom");
  });

  it("TUTOR-LEGAL-21: no unauthorized recording present, consistent with the certified no-recording model", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 60)!;
    const text = flatten(section.blocks);
    expect(text).toContain("must not independently record");
    expect(text).toContain("does not provide routine recording");
  });

  it("TUTOR-LEGAL-22: academic integrity present", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 43)!;
    expect(section.heading).toBe("Academic Integrity");
  });

  it("TUTOR-LEGAL-23: confidentiality present", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 73)!;
    expect(section.partTitle).toBe("Part XIX — Privacy and Confidentiality");
  });

  it("TUTOR-LEGAL-24: narrow non-circumvention present, not a general non-compete", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 92)!;
    expect(flatten(section.blocks)).toContain("Nothing in this Agreement prohibits Tutor from");
    const nonExclusive = tutorAgreementContentEn.sections.find((s) => s.number === 7)!;
    expect(flatten(nonExclusive.blocks)).toContain("Nothing in this Agreement creates a general non-compete obligation");
  });

  it("TUTOR-LEGAL-25: suspension present", () => {
    expect(enText).toContain("Temporary Suspension");
    expect(enText).toContain("Immediate Safety Suspension");
  });

  it("TUTOR-LEGAL-26: termination present", () => {
    expect(enText).toContain("FutureTutor Termination");
  });

  it("TUTOR-LEGAL-27: liability cap present with the correct CAD $100 / 6-month figures", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 118)!;
    const table = flatten(section.blocks);
    expect(table).toContain("six months");
    expect(table).toContain("CAD $100");
  });

  it("TUTOR-LEGAL-28: no mandatory arbitration", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 122)!;
    expect(flatten(section.blocks)).toContain("does not impose mandatory private arbitration");
  });

  it("TUTOR-LEGAL-29: no class-action waiver", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 123)!;
    expect(flatten(section.blocks)).toContain("does not impose a class-action waiver");
  });

  it("TUTOR-LEGAL-30: Québec section present with the established Law 96 language-choice principle", () => {
    expect(enText).toContain("Québec");
    const frenchVersion = tutorAgreementContentEn.sections.find((s) => s.number === 128)!;
    expect(flatten(frenchVersion.blocks)).toContain("complete French version");
    const languageChoice = tutorAgreementContentEn.sections.find((s) => s.number === 129)!;
    expect(flatten(languageChoice.blocks)).toContain("first been provided the French version");
  });

  it("TUTOR-LEGAL-31: all 6 Annexes (A-F) present as sections 157-162", () => {
    const annexNumbers = [157, 158, 159, 160, 161, 162];
    const expectedTitles = [
      "Annex A — Tutor Code of Conduct",
      "Annex B — Child Safety Standard",
      "Annex C — In-Person Tutoring Standard",
      "Annex D — Virtual Classroom Standard",
      "Annex E — Compensation Principles",
      "Annex F — Tutor Independence Principles",
    ];
    annexNumbers.forEach((num, i) => {
      const section = tutorAgreementContentEn.sections.find((s) => s.number === num)!;
      expect(section, `missing annex section ${num}`).toBeDefined();
      expect(section.partTitle).toBe(expectedTitles[i]);
    });
  });

  it("no invented background-check-performed claim (only 'may require', matching the audited absence)", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 17)!;
    const text = flatten(section.blocks);
    expect(text).toContain("may require Tutor to complete an appropriate background");
    expect(text).toContain("will not represent that a particular type of check is legally mandatory unless it actually is");
  });

  it("no invented insurance-mandatory claim (matching the audited absence)", () => {
    const section = tutorAgreementContentEn.sections.find((s) => s.number === 98)!;
    expect(flatten(section.blocks)).toContain("does not represent that every Tutor is legally required to maintain a particular commercial insurance policy");
  });

  it("TUTOR-LEGAL-32: French and English have identical section numbering, count, and full structural parity", () => {
    expect(tutorAgreementContentFr.sections.length).toBe(tutorAgreementContentEn.sections.length);
    expect(tutorAgreementContentEn.sections.length).toBe(162);
    const enNumbers = tutorAgreementContentEn.sections.map((s) => s.number);
    const frNumbers = tutorAgreementContentFr.sections.map((s) => s.number);
    expect(frNumbers).toEqual(enNumbers);
  });

  it("every English section has a non-empty, substantive French counterpart with matching block-type sequence", () => {
    for (const enSection of tutorAgreementContentEn.sections) {
      const frSection = tutorAgreementContentFr.sections.find((s) => s.number === enSection.number);
      expect(frSection, `missing FR section ${enSection.number}`).toBeDefined();
      expect(flatten(frSection!.blocks).length).toBeGreaterThan(20);
      expect(frSection!.blocks.map((b) => b.type)).toEqual(enSection.blocks.map((b) => b.type));
    }
  });

  it("every English partTitle has a translated French counterpart on the same section", () => {
    for (const enSection of tutorAgreementContentEn.sections) {
      if (!enSection.partTitle) continue;
      const frSection = tutorAgreementContentFr.sections.find((s) => s.number === enSection.number)!;
      expect(frSection.partTitle, `missing FR partTitle on section ${enSection.number}`).toBeDefined();
      expect(frSection.partTitle).not.toBe(enSection.partTitle);
    }
  });

  it("no placeholder Tutor Agreement text remains anywhere in the content", () => {
    expect(enText).not.toMatch(/is being finalized/i);
    expect(frText).not.toMatch(/est en cours de finalisation/i);
  });

  it("does not use the incorrect product name \"FutureTuteur\"", () => {
    expect(enText).not.toContain("FutureTuteur");
    expect(frText).not.toContain("FutureTuteur");
  });
});

describe("Tutor Agreement page + navigation surfaces — FG-LEGAL2", () => {
  const agreementPage = readFileSync("src/app/[locale]/tutor-agreement/page.tsx", "utf8");
  const termsPage = readFileSync("src/app/[locale]/terms/page.tsx", "utf8");
  const privacyPage = readFileSync("src/app/[locale]/privacy/page.tsx", "utf8");
  const cookiesPage = readFileSync("src/app/[locale]/cookies/page.tsx", "utf8");
  const navigation = readFileSync("src/content/navigation.ts", "utf8");
  const tutorNav = readFileSync("src/lib/tutorNav.ts", "utf8");

  it("TUTOR-LEGAL-01/02/03: tutor-agreement page renders real content (LegalDocument), selects locale, requires no auth", () => {
    expect(agreementPage).toContain("LegalDocument");
    expect(agreementPage).not.toContain("ComingSoon");
    expect(agreementPage).toContain("tutorAgreementContentFr");
    expect(agreementPage).toContain("tutorAgreementContentEn");
    expect(agreementPage).not.toContain("auth()");
  });

  it("tutor-agreement page cross-links to Terms, Privacy, and Cookies", () => {
    expect(agreementPage).toContain('href: "/terms"');
    expect(agreementPage).toContain('href: "/privacy"');
    expect(agreementPage).toContain('href: "/cookies"');
  });

  it("Terms, Privacy, and Cookies pages now also link to the Tutor Agreement", () => {
    expect(termsPage).toContain('href: "/tutor-agreement"');
    expect(privacyPage).toContain('href: "/tutor-agreement"');
    expect(cookiesPage).toContain('href: "/tutor-agreement"');
  });

  it("§68: footer legal navigation exposes a Tutor Agreement link", () => {
    expect(navigation).toContain('href: "/tutor-agreement"');
  });

  it("§65: tutor dashboard navigation exposes a Tutor Agreement link in both onboarding and approved modes", () => {
    const matches = tutorNav.match(/\/tutor-agreement/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("§69: Student/Parent signup is not cluttered with Tutor Agreement acceptance", () => {
    const signupForm = readFileSync("src/components/marketing/SignupForm.tsx", "utf8");
    expect(signupForm).not.toContain("tutorAgreementAccepted");
  });

  it("FG-001/FG-LEGAL1C remain unaffected — all three prior legal pages still use LegalDocument", () => {
    expect(termsPage).toContain("LegalDocument");
    expect(privacyPage).toContain("LegalDocument");
    expect(cookiesPage).toContain("LegalDocument");
  });

  it("TUTOR-ACC-13: direct booking's createBookingAction gates on Tutor Agreement acceptance (a real Server Action, not exercised by plain vitest integration tests — verified by source inspection instead, matching this codebase's own established convention for that layer)", () => {
    const bookingsAction = readFileSync("src/lib/actions/bookings.ts", "utf8");
    expect(bookingsAction).toContain("tutorProfile.tutorAgreementAcceptedAt");
    expect(bookingsAction).toContain("tutorUnavailable");
  });

  it("Quick Match's acceptTutorInvitationAction relies on tutorEligibility.ts's own gate, not a duplicate check here (avoids the same shared-fixture breakage the direct-booking check required moving out of bookingCreation.ts)", () => {
    const tutorInvitationsAction = readFileSync("src/lib/actions/tutorInvitations.ts", "utf8");
    expect(tutorInvitationsAction).not.toContain("tutorAgreementAcceptedAt");
  });

  it("reserveBookingPendingPayment (shared low-level service, used as direct fixture scaffolding by dozens of unrelated integration tests) does not itself gate on Tutor Agreement acceptance", () => {
    const bookingCreationService = readFileSync("src/services/bookingCreation.ts", "utf8");
    expect(bookingCreationService).not.toContain("tutorAgreementAcceptedAt");
  });
});
