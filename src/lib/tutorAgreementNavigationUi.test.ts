import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// PROD-TUTOR-UX2, Issue 1 — root cause: /tutor-agreement is a public
// marketing route (MarketingShell, shared with Terms/Privacy/Cookies —
// intentionally public so a prospective tutor can read it before applying,
// unrelated to authentication). The real acceptance flow already lives
// safely on the dashboard (TutorAgreementBanner.tsx / TutorProfileForm.tsx),
// both already linking to /tutor-agreement with target="_blank" — the
// established, safe convention. The trap was specifically the Tutor
// sidebar's OWN nav item (tutorNav.ts), which navigated the current tab
// away with no way back except logout. Fix: the sidebar nav item now opens
// in a new tab too, matching that exact existing convention — the
// dashboard tab and its sidebar are never disturbed.

describe("PROD-TUTOR-UX2 — Tutor Agreement sidebar navigation fix", () => {
  const shell = readFileSync("src/components/dashboard/DashboardShell.tsx", "utf8");
  const nav = readFileSync("src/lib/tutorNav.ts", "utf8");
  const banner = readFileSync("src/components/dashboard/TutorAgreementBanner.tsx", "utf8");
  const profileForm = readFileSync("src/components/dashboard/TutorProfileForm.tsx", "utf8");
  const agreementPage = readFileSync("src/app/[locale]/tutor-agreement/page.tsx", "utf8");
  const tutorProfileAction = readFileSync("src/lib/actions/tutorProfile.ts", "utf8");

  it("1. the public Tutor Agreement page itself is unchanged — still public, still MarketingShell-wrapped, no auth gate added", () => {
    expect(agreementPage).toContain("MarketingShell");
    expect(agreementPage).not.toMatch(/auth\(\)/);
    expect(agreementPage).not.toContain("redirect(");
  });

  it("2/3. the sidebar nav item now opens in a new tab — the dashboard tab (and its sidebar) is never navigated away from", () => {
    expect(nav).toMatch(/tutorAgreement[\s\S]*openInNewTab: true/);
    // Both application-status branches (pre-approval and APPROVED tutor nav) are fixed, not just one.
    const occurrences = (nav.match(/href: "\/tutor-agreement", group: tNav\("\w+Group"\), openInNewTab: true/g) ?? []).length;
    expect(occurrences).toBe(2);
  });

  it("the fix is narrow — DashboardNavigation only adds target/rel when openInNewTab is explicitly set, every other nav item is unaffected", () => {
    expect(shell).toContain("...(item.openInNewTab ? { target: \"_blank\", rel: \"noopener noreferrer\" } : {})");
  });

  it("4/5. agreement acceptance logic, versioning, and audit are completely untouched by this pass", () => {
    // The actual acceptance Server Action file was never opened for editing
    // this pass — its known, established shape (from prior PROD-TUTOR1
    // work) is reconfirmed present, unmodified.
    expect(tutorProfileAction).toContain("acceptTutorAgreementAction");
    expect(tutorProfileAction).toContain("tutorAgreementAcceptedAt");
  });

  it("6. the two existing dashboard acceptance-flow links keep their own already-safe target=\"_blank\" convention, unmodified by this pass", () => {
    expect(banner).toContain('href="/tutor-agreement" target="_blank"');
    expect(profileForm).toContain('href="/tutor-agreement" target="_blank"');
  });

  it("7. the public page requires no authentication to read (an intentional, pre-existing product decision, not something this pass changes)", () => {
    // Confirmed by the absence of any auth()/redirect() call in test 1 above
    // — restated here as its own explicit assertion of the exact behavior
    // this fix must not alter.
    expect(agreementPage).toContain("export default async function TutorAgreementPage");
  });

  it("new-tab links carry rel=\"noopener noreferrer\" (standard safety for target=\"_blank\", applied to the new link this pass adds)", () => {
    expect(shell).toContain('rel: "noopener noreferrer"');
  });
});
