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
  // SEO-1 — the one Open Graph/Twitter share image every public page uses.
  // A horizontal wordmark rather than a 1200x630 "large image" card asset —
  // real dimensions declared below so platforms render it correctly sized
  // rather than guessing; still strictly better than the zero-image state
  // this fixes (see publicMetadata.ts). A dedicated 1200x630 share image is
  // a SEO-2 design task, not something to fabricate in this mission.
  ogImage: { url: "/brand/logo-horizontal-light.png", width: 471, height: 103 },
} as const;
