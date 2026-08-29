import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { privacyContentEn, PRIVACY_VERSION } from "./privacyContent.en";
import { privacyContentFr } from "./privacyContent.fr";
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

function fullText(doc: typeof privacyContentEn): string {
  return doc.sections.map((s) => `${s.heading} ${flatten(s.blocks)}`).join(" ");
}

describe("Privacy Policy content — FG-LEGAL1B", () => {
  const enText = fullText(privacyContentEn);
  const frText = fullText(privacyContentFr);

  it("PRIV-04: has the real Effective Date, not a placeholder", () => {
    expect(privacyContentEn.effectiveDate).toBe("August 30, 2026");
    expect(privacyContentFr.effectiveDate).toBe("30 août 2026");
  });

  it("PRIV-05: has the real Last Updated date", () => {
    expect(privacyContentEn.lastUpdated).toBe("August 30, 2026");
    expect(privacyContentFr.lastUpdated).toBe("30 août 2026");
  });

  it("PRIVACY_VERSION matches the Effective Date convention", () => {
    expect(PRIVACY_VERSION).toBe("2026-08-30");
  });

  it("PRIV-06: names the real legal entity (FYRA SERVICES INC.)", () => {
    expect(enText).toContain("FYRA SERVICES INC.");
    expect(frText).toContain("FYRA SERVICES INC.");
  });

  it("PRIV-07: provides the real Alberta, Canada address", () => {
    expect(enText).toContain("8830 62e Ave NW");
    expect(enText).toContain("Edmonton, Alberta T6E 0C8");
    expect(frText).toContain("8830 62e Ave NW");
  });

  it("PRIV-08: provides the real privacy contact email", () => {
    expect(enText).toContain("legal@futuretutor.ca");
    expect(frText).toContain("legal@futuretutor.ca");
  });

  it("PRIV-09/10: covers minors and the under-13 Guardian model", () => {
    expect(enText).toContain("under 13");
    expect(enText).toContain("Parent or legal Guardian");
    expect(frText).toContain("moins de 13 ans");
  });

  it("PRIV-11: has a real Tutor information section", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 8)!;
    expect(section.heading).toBe("Tutor Information");
    expect(flatten(section.blocks)).toContain("diplomas");
  });

  it("PRIV-12: has a real Student information section", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 5)!;
    expect(section.heading).toBe("Student Information");
  });

  it("PRIV-13: has a real Parent/Guardian information section", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 6)!;
    expect(section.heading).toBe("Parent and Guardian Information");
  });

  it("PRIV-14/17: Student Reliability Score is private/operational and never a direct pricing factor", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 10)!;
    const text = flatten(section.blocks);
    expect(text).toContain("not intended to assess intelligence");
    expect(text).toContain("not intended to diagnose any condition");
    expect(text).toContain("does not currently use Student Reliability Score as a direct customer-pricing factor");
  });

  it("PRIV-15: Tutor Internal Score is described as private, formulas not disclosed", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 9)!;
    const text = flatten(section.blocks);
    expect(text).toContain("Internal Tutor Scores");
    expect(text).not.toMatch(/weight|formula.*=/i);
  });

  it("PRIV-16: Match Score is described as request-specific, not a compatibility guarantee", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 12)!;
    expect(flatten(section.blocks)).toContain("do not guarantee educational results or personal compatibility");
  });

  it("PRIV-18: makes no claim that FutureTutor uses AI", () => {
    expect(enText).not.toMatch(/FutureTutor (uses|currently uses|employs) (artificial intelligence|AI)\b/i);
    expect(enText).toContain("does not currently use artificial intelligence");
  });

  it("PRIV-19: makes no claim of GPS/continuous location tracking", () => {
    expect(enText).toContain("currently does not require continuous GPS tracking");
    expect(enText).not.toMatch(/FutureTutor (uses|tracks|collects) (your |real-time )?GPS\b/i);
  });

  it("PRIV-20/21: accurately describes approximate pre-confirmation vs exact post-confirmation location disclosure", () => {
    const duringMatching = privacyContentEn.sections.find((s) => s.number === 14)!;
    expect(flatten(duringMatching.blocks)).toContain("limited or approximate location information");
    const exactDisclosure = privacyContentEn.sections.find((s) => s.number === 15)!;
    expect(flatten(exactDisclosure.blocks)).toContain("authoritatively confirmed");
  });

  it("PRIV-22: Arrival Instructions privacy is present", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 16)!;
    expect(section.heading).toBe("Arrival Instructions");
  });

  it("PRIV-23/24: Daily is disclosed, and no routine recording is claimed", () => {
    expect(enText).toContain("Daily");
    expect(enText).toContain("does not currently provide routine recording");
    expect(enText).not.toMatch(/sessions are recorded/i);
  });

  it("PRIV-25/26: Stripe and Stripe Connect are disclosed", () => {
    expect(enText).toContain("Stripe");
    expect(enText).toContain("Stripe Connect");
  });

  it("PRIV-27/28/29: Resend, Railway, and Supabase are all disclosed as service providers", () => {
    const providers = privacyContentEn.sections.find((s) => s.number === 32)!;
    const text = flatten(providers.blocks);
    expect(text).toContain("Resend");
    expect(text).toContain("Railway");
    expect(text).toContain("Supabase");
  });

  it("does not claim FutureTutor stores full card numbers", () => {
    expect(enText).not.toMatch(/FutureTutor (stores|retains) (full|complete) (card|payment card) numbers/i);
    expect(enText).toContain("may not be stored in full by FutureTutor");
  });

  it("PRIV-30: a cross-border processing section is present", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 42)!;
    expect(section.heading).toBe("Processing Outside Canada");
    expect(flatten(section.blocks)).toContain("outside Canada");
  });

  it("does not promise Canadian-only data residency", () => {
    expect(enText).not.toMatch(/data (never leaves|stays within) Canada/i);
    expect(enText).not.toMatch(/Canadian-only servers/i);
  });

  it("PRIV-31: no fixed/invented retention period is stated (purpose-based retention only)", () => {
    expect(enText).not.toMatch(/\b\d+\s*(days|months|years)\b.*retent/i);
    expect(enText).not.toMatch(/retain.*for\s+\d+\s*(days|months|years)/i);
    expect(enText).toContain("only for as long as reasonably necessary");
  });

  it("PRIV-32: account deletion requests route to legal@futuretutor.ca, not a fabricated self-service flow", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 44)!;
    const text = flatten(section.blocks);
    expect(text).toContain("legal@futuretutor.ca");
    expect(enText).not.toMatch(/click ["“]?delete account["”]? in settings/i);
  });

  it("PRIV-33: security language uses no absolute guarantee", () => {
    expect(enText).not.toMatch(/100% secure/i);
    // The only acceptable form is the negated one ("cannot guarantee...") —
    // an unhedged positive claim ("FutureTutor guarantees security") would
    // be the real defect this test exists to catch.
    expect(enText).not.toMatch(/(?<!cannot )guarantees? (absolute |complete )?security/i);
    expect(enText).toContain("cannot guarantee absolute security");
    expect(enText).not.toContain("ISO 27001");
    expect(enText).not.toContain("SOC 2");
  });

  it("PRIV-34: a breach/incident response section is present", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 49)!;
    expect(section.heading).toBe("Security Incidents");
  });

  it("PRIV-35: a Québec section is present with the mandatory carve-out language", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 56)!;
    expect(section.heading).toBe("Québec Residents");
    expect(frText).toContain("Résidents du Québec");
  });

  it("does not invent a named Québec privacy officer", () => {
    const section = privacyContentEn.sections.find((s) => s.number === 58)!;
    const text = flatten(section.blocks);
    expect(text).toContain("The person exercising the highest authority");
    expect(text).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+ (is|serves as) FutureTutor's (Privacy Officer|privacy officer)/);
  });

  it("PRIV-36/37: French and English have identical section numbering, count, and full structural parity", () => {
    expect(privacyContentFr.sections.length).toBe(privacyContentEn.sections.length);
    expect(privacyContentEn.sections.length).toBe(70);
    const enNumbers = privacyContentEn.sections.map((s) => s.number);
    const frNumbers = privacyContentFr.sections.map((s) => s.number);
    expect(frNumbers).toEqual(enNumbers);
  });

  it("every English section has a non-empty, substantive French counterpart", () => {
    for (const enSection of privacyContentEn.sections) {
      const frSection = privacyContentFr.sections.find((s) => s.number === enSection.number);
      expect(frSection, `missing FR section ${enSection.number}`).toBeDefined();
      expect(flatten(frSection!.blocks).length).toBeGreaterThan(20);
    }
  });

  it("PRIV-43: no placeholder Privacy Policy text remains anywhere in the content", () => {
    expect(enText).not.toMatch(/is being finalized/i);
    expect(frText).not.toMatch(/est en cours de finalisation/i);
  });

  it("PRIV-44/45: no behavioural-advertising or data-sale claim inconsistent with the audited repository", () => {
    expect(enText).toContain("does not currently sell");
    expect(enText).toContain("does not currently use children's personal information for behavioural advertising");
    expect(enText).not.toMatch(/we sell your (personal )?(information|data)/i);
  });

  it("does not use the incorrect product name \"FutureTuteur\"", () => {
    expect(enText).not.toContain("FutureTuteur");
    expect(frText).not.toContain("FutureTuteur");
  });
});

describe("Privacy page + signup surfaces — FG-LEGAL1B", () => {
  const privacyPage = readFileSync("src/app/[locale]/privacy/page.tsx", "utf8");
  const signupForm = readFileSync("src/components/marketing/SignupForm.tsx", "utf8");

  it("privacy page renders real content (LegalDocument), not the ComingSoon placeholder", () => {
    expect(privacyPage).toContain("LegalDocument");
    expect(privacyPage).not.toContain("ComingSoon");
  });

  it("privacy page selects locale-appropriate content", () => {
    expect(privacyPage).toContain("privacyContentFr");
    expect(privacyPage).toContain("privacyContentEn");
  });

  it("PRIV-39/40: signup form links to the real Privacy Policy, reachable before submitting", () => {
    expect(signupForm).toContain('href="/privacy"');
  });

  it("PRIV-46: the Terms link on signup is unchanged (still present alongside the new Privacy link)", () => {
    expect(signupForm).toContain('href="/terms"');
    expect(signupForm).toContain('name="termsAccepted"');
  });
});
