/** Tagline/description live in messages/*.json under `site.*` — these are locale-independent identifiers only. */
export const site = {
  name: "FutureTutor",
  // ANALYTICS-SEO1 — corrected from "https://www.futuretutor.ca". Verified
  // (live DNS lookup + Railway's own configured custom domain, both this
  // mission) that "www.futuretutor.ca" has NO DNS record at all (NXDOMAIN)
  // — it was never a working host. The real, deployed, DNS-resolving
  // production domain is the apex, "https://futuretutor.ca" (Railway's
  // customDomains config lists only the apex; the apex correctly redirects
  // http->https and serves the app). This single constant is the sole
  // upstream source for metadataBase, canonical/hreflang tags, Open Graph,
  // JSON-LD, sitemap.xml, robots.txt's Sitemap: directive, AND
  // resolveBookingEmailBaseUrl.ts (real booking/session-reminder email CTA
  // links) — every one of those was silently pointing at a nonexistent
  // host before this fix.
  url: "https://futuretutor.ca",
  country: "Canada",
  twitterHandle: "@futuretutor",
} as const;
