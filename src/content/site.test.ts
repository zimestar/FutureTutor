import { describe, expect, it } from "vitest";
import { site } from "./site";

// ANALYTICS-SEO1 — site.url is the sole upstream source for metadataBase,
// canonical/hreflang tags, Open Graph, JSON-LD, sitemap.xml, robots.txt's
// Sitemap: directive, and resolveBookingEmailBaseUrl.ts (real booking/
// session-reminder email CTA links). This mission live-verified (DNS
// lookup + Railway's own configured custom domain) that
// "https://www.futuretutor.ca" has NO DNS record at all — a pure
// documentation-enforcing regression test so this specific, real,
// production-breaking mistake can never silently return.

describe("site.url", () => {
  it("is the real, DNS-resolving apex production domain, never the non-existent www subdomain", () => {
    expect(site.url).toBe("https://futuretutor.ca");
    expect(site.url).not.toContain("www.");
  });

  it("is HTTPS, has no trailing slash, and is a valid absolute URL (every consumer appends its own leading-slash path)", () => {
    expect(() => new URL(site.url)).not.toThrow();
    expect(site.url.startsWith("https://")).toBe(true);
    expect(site.url.endsWith("/")).toBe(false);
  });
});

// SEO-1 — the single shared Open Graph/Twitter share image reference.
describe("site.ogImage", () => {
  it("is a root-relative path (never a hardcoded absolute URL with its own, possibly-wrong host)", () => {
    expect(site.ogImage.url.startsWith("/")).toBe(true);
    expect(site.ogImage.url).not.toContain("http");
  });

  it("declares real, positive width/height so platforms can size the preview correctly", () => {
    expect(site.ogImage.width).toBeGreaterThan(0);
    expect(site.ogImage.height).toBeGreaterThan(0);
  });
});
