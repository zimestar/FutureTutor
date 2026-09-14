import { routing } from "@/i18n/routing";

/**
 * DATA-1 — deterministic analytics-eligibility route policy, independent
 * of (never a substitute for) the SEO-PRIVATE-NOINDEX1 noindex layer or
 * robots.txt. A path being crawlable/indexable and a path being eligible
 * for behavioral analytics are two separate questions answered by two
 * separate mechanisms; this file only answers the analytics one.
 *
 * Mirrors src/proxy.ts's own segment-boundary matching (never a naive
 * substring prefix — "/tutor" must not match the public plural
 * "/tutors/[slug]"), duplicated here deliberately rather than imported:
 * proxy.ts pulls in next-auth/next-intl middleware, which fails to
 * resolve under Vitest in this environment (see canonicalHost.ts for the
 * same, previously-encountered issue) — this file must stay
 * dependency-free to be unit-testable.
 */

// Authenticated/private/admin route groups — SEO-PRIVATE-NOINDEX1's own
// classification. Excluded from analytics by default per this mission's
// explicit Phase 6/17 policy: no behavioral/session analytics on private
// surfaces in DATA-1.
const EXCLUDED_PREFIXES = ["/dashboard", "/tutor", "/messages", "/notifications", "/session", "/admin", "/family"];

// Real, unauthenticated, but transactional/utility pages — excluded per
// Phase 6 ("AUTH UTILITY: minimal or excluded"). Matches SEO-1's own
// noindex list exactly.
const AUTH_UTILITY_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/check-email"];

function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const maybeLocale = segments[0];
  if ((routing.locales as readonly string[]).includes(maybeLocale)) {
    return `/${segments.slice(1).join("/")}`;
  }
  return pathname;
}

function matchesSegment(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * True only for real public marketing/content surfaces. False for every
 * private/admin route group, every auth-utility page, and (defensively)
 * for a bare "/" that stripLocalePrefix couldn't resolve to a real path.
 */
export function isAnalyticsEligiblePath(pathname: string): boolean {
  const path = stripLocalePrefix(pathname) || "/";

  if (AUTH_UTILITY_PATHS.some((p) => matchesSegment(path, p))) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => matchesSegment(path, prefix))) return false;

  return true;
}
