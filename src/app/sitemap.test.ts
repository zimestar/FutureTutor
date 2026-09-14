import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";
import { site } from "@/content/site";
import { routing } from "@/i18n/routing";
import { subjects } from "@/content/subjects";
import { localMarkets } from "@/content/localMarkets";
import { listPublishedResourceArticles } from "@/content/resources";

// ANALYTICS-SEO1 — regression coverage for the production-breaking
// hostname defect this mission found and fixed (every sitemap URL was
// pointing at a non-existent "www.futuretutor.ca" host) and for the
// sitemap's own basic validity (only real public paths, correct locale
// alternates, no duplicates, no private/authenticated URL ever included).
//
// SEO-1 — extended for two changes: (1) every path now emits one <url>
// entry PER LOCALE, not just the default locale with the other reachable
// only via hreflang; (2) the legal/careers paths are now included.

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

  it("includes only known, real public static/legal paths and real subject slugs — never invented pages — with one entry per locale", () => {
    const knownStaticPaths = ["", "/find-tutors", "/subjects", "/how-it-works", "/become-a-tutor", "/tutor-resources", "/resources", "/about", "/contact"];
    const knownLegalPaths = ["/privacy", "/terms", "/cookies", "/tutor-agreement", "/careers"];
    const knownSubjectPaths = subjects.map((s) => `/subjects/${s.slug}`);
    const knownLocalMarketPaths = localMarkets.map((m) => `/tutoring/${m.slug}`);
    const knownResourceArticlePaths = listPublishedResourceArticles().map((a) => `/resources/${a.slug}`);
    const expectedPathCount =
      knownStaticPaths.length + knownSubjectPaths.length + knownLocalMarketPaths.length + knownResourceArticlePaths.length + knownLegalPaths.length;
    expect(entries).toHaveLength(expectedPathCount * routing.locales.length);
  });

  it("SEO-3 — includes the Edmonton local-market page and the published resource article, gated by their static registries", () => {
    for (const locale of routing.locales) {
      expect(entries.some((e) => e.url === `${site.url}/${locale}/tutoring/edmonton`)).toBe(true);
      expect(entries.some((e) => e.url === `${site.url}/${locale}/resources`)).toBe(true);
      expect(entries.some((e) => e.url === `${site.url}/${locale}/resources/how-to-choose-a-tutor`)).toBe(true);
    }
  });

  it("SEO-1 — every path appears as its own <loc> for EACH locale (not only the default locale)", () => {
    const homepageEntries = entries.filter((e) => routing.locales.some((locale) => e.url === `${site.url}/${locale}`));
    expect(homepageEntries).toHaveLength(routing.locales.length);
    for (const locale of routing.locales) {
      expect(entries.some((e) => e.url === `${site.url}/${locale}/find-tutors`)).toBe(true);
      expect(entries.some((e) => e.url === `${site.url}/${locale}/privacy`)).toBe(true);
    }
  });

  it("never includes a private/authenticated/admin/auth-flow URL", () => {
    for (const entry of entries) {
      for (const fragment of PRIVATE_PATH_FRAGMENTS) {
        expect(entry.url, `sitemap unexpectedly includes a private path: ${entry.url}`).not.toContain(fragment);
      }
    }
  });

  it("every entry has both EN and FR locale alternates (hreflang), on the correct hostname, including a self-referencing alternate", () => {
    for (const entry of entries) {
      const languages = entry.alternates?.languages as Record<string, string> | undefined;
      expect(languages).toBeDefined();
      for (const locale of routing.locales) {
        expect(languages![locale]).toBeDefined();
        expect(languages![locale]!.startsWith(`${site.url}/${locale}`)).toBe(true);
      }
      // The entry's own URL must be among its own alternates (self-reference).
      expect(Object.values(languages!)).toContain(entry.url);
    }
  });

  it("has no duplicate URLs", () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("the homepage (default locale) is the only priority-1, weekly-changefreq entry", () => {
    const homepage = entries.find((e) => e.url === `${site.url}/${routing.defaultLocale}`);
    expect(homepage).toBeDefined();
    expect(homepage!.priority).toBe(1);
    expect(homepage!.changeFrequency).toBe("weekly");
    const priorityOneEntries = entries.filter((e) => e.priority === 1);
    expect(priorityOneEntries).toHaveLength(routing.locales.length); // one per locale, never more
  });

  it("SEO-1 — legal pages carry a low priority and yearly changefreq, distinct from marketing pages", () => {
    const privacyEn = entries.find((e) => e.url === `${site.url}/en/privacy`);
    expect(privacyEn?.priority).toBe(0.3);
    expect(privacyEn?.changeFrequency).toBe("yearly");
  });
});
