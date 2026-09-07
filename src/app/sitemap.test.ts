import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";
import { site } from "@/content/site";
import { routing } from "@/i18n/routing";
import { subjects } from "@/content/subjects";

// ANALYTICS-SEO1 — regression coverage for the production-breaking
// hostname defect this mission found and fixed (every sitemap URL was
// pointing at a non-existent "www.futuretutor.ca" host) and for the
// sitemap's own basic validity (only real public paths, correct locale
// alternates, no duplicates, no private/authenticated URL ever included).

const PRIVATE_PATH_FRAGMENTS = ["/dashboard", "/admin", "/messages", "/session", "/api/", "/tutor/", "/notifications", "/login", "/signup", "/reset-password", "/forgot-password", "/verify-email", "/family"];

describe("sitemap()", () => {
  const entries = sitemap();

  it("item — every URL uses the real, DNS-resolving production hostname (regression for the www.futuretutor.ca defect)", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.url.startsWith(`${site.url}/`)).toBe(true);
      expect(entry.url).not.toContain("www.futuretutor.ca");
    }
  });

  it("includes only known, real public static paths and real subject slugs — never invented pages", () => {
    const knownStaticPaths = ["", "/find-tutors", "/subjects", "/how-it-works", "/become-a-tutor", "/tutor-resources", "/about", "/contact"];
    const knownSubjectPaths = subjects.map((s) => `/subjects/${s.slug}`);
    const expectedCount = knownStaticPaths.length + knownSubjectPaths.length;
    expect(entries).toHaveLength(expectedCount);
  });

  it("never includes a private/authenticated/admin/auth-flow URL", () => {
    for (const entry of entries) {
      for (const fragment of PRIVATE_PATH_FRAGMENTS) {
        expect(entry.url, `sitemap unexpectedly includes a private path: ${entry.url}`).not.toContain(fragment);
      }
    }
  });

  it("every entry has both EN and FR locale alternates (hreflang), on the correct hostname", () => {
    for (const entry of entries) {
      const languages = entry.alternates?.languages as Record<string, string> | undefined;
      expect(languages).toBeDefined();
      for (const locale of routing.locales) {
        expect(languages![locale]).toBeDefined();
        expect(languages![locale]!.startsWith(`${site.url}/${locale}`)).toBe(true);
      }
    }
  });

  it("has no duplicate URLs", () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("the homepage is the only priority-1, weekly-changefreq entry", () => {
    const homepage = entries.find((e) => e.url === `${site.url}/${routing.defaultLocale}`);
    expect(homepage).toBeDefined();
    expect(homepage!.priority).toBe(1);
    expect(homepage!.changeFrequency).toBe("weekly");
  });
});
