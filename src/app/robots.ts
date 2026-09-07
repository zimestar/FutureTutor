import type { MetadataRoute } from "next";
import { site } from "@/content/site";

/**
 * ANALYTICS-SEO1 — explicit crawl guidance for the app's own private
 * surface, additive to (never a substitute for) real authentication.
 * "robots.txt is not security" (this mission's own instruction, correctly)
 * — every one of these routes is already gated by a real server-side
 * auth()/redirect check regardless of what this file says. This exists
 * purely so Google doesn't spend crawl budget on a redirect chain to
 * /login for a route it could never actually index content from, and as a
 * defense-in-depth signal against ever accidentally indexing a stray
 * authenticated render.
 *
 * `/*<path>` (a leading wildcard) matches under either locale prefix
 * (/en/... or /fr/...) without hardcoding both — Google and Bing both
 * support the `*` wildcard in robots.txt Disallow (the de facto extended
 * spec every major crawler already implements). `/tutor/` (singular, with
 * a trailing slash) intentionally does NOT match the public plural
 * `/tutors/[slug]` profile pages, `/tutor-resources`, `/tutor-agreement`,
 * or `/become-a-tutor` — robots.txt prefix matching is a literal string
 * match, and none of those share `/tutor/` as an exact path segment.
 * `/api/` has no locale prefix (it's a sibling of the [locale] segment),
 * so it's listed as a plain path, not a wildcard one.
 */
const DISALLOWED_PATH_PATTERNS = ["/api/", "/*/dashboard", "/*/tutor/", "/*/admin", "/*/messages", "/*/session/", "/*/notifications", "/*/family"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DISALLOWED_PATH_PATTERNS,
    },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
