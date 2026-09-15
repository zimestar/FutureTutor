import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// DATA-1 — source-level regression coverage for the real call sites this
// mission touched: proves the free-text/PII fix in TutorSearch actually
// landed, that the four Tier-1 pages wire TrackPageView with the correct
// event, and that no analytics file reaches into financial code.

const root = join(__dirname, "..", "..");

describe("Header.tsx CTA tracking", () => {
  const source = readFileSync(join(root, "components", "marketing", "Header.tsx"), "utf8");

  it("uses the current event names, not the retired find_tutor_clicked", () => {
    expect(source).toContain("find_tutor_cta_clicked");
    expect(source).not.toContain('"find_tutor_clicked"');
  });

  it("never sends a free-text 'source' property (replaced by the closed cta_location enum)", () => {
    expect(source).not.toMatch(/trackEvent\([^)]*\{\s*source:/);
  });
});

describe("TutorSearch.tsx PII fix", () => {
  const source = readFileSync(join(root, "components", "marketing", "TutorSearch.tsx"), "utf8");

  it("never sends the free-text subject search query to analytics", () => {
    expect(source).not.toMatch(/trackEvent\("search_started",\s*\{\s*subject/);
  });
});

describe("TrackPageView wiring on the four Tier-1 page types", () => {
  it.each([
    { file: ["app", "[locale]", "find-tutors", "page.tsx"], event: "futuretutor_page_view" },
    { file: ["app", "[locale]", "tutoring", "[city]", "page.tsx"], event: "local_landing_viewed" },
    { file: ["app", "[locale]", "resources", "[slug]", "page.tsx"], event: "resource_article_viewed" },
    { file: ["app", "[locale]", "subjects", "[subject]", "page.tsx"], event: "subject_page_viewed" },
  ])("$file emits $event", ({ file, event }) => {
    const source = readFileSync(join(root, ...file), "utf8");
    expect(source).toContain("TrackPageView");
    expect(source).toContain(`event="${event}"`);
  });
});

describe("financial reachability — zero across the entire analytics module", () => {
  // piiDenylist.ts is deliberately excluded: its entire purpose is naming
  // forbidden property-name strings like "stripeaccountid"/"paymentintent"
  // so they can be blocked — that's the denylist working as intended, not
  // a financial-code reference.
  const files = ["types.ts", "slugGuards.ts", "routePolicy.ts", "consent.ts", "environment.ts", "vendors.ts", "track.ts", "index.ts"];

  it.each(files)("%s never references Stripe/payment/pricing/financial symbols", (file) => {
    const source = readFileSync(join(__dirname, file), "utf8");
    expect(source).not.toMatch(/stripe|calculateCustomerPrice|TutorEarning|TutorTransfer|refund|payout/i);
  });

  it("piiDenylist.ts's only financial-adjacent strings are the denylisted property names themselves, not usage", () => {
    const source = readFileSync(join(__dirname, "piiDenylist.ts"), "utf8");
    expect(source).not.toMatch(/import.*stripe|calculateCustomerPrice|TutorEarning|TutorTransfer/i);
  });
});
