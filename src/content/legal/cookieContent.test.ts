import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { cookieContentEn, COOKIE_POLICY_VERSION } from "./cookieContent.en";
import { cookieContentFr } from "./cookieContent.fr";
import { termsContentEn, TERMS_VERSION } from "./termsContent.en";
import { privacyContentEn, PRIVACY_VERSION } from "./privacyContent.en";
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

function fullText(doc: typeof cookieContentEn): string {
  return doc.sections.map((s) => `${s.heading} ${flatten(s.blocks)}`).join(" ");
}

describe("Cookie Policy content — FG-LEGAL1C", () => {
  const enText = fullText(cookieContentEn);
  const frText = fullText(cookieContentFr);

  it("COOKIE-04: has the real Effective Date, not a placeholder", () => {
    expect(cookieContentEn.effectiveDate).toBe("August 30, 2026");
    expect(cookieContentFr.effectiveDate).toBe("30 août 2026");
  });

  it("COOKIE-05: has the real Last Updated date", () => {
    expect(cookieContentEn.lastUpdated).toBe("August 30, 2026");
    expect(cookieContentFr.lastUpdated).toBe("30 août 2026");
  });

  it("COOKIE_POLICY_VERSION matches the Effective Date convention", () => {
    expect(COOKIE_POLICY_VERSION).toBe("2026-08-30");
  });

  it("COOKIE-06: names the real legal entity (FYRA SERVICES INC.)", () => {
    expect(enText).toContain("FYRA SERVICES INC.");
    expect(frText).toContain("FYRA SERVICES INC.");
  });

  it("COOKIE-07: provides the real Alberta, Canada address", () => {
    expect(enText).toContain("8830 62e Ave NW");
    expect(enText).toContain("Edmonton, Alberta T6E 0C8");
  });

  it("COOKIE-08: provides the real legal contact email", () => {
    expect(enText).toContain("legal@futuretutor.ca");
    expect(frText).toContain("legal@futuretutor.ca");
  });

  it("COOKIE-15: no placeholder Cookie Policy text remains anywhere in the content", () => {
    expect(enText).not.toMatch(/is being finalized/i);
    expect(frText).not.toMatch(/est en cours de finalisation/i);
  });

  it("distinguishes strictly necessary cookies from optional ones (essential cookies section present)", () => {
    const section = cookieContentEn.sections.find((s) => s.number === 4)!;
    expect(section.heading).toBe("Strictly Necessary Cookies");
  });

  it("Auth.js is named as part of the authentication architecture", () => {
    expect(enText).toContain("Auth.js");
  });

  it("COOKIE-20/21: no service worker or aggressive PWA private-data caching is claimed", () => {
    expect(enText).toContain("currently does not use a service worker");
    expect(enText).not.toMatch(/FutureTutor (uses|currently uses) a service worker/i);
  });

  it("COOKIE-29: makes no claim of continuous GPS tracking, consistent with the Privacy Policy", () => {
    expect(enText).toContain("does not currently require continuous GPS tracking");
    expect(enText).not.toMatch(/FutureTutor (uses|tracks|collects) (your |real-time )?GPS\b/i);
  });

  it("COOKIE-23/24/30: makes no behavioural-advertising, remarketing, or advertising-pixel claim", () => {
    expect(enText).toContain("does not currently use cookies for behavioural advertising");
    expect(enText).toContain("does not currently use remarketing cookies or pixels");
    expect(enText).not.toMatch(/FutureTutor (uses|currently uses) (behavioural advertising|remarketing) cookies/i);
  });

  it("COOKIE-31: children are not behaviourally profiled for advertising", () => {
    expect(enText).toContain("does not currently use children's personal information for behavioural advertising");
  });

  it("COOKIE-26/27/28: names Stripe, Daily, and Resend without inventing exact cookie names", () => {
    expect(enText).toContain("FutureTutor uses Stripe for payment processing");
    expect(enText).toContain("FutureTutor currently uses Daily to provide Virtual Classroom technology");
    expect(enText).toContain("FutureTutor currently uses Resend for transactional email delivery");
    expect(enText).not.toMatch(/__stripe_(mid|sid)/);
  });

  it("all 5 known service providers are named", () => {
    for (const provider of ["Stripe", "Daily", "Resend", "Railway", "Supabase"]) {
      expect(enText).toContain(provider);
    }
  });

  it("includes the current-practices summary table with the expected headers", () => {
    const section = cookieContentEn.sections.find((s) => s.number === 45)!;
    const table = section.blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    if (table?.type === "table") {
      expect(table.headers).toEqual(["Technology / Purpose", "Current Position"]);
      expect(table.rows.length).toBe(13);
      for (const row of table.rows) {
        expect(row.length).toBe(table.headers.length);
      }
    }
  });

  it("Québec section is present and does not invent a named privacy officer", () => {
    expect(enText).toContain("Québec");
    expect(enText).toContain("Commission d'accès à l'information");
    expect(enText).not.toMatch(/privacy officer.*is\s+[A-Z][a-z]+\s+[A-Z][a-z]+/);
  });

  it("links to the Privacy Policy for full retention/security/rights detail rather than duplicating it", () => {
    const section = cookieContentEn.sections.find((s) => s.number === 43)!;
    expect(flatten(section.blocks)).toContain("Privacy Policy");
  });

  it("COOKIE-34: French and English have identical section numbering, count, and full structural parity", () => {
    expect(cookieContentFr.sections.length).toBe(cookieContentEn.sections.length);
    expect(cookieContentEn.sections.length).toBe(46);
    const enNumbers = cookieContentEn.sections.map((s) => s.number);
    const frNumbers = cookieContentFr.sections.map((s) => s.number);
    expect(frNumbers).toEqual(enNumbers);
  });

  it("every English section has a non-empty, substantive French counterpart", () => {
    for (const enSection of cookieContentEn.sections) {
      const frSection = cookieContentFr.sections.find((s) => s.number === enSection.number);
      expect(frSection, `missing FR section ${enSection.number}`).toBeDefined();
      expect(flatten(frSection!.blocks).length).toBeGreaterThan(20);
    }
  });

  it("does not use the incorrect product name \"FutureTuteur\"", () => {
    expect(enText).not.toContain("FutureTuteur");
    expect(frText).not.toContain("FutureTuteur");
  });

  it("COOKIE-35/36: Terms of Service and Privacy Policy content are unchanged by this mission", () => {
    expect(TERMS_VERSION).toBe("2026-08-30");
    expect(PRIVACY_VERSION).toBe("2026-08-30");
    expect(termsContentEn.sections.length).toBe(65);
    expect(privacyContentEn.sections.length).toBe(70);
  });
});

describe("Cookie Policy page + legal navigation surfaces — FG-LEGAL1C", () => {
  const cookiesPage = readFileSync("src/app/[locale]/cookies/page.tsx", "utf8");
  const termsPage = readFileSync("src/app/[locale]/terms/page.tsx", "utf8");
  const privacyPage = readFileSync("src/app/[locale]/privacy/page.tsx", "utf8");
  const navigation = readFileSync("src/content/navigation.ts", "utf8");

  it("COOKIE-01/15: cookies page renders real content (LegalDocument), not the ComingSoon placeholder", () => {
    expect(cookiesPage).toContain("LegalDocument");
    expect(cookiesPage).not.toContain("ComingSoon");
  });

  it("COOKIE-02: cookies page selects locale-appropriate content", () => {
    expect(cookiesPage).toContain("cookieContentFr");
    expect(cookiesPage).toContain("cookieContentEn");
  });

  it("COOKIE-03: cookies page requires no authentication (public marketing route, no auth() call)", () => {
    expect(cookiesPage).not.toContain("auth()");
    expect(cookiesPage).not.toContain("getServerSession");
  });

  it("COOKIE-09/10: cookies page links to both Terms and Privacy", () => {
    expect(cookiesPage).toContain('href: "/terms"');
    expect(cookiesPage).toContain('href: "/privacy"');
  });

  it("Terms and Privacy pages now also link to the Cookie Policy", () => {
    expect(termsPage).toContain('href: "/cookies"');
    expect(privacyPage).toContain('href: "/cookies"');
  });

  it("COOKIE-11/12: footer navigation already exposes a Cookie Policy link for both locales (shared config)", () => {
    expect(navigation).toContain('href: "/cookies"');
  });

  it("COOKIE-37: FG-001 (Terms + Privacy) remains unaffected — both pages still use LegalDocument", () => {
    expect(termsPage).toContain("LegalDocument");
    expect(termsPage).not.toContain("ComingSoon");
    expect(privacyPage).toContain("LegalDocument");
    expect(privacyPage).not.toContain("ComingSoon");
  });
});

describe("Cookie Policy technical inventory regression guards — FG-LEGAL1C", () => {
  it("COOKIE-20: no service worker files exist", () => {
    expect(existsSync("public/sw.js")).toBe(false);
    expect(existsSync("public/service-worker.js")).toBe(false);
    expect(existsSync("src/app/sw.ts")).toBe(false);
  });

  it("COOKIE-22: analytics.ts remains a first-party, non-transmitting stub (no real provider wired)", () => {
    const analytics = readFileSync("src/lib/analytics.ts", "utf8");
    expect(analytics).not.toMatch(/fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
    // Providers are only named in the file's own doc comment as illustrative
    // future options ("Swap the implementation for a real provider... when
    // one is chosen") — this asserts none is actually imported or invoked.
    expect(analytics).not.toMatch(/^\s*import .*(posthog|mixpanel|amplitude|segment|gtag)/im);
    expect(analytics).not.toMatch(/(posthog|mixpanel|amplitude)\.(capture|track|init)/i);
  });
});
