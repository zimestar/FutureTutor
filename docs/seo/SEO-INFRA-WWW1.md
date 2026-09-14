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

## Proposed application-level change (NOT YET IMPLEMENTED — pending authorization)

`src/proxy.ts` currently starts its handler with locale/section
authorization logic. The proposed change adds a single, narrow check at the
very top, before any of that:

```ts
export const proxy = auth((req) => {
  if (req.nextUrl.hostname === "www.futuretutor.ca") {
    const target = new URL(
      `${req.nextUrl.pathname}${req.nextUrl.search}`,
      "https://futuretutor.ca"
    );
    return NextResponse.redirect(target, 308);
  }

  const { pathname } = req.nextUrl;
  // ...unchanged from here
```

- **308 Permanent Redirect** (not 301/302/307): preserves the request
  method, is unambiguously permanent, and `NextResponse.redirect()`
  defaults to 307 unless a status is passed explicitly, so this must be
  passed explicitly.
- Preserves the full path and query string (`pathname` + `search`), for
  every route the existing matcher already covers (`/`, `/en`, `/fr`, and
  every nested path) — one redirect hop for an `https://www...` request.
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

This mission's own instructions require stopping for explicit authorization
before adding this code ("Do not introduce middleware casually") — it has
not been written yet.

## Status as of this document

- Railway `www.futuretutor.ca` domain: attached, **unverified**
  (`verified: false`), certificate `VALIDATING_OWNERSHIP` — blocked purely
  on the missing DNS record.
- DNS record: **not yet created** — manual action required (table above).
- Application redirect: **not yet implemented** — pending explicit
  authorization (see above).
- Apex canonical/hreflang/sitemap/robots: unchanged, still correct, still
  `GO`.

## Next steps (once actioned)

1. A human creates the CNAME record above at Namecheap.
2. Once DNS propagates, Railway issues a Let's Encrypt certificate for
   `www.futuretutor.ca` (typically within an hour of DNS resolving).
3. On explicit authorization, this session (or a follow-up mission)
   implements and deploys the `proxy.ts` change above.
4. Live verification: `www` root/EN/FR/nested paths/query strings all
   301/308 to the exact matching apex URL in one hop; apex
   canonical/hreflang/sitemap/robots re-confirmed unchanged.

---
*Generated by mission SEO-INFRA-WWW1. Update this document when the DNS
record and/or the application redirect are actually put in place.*
