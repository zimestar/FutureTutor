# FutureTutor — SEO Technical Baseline (SEO-1)

Established by mission SEO-1 (production SEO audit + narrow technical
fixes). This document is the reference point SEO-2 and later SEO missions
build on — it describes the *current, verified* state, not aspirations.

## Authoritative domain

`https://futuretutor.ca` (apex, HTTPS). Single upstream source: `site.url`
in `src/content/site.ts`, consumed by `metadataBase`, every canonical/
hreflang tag, Open Graph, JSON-LD, `sitemap.xml`, and `robots.txt`'s
`Sitemap:` line.

- `www.futuretutor.ca` has **no DNS record at all** (confirmed via live DNS
  lookup) — not a redirect, a hard failure. No application code references
  it. Fixing this requires a DNS/Railway custom-domain change, which is
  infrastructure work outside this mission's scope — see Known SEO Debt.
- `http://` → `https://` apex is a correct 301, verified live (Railway's own
  behavior for the custom domain, not application code).
- The bare apex (`/`) 307-redirects to `/en` or `/fr` via next-intl's
  locale-detection middleware — 307 (not 301) is deliberate and correct
  here, since the target depends on `Accept-Language`/cookie, not a fixed
  permanent target.

## Locale model

next-intl, `localePrefix: "always"` (`src/i18n/routing.ts`): every real page
lives under `/en/...` or `/fr/...`, no unprefixed canonical path. Every
public page's canonical and hreflang alternates are built by one shared
helper, `publicPageMetadata()` (`src/lib/publicMetadata.ts`), verified live
in production on both `/en` and `/fr`:

```
<link rel="canonical" href="https://futuretutor.ca/fr"/>
<link rel="alternate" hrefLang="en" href="https://futuretutor.ca/en"/>
<link rel="alternate" hrefLang="fr" href="https://futuretutor.ca/fr"/>
```

No `x-default` hreflang is declared. Not a defect — every page has full
en/fr coverage — but worth a deliberate decision in SEO-2 (see Known SEO
Debt).

## Indexable routes (public, `robots: index,follow`)

Home (`/`), `/find-tutors`, `/subjects`, `/subjects/[subject]` (11
subjects), `/tutors/[slug]` (tutor profiles — already an intentional public
surface from an earlier phase, not introduced by SEO-1), `/how-it-works`,
`/become-a-tutor`, `/tutor-resources`, `/about`, `/contact`, `/careers`,
`/privacy`, `/terms`, `/cookies`, `/tutor-agreement` — all server-rendered
(SSG for static content, dynamic-but-server-rendered for DB-driven pages
like tutor profiles), all built through `publicPageMetadata()`.

## Noindex / private routes

- **Auth-utility pages** (`/login`, `/signup`, `/forgot-password`,
  `/reset-password`, `/verify-email`, `/check-email`): SEO-1 added
  `robots: {index:false, follow:true}`. These are real, unauthenticated,
  crawlable pages (not blocked in `robots.txt`, so Google can crawl them
  and *see* the noindex tag) but carry no unique search value — standard
  practice, not a security boundary.
- **Authenticated app surface** (`/dashboard`, `/tutor/*` private pages,
  `/admin`, `/messages`, `/session/*`, `/notifications`, `/family`):
  protected by real server-side `auth()` checks (unchanged by this
  mission) AND disallowed in `robots.txt`. No per-page `robots: noindex`
  meta tag exists on these routes. This is a deliberate scope boundary,
  not an oversight — see Known SEO Debt for why and what the real fix
  looks like.
- `src/app/[locale]/family/invite/[token]/page.tsx` is a real exception:
  intentionally public (no `auth()` gate), token-validated server-side via
  a hashed lookup (`previewInvitationByToken`). Its security depends on the
  token being unguessable and server-validated, not on being unindexed —
  same principle as a password-reset link. Already covered by `/*/family`
  in `robots.txt`.

## Sitemap model

`src/app/sitemap.ts`. SEO-1 changed two things:

1. **Per-locale entries.** Previously each path had exactly one `<url>`
   (default locale only), with the other locale reachable only as an
   hreflang alternate *inside* that entry. Now every path emits one `<url>`
   per locale (matching Google's documented multilingual-sitemap guidance:
   "add a `<loc>` entry for each language version of the URL, including
   itself"), each still carrying the full reciprocal hreflang set.
2. **Legal/careers pages added.** `/privacy`, `/terms`, `/cookies`,
   `/tutor-agreement`, `/careers` are real, indexable, canonical-correct
   pages that were simply missing from the sitemap. Added at low priority
   (0.3) / yearly changefreq, distinct from marketing pages.

**Not included** (deliberately, see Known SEO Debt): individual tutor
profile pages (`/tutors/[slug]`). They're real and indexable today, but
adding potentially hundreds of DB-driven, churn-prone URLs to the sitemap
is a bigger decision than a narrow technical fix — left for a dedicated
SEO-2 decision, exactly as this mission's own scope boundary asked for.

## Robots model

`src/app/robots.ts`. `Allow: /` by default, explicit `Disallow` list for
`/api/`, `/*/dashboard`, `/*/tutor/`, `/*/admin`, `/*/messages`,
`/*/session/`, `/*/notifications`, `/*/family`. `Sitemap:` line points at
`https://futuretutor.ca/sitemap.xml` — verified live. Unchanged by SEO-1;
audited and confirmed correct (host, patterns, no staging/localhost leak).

`robots.txt` is explicitly **not** treated as a security boundary anywhere
in this codebase — every disallowed path is independently protected by
real server-side authentication.

## Canonical model

Two-tier: the root layout (`src/app/[locale]/layout.tsx`) sets a
homepage-level canonical/hreflang as a fallback; every real public page
overrides it via `publicPageMetadata({ locale, path, ... })`, which builds
`alternates.canonical` from the exact current path — never a hardcoded or
inherited homepage canonical. Verified live: `/en/find-tutors` canonicals
to itself, not `/en`.

## Open Graph / Twitter — found and fixed

**Confirmed live in production before this fix**: every public page,
**including the homepage**, rendered with zero `og:image` and zero
`twitter:image` — `publicPageMetadata()`'s own `openGraph`/`twitter`
objects silently replaced (Next.js metadata merging does not deep-merge
sibling keys like `openGraph.images` across a layout/page boundary) the
root layout's carefully-set image metadata for every page that defined its
own `openGraph`/`twitter` object — which is nearly every real page in the
app. Any link shared on Facebook/LinkedIn/Slack/iMessage/X rendered with no
preview image at all.

**Fix**: a single shared `site.ogImage` reference (`src/content/site.ts`),
consumed by both the root layout and `publicPageMetadata()`. Every public
page now carries a real `og:image`/`twitter:image`, verified live. The
image itself (`/brand/logo-horizontal-light.png`, a 471×103 horizontal
wordmark, HTTP 200) is not the ideal `1200×630` "large image" aspect ratio
— strictly better than zero, but a dedicated share-image asset is design
work for SEO-2, not fabricated here.

## Structured data (current state)

Homepage only (`src/app/[locale]/page.tsx`): `Organization`
(name/url/description/areaServed — real data, no invented fields) and
`FAQPage` (real translated FAQ content, not fabricated). No
`AggregateRating`, `Review`, or `LocalBusiness` schema exists anywhere —
correctly absent, not a gap to fill in this mission. No `WebSite` schema
(with `SearchAction`) and no per-page structured data (tutor profiles,
subject pages) — both real enhancement opportunities, explicitly deferred
to SEO-6 per that mission's own stated scope.

## Known SEO debt (explicit, not silently deferred)

1. **`www.futuretutor.ca` has no DNS record.** A real, working redirect to
   the apex would be a UX/backlink-resilience improvement. Requires a DNS
   change plus a Railway custom-domain entry — infrastructure, not
   application code. Recommend a dedicated, explicitly-authorized
   infrastructure change (not a "narrow code fix").
2. **No per-page `noindex` meta on the authenticated app surface**
   (dashboard/tutor-private/admin/messages/session/notifications/family).
   Already `robots.txt`-disallowed and auth-protected; the residual risk is
   narrow (a URL indexed with no snippet if externally linked despite the
   disallow, or a crawler that ignores `robots.txt` entirely). None of
   these route trees have a shared `layout.tsx` today, so a clean fix means
   adding one layout per section (not bolting `robots` onto dozens of
   individual `page.tsx` files) — a real but proportionate follow-up, not a
   narrow SEO-1 fix.
3. **No `x-default` hreflang.** Every page has full en/fr coverage, so this
   is a refinement, not a defect. Worth a deliberate SEO-2 decision.
4. **Tutor profile pages are not in the sitemap.** Intentionally public
   (existing, prior-phase decision), but whether/how to list potentially
   hundreds of churn-prone profile URLs in the sitemap is a content-strategy
   decision for SEO-2, not a technical sitemap bug.
5. **No dedicated 1200×630 Open Graph share image.** The current fix uses
   the existing horizontal wordmark (471×103) — correct and live, but not
   ideal aspect ratio. Design task for SEO-2.
6. **No `WebSite`/`SearchAction` schema, no structured data beyond the
   homepage.** Explicitly deferred to SEO-6 per that mission's own scope.
7. **No live Core Web Vitals field data available in this session** (no
   PageSpeed/Search Console API access from the repository). Code-level
   checks are good (hero image uses `next/image` with `priority` for LCP,
   font uses `display: "swap"`, zero render-blocking third-party scripts in
   the root layout) but this is not a substitute for real field
   measurement.

## Baseline risks

- No financial, payment, or admin-authorization behavior was touched by
  this mission (confirmed by grep across every changed file: zero
  Stripe/Payment/TutorEarning/TutorTransfer/refund/payout references).
- No schema/migration changes.
- No production data mutations — this mission only touched application
  code (metadata/sitemap logic) and one documentation file.

## Recommended SEO-2 inputs

- Decide the DNS/infrastructure fix for `www.futuretutor.ca`.
- Decide the tutor-profile sitemap inclusion policy (all approved tutors?
  a subset? update cadence?).
- Commission a real 1200×630 Open Graph share image.
- Decide on `x-default` hreflang.
- Add per-section `layout.tsx` files for the authenticated app surface,
  each carrying an explicit `robots: {index:false, follow:false}`, as the
  clean structural fix for Known SEO Debt item 2.
- Keyword strategy and any new landing pages — explicitly out of SEO-1's
  scope from the start.

---
*Generated by mission SEO-1. Update this document, don't duplicate it, when
a later SEO mission changes any of the above.*
