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

  // SEO-1 — regression coverage for the found-and-fixed defect: every page
  // built from this helper (essentially every public page in the app,
  // including the homepage) rendered with ZERO og:image/twitter:image in
  // production, because this helper's own openGraph/twitter objects
  // silently replaced (rather than extended) the root layout's image
  // metadata — Next.js metadata merging does not deep-merge sibling keys
  // like `openGraph.images` across a layout/page boundary when the page
  // defines its own `openGraph` object.
  it("SEO-1 — every page built from this helper carries a real Open Graph image, not silently zero", () => {
    const result = publicPageMetadata({ locale: "en", path: "/find-tutors", title: "t", description: "d" });
    const images = result.openGraph?.images as Array<{ url: string }> | undefined;
    expect(images).toBeDefined();
    expect(images!.length).toBeGreaterThan(0);
    expect(images![0].url).toBe(site.ogImage.url);
  });

  it("SEO-1 — Twitter card is summary_large_image with a real image, matching the root layout's own choice", () => {
    const result = publicPageMetadata({ locale: "en", path: "/about", title: "t", description: "d" });
    const twitter = result.twitter as { card?: string; images?: string[] } | undefined;
    expect(twitter?.card).toBe("summary_large_image");
    expect(twitter?.images).toEqual([site.ogImage.url]);
  });

  it("SEO-1 — defaults to indexable (robots unset) when `index` is omitted, unchanged behavior for every existing caller", () => {
    const result = publicPageMetadata({ locale: "en", path: "/about", title: "t", description: "d" });
    expect(result.robots).toBeUndefined();
  });

  it("SEO-1 — index:false produces noindex,follow — for transactional/utility pages with no unique search value", () => {
    const result = publicPageMetadata({ locale: "en", path: "/login", title: "t", description: "d", index: false });
    expect(result.robots).toEqual({ index: false, follow: true });
  });
});
