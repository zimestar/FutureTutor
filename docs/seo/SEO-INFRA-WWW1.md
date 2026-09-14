# FutureTutor — www → apex canonical-host infrastructure (SEO-INFRA-WWW1)

Tracks SEO-1's Known Debt #1 (`www.futuretutor.ca` has no DNS record) through
to resolution. This is infrastructure work (DNS + platform routing), not an
application content change — see [SEO-1-BASELINE.md](./SEO-1-BASELINE.md).

## Authoritative domain

`https://futuretutor.ca` (apex). Unchanged by this mission — this document
only concerns making `www.futuretutor.ca` redirect **to** the apex, never an
alternate site.

## Diagnostic findings (2026-09-14)

**DNS provider**: Namecheap. Confirmed via NS lookup —
`futuretutor.ca` uses `dns1.registrar-servers.com` /
`dns2.registrar-servers.com` (Namecheap's default BasicDNS nameservers), not
Cloudflare or any other provider.

**Apex DNS** (unchanged, for reference): `futuretutor.ca` is a CNAME to
`xsmhyuu0.up.railway.app` (Railway's per-domain routing target for the apex
custom domain), fully propagated, certificate `VALID`. This works today
because Namecheap supports CNAME-like records at the root — Railway's own
docs list Namecheap explicitly as a provider that supports this.

**`www.futuretutor.ca` DNS before this mission**: confirmed **NXDOMAIN**
(non-existent domain) via three independent resolvers — the local ISP
resolver, Cloudflare (`1.1.1.1`), and Google (`8.8.8.8`). No A, AAAA, or
CNAME record of any kind exists. Not a misconfiguration; the record was
simply never created.

**Railway custom domains on the FutureTutor production service** (project
`129c54bd-9be2-4d39-9c0b-e97b0544836a`, service `FutureTutor`
(`86bfbdd1-7b18-4521-bc2f-83769941b7be`), environment `production`
(`454dea65-90eb-4b31-a4f4-dd5775d126e3`)), before this mission: only
`futuretutor.ca`. `www.futuretutor.ca` was not attached.

## Action taken this mission

`www.futuretutor.ca` was attached as a **custom domain on the production
FutureTutor service** (the same service the apex points at — not staging,
not another project) via Railway's domain API. This is additive and
reversible (the domain attachment can be removed without affecting the apex
or any other domain) and does not itself route any live traffic yet, since
no DNS record points at it.

Resulting required DNS record (from Railway, confirmed via
`domain-status`):

| Type | Host | Value | Notes |
|---|---|---|---|
| CNAME | `www` | `q2vwb12u.up.railway.app` | No TXT ownership record required — `futuretutor.ca` (the parent apex) is already verified on this Railway service |

No other domain, and no other DNS record type (A/AAAA/MX/TXT/SPF/DKIM/DMARC)
was touched or is required.

## Why this cannot be finished by this session alone

1. **DNS record creation requires Namecheap account access**, which this
   session does not have (no Namecheap API/MCP tool is available). The
   table above is the exact, unambiguous record a human must create.
2. **Railway has no native "redirect this domain to another domain"
   feature.** Confirmed directly against Railway's own documentation
   (`docs.railway.com/networking/domains/working-with-domains`): custom
   domains are routing targets only. Railway's own documented pattern for a
   `www → apex` redirect (`Adding a root domain with www subdomain to
   Cloudflare`) requires Cloudflare's **Bulk Redirects** product
   specifically — it is not a generic DNS-provider feature and has no
   Namecheap equivalent that reliably serves a valid HTTPS certificate for
   the `www` host.
3. Migrating `futuretutor.ca`'s nameservers to Cloudflare to unlock that
   pattern is a large, disruptive, out-of-scope infrastructure change — it
   would put every other DNS record (MX, SPF, DKIM, DMARC — Zoho and Resend
   email) at risk, which this mission's own boundaries explicitly forbid
   touching.

Consequently, once the DNS record above resolves and Railway issues a
certificate for `www.futuretutor.ca`, requests will reach the **same
FutureTutor application** — the canonical-host redirect (`www` → apex,
path and query preserved) must be enforced at the **application layer**, in
`src/proxy.ts` (the Next.js 16 request-proxy, already runs on every
non-API/static request via its existing matcher).

## Application-level change — first attempt (ba55d53) found broken live

Implemented and deployed ahead of DNS by design, so `www` could never serve
a live duplicate page once DNS resolved. The first implementation checked
`req.nextUrl.hostname === "www.futuretutor.ca"`, backed by 13 tests against
a plain `URL` object — all passing.

**Once DNS was created and live certification was run against the real
production host, this check never fired.** Every tested `www` path
returned a live 200 (or, at the root, the app's own unrelated 307
locale-detection redirect) instead of a 308 to the apex — the exact
duplicate-content exposure this whole mission exists to prevent, now live
rather than hypothetical, for the (short) window between DNS going live and
this fix.

### Root cause (confirmed via a temporary, now-removed diagnostic)

A temporary log line — gated to requests carrying `?seo_host_probe=1`,
logging only `nextUrlHostname`/`host`/`x-forwarded-host`/`forwarded`/
`x-forwarded-proto`, no cookies/auth/body/user data — was deployed
(commit `620abd8`) and hit once against each of `www.futuretutor.ca` and
`futuretutor.ca`. Captured evidence:

```json
// https://www.futuretutor.ca/en/find-tutors?seo_host_probe=1
{"nextUrlHostname":"localhost","host":"www.futuretutor.ca","xForwardedHost":"www.futuretutor.ca","forwarded":null,"xForwardedProto":"https"}

// https://futuretutor.ca/en/find-tutors?seo_host_probe=1
{"nextUrlHostname":"localhost","host":"futuretutor.ca","xForwardedHost":"futuretutor.ca","forwarded":null,"xForwardedProto":"https"}
```

**`req.nextUrl.hostname` is always the literal string `"localhost"`** in
this deployment — Railway's edge forwards requests to the container without
an absolute URL Next.js resolves against the public hostname, so
`nextUrl.hostname` falls back to Next.js's own internal default rather than
reflecting the request at all. This is true for *every* request, apex
included — the original check's exact-match against
`"www.futuretutor.ca"` could structurally never succeed.

The `host` header, by contrast, reliably carried the real public hostname
for both requests, cross-confirmed by an agreeing `x-forwarded-host`. The
`Forwarded` header (RFC 7239) is not set by Railway's edge at all
(`null`). Railway routes custom domains by TLS SNI before forwarding, so
`host` here reflects which registered custom domain the edge matched — not
an arbitrary client-supplied value that could route a request to this
service under an unregistered hostname.

**Trusted host source used going forward: the `host` request header**, via
`req.headers.get("host")`.

### Permanent fix (deployed)

`src/lib/canonicalHost.ts` rewritten around the confirmed-reliable source:

```ts
// src/lib/canonicalHost.ts
const WWW_HOST = "www.futuretutor.ca";
const APEX_ORIGIN = "https://futuretutor.ca";

export function normalizeHostHeader(rawHost: string | null): string | null {
  if (!rawHost) return null;
  const first = rawHost.split(",")[0]?.trim();
  if (!first) return null;
  try {
    const hostname = new URL(`https://${first}`).hostname;
    return hostname || null;
  } catch {
    return null;
  }
}

export function canonicalWwwRedirectForHost(rawHost: string | null, pathname: string, search: string): URL | null {
  if (normalizeHostHeader(rawHost) !== WWW_HOST) return null;
  return new URL(`${pathname}${search}`, APEX_ORIGIN);
}
```

`normalizeHostHeader` handles every Phase-3 safety requirement by delegating
to the WHATWG `URL` parser rather than hand-rolled string logic: ASCII
lowercasing and port-stripping are the parser's own normalization, a
comma-separated proxy chain is reduced to its first entry, and a malformed
value returns `null` (never throws — wrapped in `try/catch`). The
comparison remains an exact `===` against the literal `www.futuretutor.ca`
— never `endsWith`/`includes`/regex — so this can never become an open
redirect or catch a sibling/spoofed hostname.

`src/proxy.ts` calls it as the very first statement inside the request
handler, before any locale detection, section-authorization, or
`intlMiddleware` logic:

```ts
export const proxy = auth((req) => {
  const wwwRedirect = canonicalWwwRedirectForHost(req.headers.get("host"), req.nextUrl.pathname, req.nextUrl.search);
  if (wwwRedirect) {
    return NextResponse.redirect(wwwRedirect, 308);
  }

  const { pathname } = req.nextUrl;
  // ...unchanged from here
```

- **308 Permanent Redirect**, explicit (not 301/302/307 — `NextResponse.
  redirect()` defaults to 307 unless a status is passed).
- Path and query string preserved via `req.nextUrl.pathname`/`.search` —
  `req.nextUrl`'s *path* parsing is unaffected by the hostname bug; only its
  `.hostname` field is unusable here.
- `/api/*` excluded, same as today's matcher — no code path expects `www`
  API traffic.
- No change to `robots.ts`, `sitemap.ts`, or `publicMetadata.ts` —
  canonical/hreflang/OG continue to reference the apex exclusively.

21 focused tests in `src/lib/canonicalHost.test.ts` cover: `normalizeHostHeader`
(missing/empty/port-bearing/mixed-case/comma-chain/malformed input) and
`canonicalWwwRedirectForHost` (www root, EN/FR/nested path preservation,
query preservation, port and case tolerance, apex/staging/spoofed-host/
localhost/Railway-domain/missing-or-malformed-host non-redirection,
redirect-loop impossibility, protocol normalization, no explicit port on
the destination). Full unit suite (174 files / 2155 tests), `tsc --noEmit`,
`eslint`, and `next build` all pass. The temporary diagnostic (commit
`620abd8`) was fully removed before this fix's final commit — confirmed by
grep for `seo_host_probe` across the changed files (zero matches).

- Diagnostic commit: `620abd8` (temporary, since reverted by content)
- Fix commit: *(recorded after push — see below)*
- Fix deployment: *(recorded after push — see below)*

## Status as of this document

- Railway `www.futuretutor.ca` domain: **verified** (`verified: true`),
  certificate `VALID`, DNS record `PROPAGATED`.
- DNS record: **created** — `www` CNAME → `q2vwb12u.up.railway.app`,
  confirmed live via two independent public resolvers.
- Application redirect: **fixed and deployed** (see above) — first
  implementation (`ba55d53`) was live-certified broken (see root-cause
  section); the `host`-header-based fix has been deployed and is pending
  final live re-certification.
- Apex canonical/hreflang/sitemap/robots: unaffected throughout, still
  `GO`.

---
*Generated by mission SEO-INFRA-WWW1, updated by SEO-INFRA-WWW1-FIX1. Update
this document again only if the live www→apex redirect regresses or the
architecture changes.*
