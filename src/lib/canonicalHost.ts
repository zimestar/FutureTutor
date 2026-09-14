// SEO-INFRA-WWW1 — Railway has no native domain-redirect feature (custom
// domains are routing targets only), so the www -> apex canonical-host
// redirect is enforced in proxy.ts, which imports this pure check. Kept in
// its own zero-dependency module (no next-intl/next-auth imports) so it can
// be unit-tested directly without pulling in proxy.ts's heavier imports.
//
// SEO-INFRA-WWW1-FIX1 — req.nextUrl.hostname is NOT usable here: live
// production evidence (a temporary, now-removed diagnostic) proved it is
// always the literal string "localhost" in this deployment, because
// Railway's edge forwards requests to the container without an absolute
// URL Next.js trusts. The request's `host` header, by contrast, was
// confirmed (and cross-checked against the agreeing `x-forwarded-host`) to
// reliably carry the real public hostname — "www.futuretutor.ca" or
// "futuretutor.ca" as appropriate — for both apex and www traffic. Railway
// routes custom domains by TLS SNI before forwarding, so this `host` value
// is not client-spoofable into hitting this service under an arbitrary
// hostname; it reflects which registered custom domain the edge matched.
//
// Exact-match only, never endsWith/substring, so this can never
// accidentally catch the apex, a Railway-generated domain, localhost, or
// staging.
const WWW_HOST = "www.futuretutor.ca";
const APEX_ORIGIN = "https://futuretutor.ca";

/**
 * Normalizes a raw `host`-style header value — which may carry a port, a
 * comma-separated proxy chain, or arbitrary casing — down to a bare
 * lowercase hostname. Returns null for a missing or malformed value; never
 * throws.
 */
export function normalizeHostHeader(rawHost: string | null): string | null {
  if (!rawHost) return null;
  const first = rawHost.split(",")[0]?.trim();
  if (!first) return null;
  try {
    // A bare "host[:port]" isn't a valid URL by itself; wrapping it in a
    // scheme lets the WHATWG URL parser do the real normalization (ASCII
    // lowercasing, stripping the port into its own field) instead of
    // hand-rolling that logic.
    const hostname = new URL(`https://${first}`).hostname;
    return hostname || null;
  } catch {
    return null;
  }
}

/**
 * Given the request's raw `host` header plus its path and query string,
 * returns the exact apex destination when the request is for
 * www.futuretutor.ca, or null when it should be left alone.
 */
export function canonicalWwwRedirectForHost(rawHost: string | null, pathname: string, search: string): URL | null {
  if (normalizeHostHeader(rawHost) !== WWW_HOST) return null;
  return new URL(`${pathname}${search}`, APEX_ORIGIN);
}
