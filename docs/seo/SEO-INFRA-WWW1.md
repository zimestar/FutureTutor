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

## Application-level change (implemented, deployed pre-DNS)

Authorized and implemented in the follow-up mission. The pure redirect
check lives in its own zero-dependency module,
`src/lib/canonicalHost.ts` (kept dependency-free — no `next-intl`/
`next-auth` imports — specifically so it can be unit-tested directly
without pulling in `proxy.ts`'s heavier imports, which fail to resolve
under Vitest's module resolution in this environment):

```ts
// src/lib/canonicalHost.ts
const WWW_HOST = "www.futuretutor.ca";
const APEX_ORIGIN = "https://futuretutor.ca";

export function canonicalWwwRedirectUrl(url: URL): URL | null {
  if (url.hostname !== WWW_HOST) return null;
  return new URL(`${url.pathname}${url.search}`, APEX_ORIGIN);
}
```

`src/proxy.ts` calls it as the very first statement inside the request
handler, before any locale detection, section-authorization, or
`intlMiddleware` logic:

```ts
export const proxy = auth((req) => {
  const wwwRedirect = canonicalWwwRedirectUrl(req.nextUrl);
  if (wwwRedirect) {
    return NextResponse.redirect(wwwRedirect, 308);
  }

  const { pathname } = req.nextUrl;
  // ...unchanged from here
```

- **Exact hostname match only** (`===`, never `endsWith`/substring) — proven
  by test to never catch the apex, a Railway-generated domain, `localhost`,
  `staging.futuretutor.ca`, or a spoofed host like
  `www.futuretutor.ca.attacker.com`.
- **308 Permanent Redirect** (not 301/302/307): preserves the request
  method; `NextResponse.redirect()` defaults to 307 unless a status is
  passed explicitly, so 308 is passed explicitly.
- Preserves the full path and query string for every route the existing
  matcher already covers (`/`, `/en`, `/fr`, every nested path, all query
  parameters) — proven by test, including multi-parameter query strings.
- The redirect destination is proven (by test) to never itself match
  `www.futuretutor.ca` — no redirect loop is possible by construction.
- `/api/*` is excluded, same as today's matcher (`config.matcher:
  ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"]`) — no code path expects `www`
  API traffic (webhooks are already configured against the apex).
- An `http://www...` entry gets Railway's own platform-level HTTP→HTTPS
  redirect first (the same behavior already certified for the apex in
  SEO-1), then this one apex redirect — a 2-hop chain only for the
  non-HTTPS entry point, 1 hop for the (overwhelmingly common) HTTPS entry
  point.
- No change to any other request path, no change to `robots.ts`,
  `sitemap.ts`, or `publicMetadata.ts` — canonical/hreflang/OG continue to
  reference the apex exclusively, unaffected by this change.

13 focused tests in `src/lib/canonicalHost.test.ts` cover: www root, EN
path, FR path, nested path, single and multi-parameter query strings,
apex/localhost/Railway-domain/staging/spoofed-host non-redirection,
redirect-loop impossibility, protocol normalization to `https:`, and no
explicit port on the destination. Full unit suite (174 files / 2147 tests),
`tsc --noEmit`, `eslint`, and `next build` all pass with this change.

**Deployed to production *before* the DNS record exists**, by design — so
the moment the CNAME below resolves and Railway issues a certificate, `www`
can never serve a live duplicate 200 page even momentarily.

- Commit: `ba55d53`
- Deployment: `fa98d97b-8356-4291-a3f2-05d3641a92e9` (SUCCESS)
- Post-deploy verification (2026-09-14): `/api/health` 200, `/api/health/ready`
  200, `/en/find-tutors` 200, `/fr/resources` 200, apex canonical still
  `https://futuretutor.ca/en` on `/en`, apex `/` still its normal (unrelated,
  pre-existing) 307 locale-detection redirect — the new www rule does not
  fire for the apex. `www.futuretutor.ca` reconfirmed NXDOMAIN — DNS was not
  touched, as instructed.

## Status as of this document

- Railway `www.futuretutor.ca` domain: attached, **unverified**
  (`verified: false`), certificate `VALIDATING_OWNERSHIP` — blocked purely
  on the missing DNS record.
- DNS record: **still not created** — this is now the only remaining step.
- Application redirect: **implemented and deployed** (see above) — cannot
  be certified live yet since `www` still does not resolve; will be
  verified live once DNS is created.
- Apex canonical/hreflang/sitemap/robots: unchanged, still correct, still
  `GO`.

## Next step (only remaining step)

A human creates this record at Namecheap:

| TYPE | HOST | VALUE | TTL |
|---|---|---|---|
| CNAME | `www` | `q2vwb12u.up.railway.app` | Automatic |

Once DNS propagates, Railway issues a Let's Encrypt certificate for
`www.futuretutor.ca` (typically within an hour), and the redirect deployed
above becomes live immediately — no further application deployment is
needed. Live verification (root/EN/FR/nested paths, query strings, single
redirect hop, apex canonical/hreflang/sitemap/robots re-confirmed
unchanged) should be run once that happens.

---
*Generated by mission SEO-INFRA-WWW1. Update this document once the DNS
record is created and the live www→apex redirect is verified.*
