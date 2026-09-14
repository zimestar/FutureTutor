// SEO-INFRA-WWW1 — Railway has no native domain-redirect feature (custom
// domains are routing targets only), so the www -> apex canonical-host
// redirect is enforced in proxy.ts, which imports this pure check. Kept in
// its own zero-dependency module (no next-intl/next-auth imports) so it can
// be unit-tested directly without pulling in proxy.ts's heavier imports.
//
// Exact-match only, never endsWith/substring, so this can never
// accidentally catch the apex, a Railway-generated domain, localhost, or
// staging.
const WWW_HOST = "www.futuretutor.ca";
const APEX_ORIGIN = "https://futuretutor.ca";

export function canonicalWwwRedirectUrl(url: URL): URL | null {
  if (url.hostname !== WWW_HOST) return null;
  return new URL(`${url.pathname}${url.search}`, APEX_ORIGIN);
}
