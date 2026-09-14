import { site } from "@/content/site";

/**
 * DATA-1 — production-host gate. `site.url` (src/content/site.ts) is the
 * same single upstream source already used for canonical/hreflang/OG/
 * sitemap/robots (SEO-1) — reused here rather than duplicated, so
 * analytics activation can never drift out of sync with the domain the
 * rest of the app already treats as authoritative.
 */
const PRODUCTION_HOSTNAME = new URL(site.url).hostname;

/**
 * True only when running in a real browser on the production hostname.
 * False for server-side rendering, localhost, any Railway preview/staging
 * deployment, and any other host — so analytics can never activate for
 * non-production traffic, regardless of consent or configuration state.
 */
export function isProductionAnalyticsEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === PRODUCTION_HOSTNAME;
}
