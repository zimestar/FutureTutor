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
*Generated by mission SEO-PRIVATE-NOINDEX1.*
