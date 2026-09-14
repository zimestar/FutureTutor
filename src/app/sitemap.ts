import type { MetadataRoute } from "next";
import { site } from "@/content/site";
import { subjects } from "@/content/subjects";
import { localMarkets } from "@/content/localMarkets";
import { listPublishedResourceArticles } from "@/content/resources";
import { routing } from "@/i18n/routing";

// SEO-1 — legal/utility pages that are real, public, indexable,
// canonical-correct pages (all already covered by publicPageMetadata) but
// were previously absent from the sitemap entirely. Low priority/yearly
// changefreq, matching their genuinely low-churn, reference-only nature —
// distinct from the marketing paths below.
const LEGAL_PATHS = ["/privacy", "/terms", "/cookies", "/tutor-agreement", "/careers"];

const STATIC_PATHS = ["", "/find-tutors", "/subjects", "/how-it-works", "/become-a-tutor", "/tutor-resources", "/resources", "/about", "/contact"];
const SUBJECT_PATHS = subjects.map((s) => `/subjects/${s.slug}`);
// SEO-3 — local-market pages are gated by src/content/localMarkets.ts (the
// expansion guardrail), never generated from live TutorProfile.city values.
const LOCAL_MARKET_PATHS = localMarkets.map((m) => `/tutoring/${m.slug}`);
// SEO-3 — only published (non-draft) resource articles are listed; a draft
// article's route resolves for review but stays out of the sitemap and
// carries `robots: {index:false}` (see resources/[slug]/page.tsx).
const RESOURCE_ARTICLE_PATHS = listPublishedResourceArticles().map((a) => `/resources/${a.slug}`);

function priorityFor(path: string): number {
  if (path === "") return 1;
  if (path === "/find-tutors") return 0.9;
  if (LEGAL_PATHS.includes(path)) return 0.3;
  return 0.7;
}

function changeFrequencyFor(path: string): NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]> {
  if (path === "") return "weekly";
  if (LEGAL_PATHS.includes(path)) return "yearly";
  return "monthly";
}

/**
 * SEO-1 — every path now emits ONE <url> entry PER LOCALE (previously only
 * the default locale had its own <loc>, with the other locale reachable
 * only as an hreflang alternate inside it) — matching Google's documented
 * multilingual sitemap guidance: "add a <loc> entry for each language
 * version of the URL, including itself." Each entry still carries the full
 * reciprocal hreflang alternate set (both locales, including itself), so
 * every language version is both independently listed AND correctly
 * cross-referenced.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const allPaths = [...STATIC_PATHS, ...SUBJECT_PATHS, ...LOCAL_MARKET_PATHS, ...RESOURCE_ARTICLE_PATHS, ...LEGAL_PATHS];

  const languageAlternatesFor = (path: string) =>
    Object.fromEntries(routing.locales.map((locale) => [locale, `${site.url}/${locale}${path}`]));

  return allPaths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${site.url}/${locale}${path}`,
      changeFrequency: changeFrequencyFor(path),
      priority: priorityFor(path),
      alternates: { languages: languageAlternatesFor(path) },
    }))
  );
}
