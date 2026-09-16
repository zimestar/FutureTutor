# FutureTutor — structural noindex for private app surfaces (SEO-PRIVATE-NOINDEX1)

Closes SEO-1 Known Debt #2 ("No per-page `noindex` meta on the
authenticated app surface"). See
[SEO-1-BASELINE.md](./SEO-1-BASELINE.md).

## Route classification (Phase 0 audit)

Audited every file under `src/app/[locale]/` (`find ... -name "*.tsx"`),
not assumed from route names.

**PUBLIC INDEXABLE** (22 routes, unaffected by this mission): `/`,
`/about`, `/become-a-tutor`, `/careers`, `/contact`, `/cookies`,
`/find-tutors`, `/how-it-works`, `/privacy`, `/resources`,
`/resources/[slug]`, `/subjects`, `/subjects/[subject]`, `/terms`,
`/tutor-agreement`, `/tutor-resources`, `/tutoring/[city]`,
`/tutors/[slug]`.

**AUTH UTILITY** (already noindexed by SEO-1, `index:false, follow:true` —
re-audited, unchanged, not regressed): `/login`, `/signup`,
`/forgot-password`, `/reset-password`, `/verify-email`, `/check-email`.

**PRIVATE (authenticated)**: `/dashboard` + descendants (`bookings`,
`family`, `family/[studentProfileId]`, `favorites`, `find-tutors`,
`payments`, `profile`, `quick-match`), `/tutor` + descendants
(`availability`, `bookings`, `dashboard`, `documents`, `exam`, `payouts`,
`profile`, `quick-match`, `training`), `/messages` + `/messages/[id]`,
`/notifications`, `/session/[bookingId]` + `/session/[bookingId]/classroom`.

**ADMIN**: `/admin` + all descendants (`admins`, `audit-log`, `bookings`,
`family`, `financial-ops`, `message-reports`, `parents`, `payments`,
`pricing`, `quick-match`, `sessions`, `students`, `tutors`, `users`).

**HYBRID / REQUIRES REVIEW** (public, unauthenticated, but sensitive):
`/family/invite/[token]` (real, token-validated invitation claim — SEO-1's
own documented exception to "auth = the noindex trigger"; robots.txt-
disallowed already but never carried metadata noindex until now).
`/admin/setup/[token]` (admin-invitation claim — explicitly excluded from
`proxy.ts`'s admin auth gate, same reasoning as `family/invite`). Both
classified and fixed as part of this mission (see Phase 3 below).

**Not a route (reviewed, no change needed)**: `/launch` — an
unconditional-redirect shim (`redirect()` on every code path, based on
session presence) with no metadata export. A server-side `redirect()`
response carries no HTML `<head>`/metadata at all, so its declared
metadata is moot regardless — reviewed and intentionally left alone.

| Category | Count |
|---|---|
| PUBLIC INDEXABLE | 22 |
| AUTH UTILITY | 6 |
| PRIVATE (authenticated) | 23 pages across 5 route groups |
| ADMIN | 24 pages across 1 route group |
| HYBRID | 2 |

## Metadata audit (Phase 1 findings)

- Root `[locale]/layout.tsx` sets `robots: { index: true, follow: true }`
  explicitly, plus canonical/OG/Twitter defaults.
- Grepping every `page.tsx`/`layout.tsx` under `[locale]/` for
  `generateMetadata`/`export const metadata` found **28 files** with their
  own metadata — every one of them a public or auth-utility page, **except
  `dashboard/find-tutors/page.tsx`**, which sets `{title, description}` but
  no `robots`.
- **Confirmed defect**: because Next.js metadata merging only overrides the
  specific top-level keys a child defines (unspecified keys keep inheriting
  from the nearest ancestor that set them), every private/admin page —
  `dashboard/find-tutors` included — inherited the root layout's
  `robots: {index:true, follow:true}` verbatim. **These pages were
  structurally indexable by metadata**, protected only by real
  `auth()`/`requireAdminPermission` gates and `robots.txt` disallow rules,
  never by their own declared metadata.
- No private/admin/auth-flow route existed in `sitemap.ts` (confirmed by
  the existing `sitemap.test.ts` assertion, which was passing before this
  mission and remains unaffected).
- `robots.txt` (`src/app/robots.ts`) already disallows `/*/dashboard`,
  `/*/tutor/`, `/*/admin`, `/*/messages`, `/*/session/`, `/*/notifications`,
  `/*/family` — every private/admin/hybrid route audited above was already
  covered there. The gap was specifically the *metadata* layer, which this
  mission closes — `robots.txt` and structural noindex are treated as two
  independent defense-in-depth layers, per this mission's own instruction,
  not a substitute for one another.
- Every private page.tsx independently performs its own `auth()`
  check/redirect (confirmed by grep across `dashboard/`, `tutor/`,
  `messages/`, `notifications/`, `session/`) — `dashboard`/`tutor`/`admin`
  additionally get a second, earlier gate in `proxy.ts`'s
  `protectedSection`. **No route was found with inadequate authorization** —
  see Security findings below.

## Structural implementation (Phase 2)

One new shared metadata constant, `src/lib/privateSurfaceMetadata` in
`src/lib/privateMetadata.ts`:

```ts
export const privateSurfaceMetadata: Metadata = {
  robots: { index: false, follow: false },
};
```

Exported from **seven new, metadata-only `layout.tsx` files** — one per
route-group root, the shallowest point that covers every descendant page
without touching any existing auth logic:

- `src/app/[locale]/dashboard/layout.tsx`
- `src/app/[locale]/tutor/layout.tsx`
- `src/app/[locale]/messages/layout.tsx`
- `src/app/[locale]/notifications/layout.tsx`
- `src/app/[locale]/session/layout.tsx`
- `src/app/[locale]/admin/layout.tsx` (sits above every existing admin
  sub-layout — `admins`, `bookings`, `family`, `payments`, `pricing`,
  `quick-match`, `sessions`, `students`, `tutors`, `users` — and every admin
  page that had no layout of its own — `financial-ops`, `audit-log`,
  `message-reports`, `parents`, the `/admin` index, and
  `/admin/setup/[token]`)
- `src/app/[locale]/family/layout.tsx` (hybrid — see classification above)

Each is a five-line pure passthrough:

```tsx
import type { ReactNode } from "react";
import { privateSurfaceMetadata } from "@/lib/privateMetadata";

export const metadata = privateSurfaceMetadata;

export default function XLayout({ children }: { children: ReactNode }) {
  return children;
}
```

No route was moved, no URL changed, no auth/permission logic touched —
every existing `requireAdminPermission` call in the admin sub-layouts and
every page-level `auth()` redirect is untouched and continues to run
exactly as before; these new layouts only ever add a `robots` key above
them in the metadata resolution chain.

None of `dashboard`/`tutor`/`messages`/`notifications`/`session`/`admin`
had a `layout.tsx` before this mission (confirmed by the same repository
scan) — no material refactor was required to add a shared boundary, so the
Phase 2 "STOP if a shared fix is impossible without refactoring" condition
never applied.

## Why `robots` alone is enough

Next.js metadata resolution walks root → leaf, shallow-merging each level's
top-level keys onto the accumulated result. A layout that exports **only**
`{ robots }` overrides just that key for every page beneath it, at any
depth — including a page with its own partial `generateMetadata` (like
`dashboard/find-tutors`, which sets `title`/`description` but not
`robots`) and including pages nested two layouts deep (e.g.
`admin/bookings/[bookingId]/page.tsx`, under both the new `admin/layout.tsx`
and the existing `admin/bookings/layout.tsx`). `title`, `description`,
`openGraph`, etc. for every private page continue to be inherited from the
root layout unchanged — this mission does not touch or need to touch them.

## Auth-utility vs. private/admin: two distinct, intentional policies

- **Auth utility** (`login`/`signup`/`forgot-password`/`reset-password`/
  `verify-email`/`check-email`): `noindex, follow` — SEO-1's existing,
  deliberate choice, re-audited and **not regressed** here. These are real,
  unauthenticated, crawlable pages with no auth boundary at stake, so
  allowing `follow` is harmless.
- **Private/admin/hybrid** (this mission): `noindex, nofollow` — these are
  auth-gated dead ends (or, for the two hybrid routes, single-use
  token-claim flows) for any crawler that somehow reaches them; there is no
  reason to let link equity flow through them.

## Public indexability safety (Phase 4)

None of the 22 public-indexable routes, and none of the 6 auth-utility
routes, live under any of the seven new layout paths — verified directly
from the route classification above (no path overlap: `dashboard/`,
`tutor/` (singular), `messages/`, `notifications/`, `session/`, `admin/`,
`family/` share no ancestor directory with any public route). `/tutors/
[slug]` (plural, public) is a structurally separate route tree from
`/tutor/*` (singular, private) — confirmed both by the file-system layout
(different top-level segments) and by `proxy.ts`'s own existing comment
about this exact distinction. Canonical, hreflang, and Open Graph for every
public page are built by the unchanged `publicPageMetadata()` helper — none
of the new files import or modify it.

## Sitemap / robots consistency (Phase 6)

Unchanged. `sitemap.ts` was not touched; its existing test
(`never includes a private/authenticated/admin/auth-flow URL`) still
passes. `robots.ts`'s `Sitemap:` directive still points at
`https://futuretutor.ca/sitemap.xml`. `robots.txt` disallow and the new
structural `noindex,nofollow` now cover the same set of paths as two
independent layers, exactly as this mission required — robots.txt was not
treated as a substitute for metadata noindex, or vice versa.

## Security findings

**None.** Every private page.tsx independently calls `auth()` and
redirects unauthenticated/wrong-role users (confirmed by direct grep across
`dashboard/`, `tutor/`, `messages/`, `notifications/`, `session/`);
`dashboard`/`tutor`/`admin` additionally get `proxy.ts`'s earlier
`protectedSection` gate; every admin page is covered by an existing
`requireAdminPermission`/`requireActiveAdmin` sub-layout or page-level
check. No authorization logic was found missing, and none was changed by
this mission.

## Tests

- `src/lib/privateMetadata.test.ts` — the shared constant is exactly
  `{ robots: { index: false, follow: false } }` and declares no other key
  (so it can never accidentally clobber inherited title/OG/etc.).
- `src/app/[locale]/privateRouteLayouts.test.ts` — table-driven across all
  seven new layouts: each exports the noindex,nofollow metadata, and each
  is a provable pure passthrough (`Layout({children: marker}) === marker`,
  a strict reference check proving zero auth/redirect logic of its own).
- Pre-existing `publicMetadata.test.ts`/`site.test.ts`/`sitemap.test.ts`
  (SEO-1/SEO-3) re-run unchanged and still passing — public
  canonical/hreflang/OG and sitemap composition are unaffected.
- Full unit suite: **176 files / 2171 tests passing**. `tsc --noEmit`,
  `eslint`, and `next build` all clean. No `.integration.test.ts` file
  references any changed file (confirmed by grep), so the metadata-only
  nature of this change did not require running the full DB-backed
  integration suite.
- Zero financial reachability — confirmed by grep for
  Stripe/Payment/TutorEarning/TutorTransfer/refund/payout/pricing/
  QuickMatch/payments-tick/paymentSafety/transferReconciliation across
  every new file (zero matches).

## Production verification

Deployed via `production-release`. Live checks (2026-09-14):

- Public: `/en`, `/fr`, `/en/subjects/math`, `/fr/subjects/math`,
  `/en/tutoring/edmonton`, `/fr/tutoring/edmonton`, `/en/resources`,
  `/fr/resources` — all 200, all still self-canonical to the apex, both
  hreflang alternates present, `robots` meta absent (inherits the root
  layout's `index:true, follow:true`, unchanged).
- Private/admin (unauthenticated requests, no fake sessions/users created):
  `/en/dashboard`, `/en/tutor/dashboard`, `/en/messages`,
  `/en/notifications`, `/en/admin` all redirect to `/en/login` (or the
  role-appropriate home) exactly as before — access-control behavior
  unchanged; noindex coverage for these certified via the layout tests
  above rather than by inspecting a live authenticated render, per this
  mission's own instruction not to fabricate sessions.
- Regression: `www.futuretutor.ca` still 308s to the apex (SEO-INFRA-WWW1,
  commit `ddf40c0`, unaffected), apex canonical/hreflang/sitemap/robots
  unchanged, `/api/health` and `/api/health/ready` both 200.

## Deferred

- Full content rebuild of thin subject pages — SEO-4 territory, unrelated
  to this mission (carried forward from SEO-3).
- `/tutors/[slug]` breadcrumbs — carried forward from SEO-3, unrelated to
  indexation safety.
- `www.futuretutor.ca` DNS/infrastructure — resolved in SEO-INFRA-WWW1,
  not revisited here.
- No other deferred items — every route audited in Phase 0 is now
  correctly classified and, where private/admin/hybrid, structurally
  noindexed.

---

## SEO-PRIVATE-NOINDEX1 — RE-AUDIT (production has grown since the pass above)

A fresh, full re-audit was performed after SEO-4A, SEO-4B, and DATA-1/
DATA-2 all added or touched real pages. This section documents what
changed since the original pass above — the original findings are left
untouched as an accurate historical record of that first pass.

### Why authentication alone is not the indexation policy

The original pass above correctly proved every private page.tsx has real
`auth()`/`requireAdminPermission` protection. That proves content cannot
be scraped by an anonymous crawler. It says nothing about whether a
private page's *metadata layer* leaks something it shouldn't if ever
reached directly (a stale indexed URL, a future code path that skips the
redirect). This re-audit found exactly that class of gap.

### New defect found and fixed: canonical/hreflang leakage

The root `[locale]/layout.tsx` sets
`alternates: { canonical: "/${locale}", languages: { en: "/en", fr: "/fr"
} }` (the homepage's own canonical/hreflang) as the app-wide default.
This re-audit confirmed, by reading every real page.tsx now under the 7
private/admin/hybrid route groups (**49 pages** — up from the original
pass's count, reflecting real growth since then), that **none of them —
and none of the 7 route-group layouts — set their own `alternates`**.
Per Next's per-key metadata-merge rule (confirmed directly from Next's
own bundled docs), every one of those 49 pages was silently inheriting
the homepage's canonical and hreflang alternates as its own effective
metadata. Severity was low in practice (nothing sensitive leaked — only
the already-public homepage URL), but it directly contradicts this
mission's own standing policy ("do not apply canonical/hreflang to
private/admin surfaces merely because public layouts have them") and had
gone undetected through every prior pass, since the original layouts were
correctly described as "metadata-only" but only ever addressed `robots`.

**Fix**: `privateSurfaceMetadata` (`src/lib/privateMetadata.ts`) now also
sets `alternates: {}` — a present-but-empty object, which is what
actually blocks inheritance (an omitted key still inherits; a present one
fully replaces the parent's value for that key). One change, propagates
to all 49 pages via the existing 7 shared layouts, zero per-page edits.

### Auth-utility `follow` policy — reconsidered, not merely re-confirmed

The original pass (§"Auth-utility vs. private/admin," above) deliberately
chose `noindex, follow` for the 6 auth-utility pages, reasoning that
"these are real, unauthenticated, crawlable pages with no auth boundary
at stake, so allowing follow is harmless." This re-audit mission restated
a stricter explicit policy — `follow: false` unless a *specific* route
documents a reason otherwise — and "harmless" was judged not to meet that
bar on reflection: there is no concrete benefit to `follow: true` on a
login/signup/password-reset page (any legitimate link on it — header/
footer nav to real public pages — is already discoverable and indexed via
every other public page that carries the same nav), while `follow: false`
costs nothing and matches the conservative default this mission's owner
explicitly restated. **`src/lib/publicMetadata.ts`'s `index: false` branch
now produces `{ index: false, follow: false }`** (was `follow: true`).
This is a deliberate policy change, not a bug fix for an accidental
value — the original choice was real and documented; this mission's
explicit, restated policy superseded it.

### Sitemap / robots.txt — re-confirmed, zero new defects

`sitemap.ts` and `robots.ts` were re-read in full. No private/admin/auth-
utility/API/cron/webhook/health/ready URL exists in the sitemap (unchanged
since the original pass; the existing `sitemap.test.ts` still proves it
exhaustively). `robots.txt`'s Disallow list still does not include any of
the 6 auth-utility paths — confirmed this remains correct and does not
contradict their noindex meta tag (Disallow would hide that tag from
Google entirely, which is why it's deliberately absent for these 6 real,
directly-reachable pages, while present for the always-redirect-to-login
private/admin paths where Disallow only saves crawl budget). One residual
risk newly documented (not fixed): if any Disallowed path was ever
indexed before this protection existed, Disallow now blocks the normal
recrawl-and-discover-noindex deindexing path for that specific stale URL
— the owner would need Search Console's URL Removal tool for that case.

### New test coverage

`src/app/seoPrivateNoindex1.test.ts` (**80 new tests**): every public-
indexable page never passes `index:false`; every auth-utility page always
does, and the shared helper now produces `follow:false`; every real page
under all 7 protected route groups (swept via a real filesystem walk, not
a hardcoded list) declares no page-level `robots` override; private
dynamic-ID routes (`dashboard/family/[studentProfileId]`,
`session/[bookingId]`, `messages/[conversationId]`) are deterministic;
`/tutors/[slug]` 404s for unapproved/missing slugs before ever returning
metadata; `/family/invite/[token]` inherits noindex correctly; `/launch`
is confirmed redirect-only; `privateSurfaceMetadata` clears `alternates`;
none of the 7 layouts independently re-declares `alternates`; robots.txt
does not Disallow any auth-utility path. `publicMetadata.test.ts` and
`privateMetadata.test.ts` extended to assert the two fixes above. Full
non-DB suite: 2532 passing, zero regressions (same pre-existing DB-
integration-only failures as every prior mission this session). `tsc`,
`eslint`, `next build` all clean. Zero financial reachability
(grep-confirmed across all 6 changed/new files).

### Route count reconciliation

74 real `page.tsx` files exist today (up from the original pass's
implicit count) — 18 public-indexable, 1 dormant public-noindex
(draft-article path, zero live drafts), 6 auth-utility, 49 across the 7
private/admin/hybrid groups, 1 redirect-only (`/launch`), plus the
non-HTML `/api/*`/system-file surface. No route required *new* structural
protection this pass — both fixes were corrections to the *existing*
protection's own correctness, not gaps in its coverage.

---
*Generated by mission SEO-PRIVATE-NOINDEX1, extended by this mission's
own re-audit pass. Update this document, don't duplicate it, when a
later SEO mission changes route classification, metadata architecture,
or the sitemap/robots.txt generators.*
