# FutureTutor — Existing Money Pages Optimization (SEO-4A)

Optimizes the public pages FutureTutor already owns, using SEO-2's keyword
strategy and SEO-3's information architecture as authoritative inputs — no
new strategy invented here. See
[SEO-2-KEYWORD-STRATEGY.md](./SEO-2-KEYWORD-STRATEGY.md),
[SEO-3-INFORMATION-ARCHITECTURE.md](./SEO-3-INFORMATION-ARCHITECTURE.md),
[SEO-1-BASELINE.md](./SEO-1-BASELINE.md).

## Phase 0 — audited page inventory

| Page | URL | EN/FR | Sitemap | Canonical/hreflang |
|---|---|---|---|---|
| Homepage | `/` | Yes | Yes | Self, apex |
| Find Tutors | `/find-tutors` | Yes | Yes | Self, apex, filter-agnostic (confirmed SEO-3) |
| Tutoring Edmonton | `/tutoring/edmonton` | Yes | Yes | Self, apex |
| How It Works | `/how-it-works` | Yes | Yes | Self, apex |
| Become a Tutor | `/become-a-tutor` | Yes | Yes | Self, apex |
| Public tutor profile | `/tutors/[slug]` | Yes | No (SEO-1 carryover, undecided) | Self, apex |
| Subjects index | `/subjects` | Yes | Yes | Self, apex |
| `/subjects/[subject]` × 10 | `/subjects/{slug}` | Yes | Yes | Self, apex |
| Resources index | `/resources` | Yes | Yes | Self, apex |
| Resource article | `/resources/how-to-choose-a-tutor` | Yes | Yes | Self, apex |
| Tutor Resources hub | `/tutor-resources` | Yes | Yes | Self, apex |

**11 page types audited** (20 real URLs counting the 10 subject slugs and
both locales as one row each). All already used `publicPageMetadata()`
(SEO-1) and carried correct canonical/hreflang before this mission — no
regressions found in that layer, confirmed again after changes (Phase 21).

Structured data: homepage `Organization` + `FAQPage` JSON-LD, unchanged —
already accurate, not touched (Phase 15: preserve if accurate, don't add
without justification). No page-specific schema added this mission — none
was clearly justified by new content added.

## Phase 1 — intent ownership (reconfirmed, not redefined)

| Query cluster | Primary owner | Secondary supporting | Do not target with |
|---|---|---|---|
| find a tutor / general | `/find-tutors` | `/` (brand framing only) | No other page |
| tutoring Edmonton | `/tutoring/edmonton` | `/find-tutors`, `/subjects/*` | No other city page exists or was created |
| math / subject-specific tutor | `/subjects/[subject]` | `/find-tutors` (filtered) | New resource content targets informational phrasing, never the bare "[subject] tutor" query |
| how tutoring works / process | `/how-it-works` | Homepage's own narrative (distinct framing, not a duplicate) | — |
| become a tutor / tutoring jobs Edmonton | `/become-a-tutor` | `/tutor-resources` | `/tutor-resources` still doesn't chase the bottom-funnel "become a tutor" query |
| how tutors are vetted | Homepage `FAQPage` (`tutorReview` item) + How It Works journey steps | `/resources/how-to-choose-a-tutor` | No new dedicated page created (Phase 9 — no gap found requiring one) |
| choosing a tutor | `/resources/how-to-choose-a-tutor` | `/subjects/[subject]`, `/find-tutors` | — |

No conflict with SEO-2 §17's or SEO-3 §17's existing cannibalization maps —
this mission's changes are additive links and content depth, not new pages
competing for an owned query.

## Phase 2 — prioritization

**Tier A (optimized this mission)**: Homepage, Find Tutors, Tutoring
Edmonton, Become a Tutor, How It Works, `/subjects/[subject]` (shared
template, all 10 pages).

**Tier B (reviewed, materially strong already, not changed)**: Tutor
Resources hub (SEO-2 already called it "genuinely well-built, honest
orientation hub"), Resources index/article (built to spec in SEO-3, no
depth gap found), public tutor profile (SEO-3 already confirmed correct
data exposure; content depth is a per-tutor concern, not a template gap).

**Deferred**: Subjects index hub page (thin but low commercial priority
per SEO-2 §18 — "CURRENT PAGE", not flagged for Tier A); biology/
computer-science subject copy refinement beyond the shared template
improvement (SEO-2 Tier 3); the six Tier-1 resource articles (explicitly
out of scope — this is SEO-4A, not SEO-4B); any new city or subject×city/
level page (explicitly forbidden by this mission).

## Phase 3 — Homepage

Audited `src/app/[locale]/page.tsx` + `HomeStory.tsx`. Already
substantial, honest, non-thin content (problem/path/trust/possibility
narrative, subject grid, featured tutors, learning modes, tutor CTA, FAQ
with `FAQPage` JSON-LD, final CTA) — this matches SEO-2's own instruction
("IMPROVE CURRENT PAGE, not a rebuild"). The only real gap found: **zero
body-content links to `/tutoring/edmonton` or `/resources`** (only the
footer linked to them). Fixed with one new compact "Keep exploring" link
row between the existing Tutor CTA and FAQ sections — two links, no new
copy claims, reuses the existing `Section`/`Link` primitives. Also removed
a stray duplicate `import type { Metadata }` statement that had drifted to
the bottom of the file (harmless — ES imports hoist — but untidy; fixed
while already editing this file).

## Phase 4 — Find a Tutor

`/find-tutors`'s actual content lives in `TutorDirectory.tsx`, which
directly imports `calculateCustomerPrice` (real pricing/financial logic).
**This mission's financial-reachability boundary made `TutorDirectory.tsx`
off-limits entirely** — it was not read for modification and not edited by
a single character. Instead, a new self-contained section was added to
`find-tutors/page.tsx` itself (financial-logic-free), rendered *after* the
existing `<TutorDirectory />`: a short "How tutor discovery works"
explanation (grounded in the real approval process — training, assessment,
document review, matching the homepage FAQ's own wording) plus three links
(Subjects, Tutoring in Edmonton, How It Works). No claim about tutor supply
or coverage was added — the existing "New marketplace" empty-state badge
and honest empty-state copy in `TutorDirectory.tsx` were left completely
untouched.

## Phase 5 — Tutoring Edmonton

`src/content/localMarkets.ts` (the static allowlist) was **not touched**.
No new city page was created. The existing page already showed the real,
live approved-tutor grid (SEO-3) rather than a claimed count — this
mission added one link to `/how-it-works` inside the existing intro
section, using a new `howItWorksLink` translation key, so a reader can
verify the real booking process without leaving the page. No fabricated
tutor counts, reviews, testimonials, offices, addresses, years-in-business,
ratings, or city-wide-coverage claims were added — none existed before,
none were introduced.

## Phase 6 — Become a Tutor

Added one new, honest local-framing section (new `local` translation
block) between the existing process steps and the closing CTA: states that
FutureTutor is *actively building its Edmonton tutor community* — true,
since Edmonton is the platform's one real active market — without
asserting demand volume, job counts, or compensation figures, and links to
`/tutoring/edmonton`. No employment-status claims were made or implied (the
existing copy already correctly frames this as an independent "Tutor
account" and "approval journey," never "employee"); no earnings figures,
hourly rates, or guaranteed-request claims were added — verified by a new
automated test (`moneyPageMetadata.test.ts`) that greps the new copy for
`$`, "per hour," "guarantee," and "earn"/"gagner" and asserts none are
present, in both languages.

## Phase 7 — How It Works

Added the same "Keep exploring" link pattern as the homepage (Edmonton +
Resources), placed after the existing FAQ section and before the final
CTA. Fixed the `metaTitle` duplicate-brand-suffix defect found during audit
(§14 below) on this exact page. No change to the existing journey-step
content — it already accurately describes the real process (subject/level/
mode selection, Quick Match, profile review, pricing shown before
confirmation, the existing session experience) and was not duplicated
elsewhere.

## Phase 8 — Subject pages

Audited the shared `subjects/[subject]/page.tsx` template (applies to all
10 real subjects). Confirmed genuinely thin per SEO-2's own finding: H1 +
one description sentence + CTA + tutor grid/empty-state + (from SEO-3)
breadcrumbs and two related-links. **One shared template addition** (so all
10 pages improve from a single edit, per this mission's explicit
"improve their shared template" instruction) inserted between the hero and
the tutor grid:

- **Academic levels section**: lists all 6 real levels (`gradeLevels`
  translation namespace, already existing — reused, not reinvented),
  explicitly highlighting that FutureTutor spans elementary through adult
  learners including CEGEP/college — the real differentiation SEO-2 §9
  called out. Paired with an explicit honesty guard sentence ("not every
  tutor covers every level — each profile lists the specific levels they
  teach"), directly satisfying this mission's Phase 8 instruction not to
  claim universal level coverage.
- **Mode section**: online/in-person framing, reusing the existing
  `search.online`/`search.inPerson` translation strings (already used
  elsewhere in the app) rather than inventing new copy, so the phrasing
  stays consistent sitewide.

No subject×level or subject×city URL was created — both remain sections
within the existing flat `/subjects/[subject]` URL, exactly as SEO-2 §9
and this mission's Phase 8 require. No curriculum expertise or per-subject
academic claims were invented.

## Phase 9 — Trust / vetting

Confirmed the canonical owner already exists and is accurate: the homepage
`FAQPage` JSON-LD's `tutorReview` item is the real trust anchor, verbatim-
consistent with the product's own hard constraint (*"FutureTutor does not
claim background checks or guarantees beyond this process"* —
`messages/en.json`, unchanged). `/how-it-works`'s journey steps already
describe the same real pipeline (profile, training, assessment, document
review, approval) without overclaiming. **No new trust page was created** —
Phase 9 explicitly requires confirming an existing owner before creating
one, and one was found. The only trust-adjacent addition this mission made
is the find-tutors intro section's one sentence, which paraphrases the
existing FAQ language rather than introducing new claims (verified against
`TutorApplicationStatus`'s real pipeline: `DRAFT → SUBMITTED → UNDER_REVIEW
→ INTERVIEW_REQUIRED → INTERVIEW_COMPLETED → TRAINING_REQUIRED →
TRAINING_COMPLETED → EXAM_REQUIRED → EXAM_COMPLETED → FINAL_REVIEW →
APPROVED`, `prisma/schema.prisma` — read, not modified).

## Phase 10-11 — content quality / EN-FR

Every new EN/FR string pair was written natively for its language, not
translated word-for-word — matching this codebase's own existing,
confirmed-native bilingual convention (SEO-2 §4). French additions use
"tuteur"/"tutorat" as the established primary terms (per SEO-2's own
Canadian-French audit), with the existing gendered/natural phrasing this
codebase already uses elsewhere (e.g. "cégep," "formation aux adultes"
reused verbatim from the existing `gradeLevels` namespace rather than
re-translated). No keyword stuffing, no repeated city-name spam (Edmonton
appears exactly once per new section, in context), no invented statistics,
testimonials, outcomes, urgency, or scarcity language anywhere in the new
copy.

## Phase 12 — Internal linking (summary)

| From | New links added |
|---|---|
| Homepage | → `/tutoring/edmonton`, → `/resources` |
| Find Tutors | → `/subjects`, → `/tutoring/edmonton`, → `/how-it-works` |
| Tutoring Edmonton | → `/how-it-works` (subject chips + Find Tutors + Become a Tutor links already existed from SEO-3) |
| Become a Tutor | → `/tutoring/edmonton` |
| How It Works | → `/tutoring/edmonton`, → `/resources` |
| `/subjects/[subject]` | Unchanged — already links to the resource article and Edmonton from SEO-3 |

No sitewide footer changes (already complete from SEO-3). No excessive
repeated exact-match anchor text — each link's anchor text is descriptive
("Tutoring in Edmonton," "Guides for parents and students," "See how
booking works"), not a bare keyword repeated across every page.

## Phase 13 — CTA architecture

No new CTA workflows introduced — every new link points to a real,
already-functioning page. Primary/secondary CTA hierarchy on each Tier A
page is unchanged (Find a Tutor / Browse Tutors for parents-students;
Become a Tutor / Create a Tutor account for tutors) — this mission's
additions are *supporting* contextual links, not new primary CTAs, exactly
matching the mission's instruction not to introduce workflows that don't
exist.

## Phase 14 — Metadata

Found and fixed the duplicated-brand-suffix defect on `/how-it-works`:
`metaTitle` was `"How FutureTutor Works"` (EN) / `"Comment fonctionne
FutureTutor"` (FR) — since the root layout's title template already
appends `— FutureTutor`, the live rendered title read "How FutureTutor
Works — FutureTutor." Fixed to `"How It Works"` / `"Comment ça marche"`.
A full scan of every `metaTitle`-named key in both locale files found only
one other occurrence of the brand name (`/about`, unchanged — out of this
mission's Tier A scope, not touched, documented as deferred). New
`moneyPageMetadata.test.ts` makes this a permanent regression test across
every Tier A page's title, in both languages. Every optimized page still
has a unique title/description, correct canonical, EN/FR alternates, and
inherited Open Graph/Twitter metadata (unchanged — `publicPageMetadata()`
itself was not touched).

## Phase 15 — Structured data

No new schema added. Existing homepage `Organization`/`FAQPage` JSON-LD
reviewed and confirmed still accurate — not modified. No page-specific
schema (Review, AggregateRating, LocalBusiness) was added anywhere, since
none of the new content introduced anything genuinely schema-worthy beyond
what already exists — per Phase 15's explicit "if not clearly justified,
DEFER."

## Phase 16 — Accessibility / semantics

Every new section uses the existing `Section`/`SectionIntro`/`Button`/
`Link` design-system primitives already used throughout the codebase — no
new custom interactive elements, no change to heading hierarchy (each new
section's heading is an H2/label styled consistently with sibling
sections, never a second H1), all new links are real anchor elements via
the existing `Link` component (keyboard-accessible, matches sitewide
focus-visible styling).

## Phase 17 — Anti-cannibalization re-validation

| Pair | Conflict |
|---|---|
| Homepage vs Find Tutors | NO — homepage stays brand/category framing, links out to the search UI it doesn't duplicate |
| Homepage vs Edmonton | NO — homepage links to Edmonton, doesn't claim local content itself |
| Find Tutors vs Edmonton | NO — Find Tutors owns generic transactional intent; Edmonton owns the local modifier, links back |
| Find Tutors vs subject pages | NO — Find Tutors is the full directory; subject pages own subject-specific queries; new subject-page content is educational, not a competing search UI |
| Edmonton vs subject pages | NO — reciprocal links only (unchanged from SEO-3), no content duplication |
| Become a Tutor vs Tutor Resources | NO — Become a Tutor's new local section is Edmonton-specific framing, orthogonal to Tutor Resources' journey-orientation content; Tutor Resources still doesn't chase the "become a tutor" query |
| How It Works vs Homepage | NO — How It Works keeps the detailed step-by-step process; homepage's narrative is brand-level, not a duplicate step list |
| Resources vs commercial pages | NO — new links point *to* Resources from commercial pages; nothing changed on Resources itself |

**MATERIAL CANNIBALIZATION CONFLICTS = 0.**

## Phase 18 — no new location sprawl

`src/content/localMarkets.ts` unchanged — still exactly one entry
(Edmonton). No new city page, no subject×city page, no subject×level page.
**NEW CITY PAGES = 0.**

## Phase 19 — indexation safety

None of the six Tier A pages touched live under any SEO-PRIVATE-NOINDEX1
route group (`dashboard`, `tutor`, `messages`, `notifications`, `session`,
`admin`, `family`) — confirmed by file path. `robots`/canonical/hreflang
logic in `publicPageMetadata()` was not touched. Live-reconfirmed in Phase
21 below.

## Phase 20 — tests

- `src/content/moneyPageMetadata.test.ts` (19 tests): no Tier A title
  embeds the brand name (EN+FR), every Tier A title is unique per language,
  the subject-page title template stays clean once `{subject}` is filled,
  the new levels/mode content exists in both languages, the levels-note
  honesty guard is present, and the new Become-a-Tutor local section makes
  no compensation/earnings claims (EN+FR).
- `src/app/[locale]/moneyPageInternalLinks.test.ts` (12 tests): source-level
  regression for every new link added this mission, plus an explicit
  assertion that `find-tutors/page.tsx` never inlines
  `calculateCustomerPrice` (proving the financial-logic boundary held).
- Pre-existing `publicMetadata.test.ts`/`sitemap.test.ts`/
  `privateRouteLayouts.test.ts`/`canonicalHost.test.ts`/
  `localMarkets.test.ts` re-run unchanged and passing — canonical,
  hreflang, sitemap integrity, private noindex, the www→apex redirect, and
  the local-market allowlist were not touched by this mission and remain
  correct.
- Full unit suite: **178 files / 2202 tests passing**. `tsc --noEmit`,
  `eslint`, `next build` all clean.
- Zero financial reachability — confirmed by grep for Stripe/Payment/
  TutorEarning/TutorTransfer/refund/payout/pricing/
  calculateCustomerPrice/QuickMatch/payments-tick/paymentSafety/
  transferReconciliation across every changed file (zero matches), and by
  the explicit `TutorDirectory.tsx` untouched-file guarantee above.

## Phase 21 — production deployment & live certification

Deployed via `production-release`. Live checks (2026-09-14) confirmed:
HTTP 200 on `/en`, `/fr`, `/en/find-tutors`, `/fr/find-tutors`,
`/en/tutoring/edmonton`, `/fr/tutoring/edmonton`, `/en/how-it-works`,
`/fr/how-it-works`, `/en/become-a-tutor`, `/fr/become-a-tutor`, a
representative subject page in both locales, `/resources`; unique titles
with no duplicated brand suffix; correct self-canonical and hreflang on
every page; new internal links resolving to their real target pages;
`www.futuretutor.ca` still 308-redirecting to the apex (SEO-INFRA-WWW1,
unaffected); `/api/health` and `/api/health/ready` both 200.

## Phase 22 — product/data honesty

Every dynamic/product claim in new copy was cross-checked against the real
code/data model before writing: tutor approval and screening (the real
`TutorApplicationStatus` pipeline, §9 above), online/in-person mode
(`TutoringMode` enum: `ONLINE`/`IN_PERSON`/`BOTH`, unchanged, read not
modified), Edmonton as the real current market (`TutorProfile.city`,
confirmed live in SEO-3), pricing (deliberately not touched or claimed —
`TutorDirectory.tsx`'s pricing logic was never read for the purpose of
writing marketing copy about it), matching (Quick Match — existing copy
referenced, not invented), tutor levels (the real 6-level
`AcademicLevel` set, `gradeLevels` translation namespace reused verbatim).
No statement was found that couldn't be supported — none needed removal.

## Phase 23 — security / financial boundaries

No authentication, authorization, role, permission, admin-guard, session,
schema, migration, or production-data code was touched. `TutorDirectory.tsx`
(the one file in this mission's scope with real financial-logic
proximity — it imports `calculateCustomerPrice`) was read for context only
and never edited; the financial-reachability grep and the automated
"no `calculateCustomerPrice` in find-tutors/page.tsx" test both confirm
this held. **FINANCIAL BUSINESS LOGIC CHANGES = 0.**

---
*Generated by mission SEO-4A. Update this document, don't duplicate it,
when a later SEO mission (SEO-4B or beyond) changes any of the above.*
