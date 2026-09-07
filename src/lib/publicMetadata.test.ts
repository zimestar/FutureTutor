import { describe, expect, it } from "vitest";
import { publicPageMetadata } from "./publicMetadata";
import { site } from "@/content/site";
import { routing } from "@/i18n/routing";

// ANALYTICS-SEO1 — publicPageMetadata is the shared canonical/hreflang/
// Open Graph builder every real public marketing page should use (16 did
// already; this mission extended it to 5 more — terms/privacy/cookies/
// tutor-agreement/careers — that were previously falling back to the root
// layout's own homepage canonical, which would have told Google every one
// of those pages was a duplicate of the homepage).

describe("publicPageMetadata", () => {
  it("builds a self-referential canonical for the given locale+path, on the real production hostname", () => {
    const result = publicPageMetadata({ locale: "en", path: "/terms", title: "Terms", description: "d" });
    expect(result.alternates?.canonical).toBe("/en/terms");
  });

  it("the homepage path ('/') normalizes to no trailing segment, not '/en/'", () => {
    const result = publicPageMetadata({ locale: "en", path: "/", title: "Home", description: "d" });
    expect(result.alternates?.canonical).toBe("/en");
  });

  it("provides hreflang alternates for every configured locale, each pointing at that same page under its own locale prefix", () => {
    const result = publicPageMetadata({ locale: "en", path: "/privacy", title: "Privacy", description: "d" });
    const languages = result.alternates?.languages as Record<string, string>;
    for (const locale of routing.locales) {
      expect(languages[locale]).toBe(`/${locale}/privacy`);
    }
  });

  it("Open Graph url is an absolute URL on the real production hostname, never the non-existent www host", () => {
    const result = publicPageMetadata({ locale: "fr", path: "/cookies", title: "Cookies", description: "d" });
    expect(result.openGraph?.url).toBe(`${site.url}/fr/cookies`);
    expect(String(result.openGraph?.url)).not.toContain("www.futuretutor.ca");
  });

  it("Open Graph locale is fr_CA for fr and en_CA for en (Canadian French/English, not generic fr_FR)", () => {
    expect(publicPageMetadata({ locale: "fr", path: "/x", title: "t", description: "d" }).openGraph?.locale).toBe("fr_CA");
    expect(publicPageMetadata({ locale: "en", path: "/x", title: "t", description: "d" }).openGraph?.locale).toBe("en_CA");
  });
});
