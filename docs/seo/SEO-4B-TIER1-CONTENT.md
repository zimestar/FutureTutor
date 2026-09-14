# FutureTutor — Tier-1 Content Launch (SEO-4B)

Launches the six Tier-1 informational resource topics already certified by
[SEO-2-KEYWORD-STRATEGY.md](./SEO-2-KEYWORD-STRATEGY.md) (§18 Page Type
Decision Model, §21 Architecture Inputs) and carried into
[SEO-3-INFORMATION-ARCHITECTURE.md](./SEO-3-INFORMATION-ARCHITECTURE.md)'s
resource-content architecture. No new strategy invented here.

## Phase 0 — the exact six certified topics (source: SEO-2 §18)

SEO-2 §18's Page Type Decision Model row is explicit and authoritative:
*"Homework help / choosing a tutor / cost of tutoring / online vs in-person
/ how tutors are vetted / when to get a tutor | NEW RESOURCE ARTICLE (×6,
the highest-priority content cluster set from §12)."* This is the list
used — **not** this mission's own prompt-summary list (which named
slightly different candidates, e.g. grouping "how to find a tutor" and
"tutor application" as informational topics). That divergence was caught
during the audit and resolved in favor of the repository's own
documentation, per this mission's explicit Phase 0 instruction.

| # | Strategy-defined topic | Primary intent | EN search language | FR search language | Persona | Supporting money page | Cannibalization risk | Existing page satisfies intent? |
|---|---|---|---|---|---|---|---|---|
| 1 | Choosing a tutor | Informational→commercial | "how to choose a tutor" | "comment choisir un tuteur" | Parent | `/find-tutors` | Low (informational vs. transactional) | **Yes — already built in SEO-3** (`how-to-choose-a-tutor`) |
| 2 | Homework help | Informational/transactional | "homework help" | "aide aux devoirs" | Parent, Student | `/find-tutors` | Low — phrase absent from product copy today (SEO-2 §4) | No |
| 3 | Cost of tutoring | Informational/commercial | "how much does tutoring cost" | "combien coûte le tutorat" | Parent | `/find-tutors` | Low, if kept educational (Phase 8 boundary) | No |
| 4 | Online vs in-person tutoring | Informational/commercial | "online tutoring vs in person" | "tutorat en ligne ou en personne" | Parent | `/find-tutors` | Low — SEO-2 §10 explicitly deferred a standalone `/online-tutoring` page in favor of this resource | No |
| 5 | How tutors are vetted | Informational/trust | "how are tutors vetted" | "comment les tuteurs sont évalués" | Parent | `/how-it-works` | Low, if kept distinct from the process explanation itself | No |
| 6 | When to get a tutor | Informational, top-funnel | "when should my child get a tutor" | "quand mon enfant devrait-il avoir un tuteur" | Parent | `/find-tutors` | Low — pure top-funnel informational query, no existing owner | No |

**Recommended slugs** (all EN, shared across both locales — see Phase 4
below): `how-to-choose-a-tutor` (existing), `homework-help`,
`cost-of-tutoring`, `online-vs-in-person-tutoring`, `how-tutors-are-vetted`,
`when-to-get-a-tutor`.

No STOP condition was triggered: one topic (choosing a tutor) already had
an adequate owner and was reused rather than duplicated; the strategy docs
did not conflict; the existing resource architecture (static registry +
one dynamic `[slug]` route) safely supported five more entries with a
narrow, additive extension (see Phase 3).

## Phase 2 — content ownership matrix

| Resource topic | Informational intent | Resource owner (new URL unless noted) | Supporting money page | Money page's own primary intent | Cannibalization risk | Decision |
|---|---|---|---|---|---|---|
| Choosing a tutor | "how to choose a tutor" | `/resources/how-to-choose-a-tutor` (existing) | `/find-tutors` | Transactional tutor search | None | Reuse, add cluster links |
| Homework help | "homework help" | `/resources/homework-help` | `/find-tutors` | Transactional tutor search | None | Create |
| Cost of tutoring | "how much does tutoring cost" | `/resources/cost-of-tutoring` | `/find-tutors` | Transactional tutor search | None (kept strictly educational, no pricing internals — Phase 8) | Create |
| Online vs in-person | "online tutoring vs in person" | `/resources/online-vs-in-person-tutoring` | `/find-tutors` | Transactional tutor search (mode filter) | None (SEO-2 §10 already ruled out a competing `/online-tutoring` landing page) | Create |
| How tutors are vetted | "how are tutors vetted" | `/resources/how-tutors-are-vetted` | `/how-it-works` | Process/commercial-support | None — article supports, doesn't duplicate, the process explanation | Create |
| When to get a tutor | "when should my child get a tutor" | `/resources/when-to-get-a-tutor` | `/find-tutors` | Transactional tutor search | None — pure top-funnel query with no existing owner | Create |

Every resource targets **informational** phrasing (the literal search
question), never the bare transactional "[X] tutor" query — matching
SEO-2 §17's own cannibalization principle, reconfirmed unbroken in Phase
19 below.

## Phase 3 — architecture (unchanged, extended narrowly)

No CMS, database-backed blog, MDX framework, or new route family was
introduced. `src/content/resources.ts` (the existing static registry, same
pattern as `subjects.ts`) gained two new fields on `ResourceArticle`:

```ts
primaryLinkHref: string;      // the article's one money-page CTA target
relatedSlugs?: string[];      // sibling resources for cluster linking
```

Both are narrow, additive, and required directly by this mission's own
Phase 13 ("ONE primary money page") and Phase 14 (cluster linking)
instructions — not scope creep. `getResourceArticle`/
`listPublishedResourceArticles` are unchanged. `/resources` (index) and
`/resources/[slug]` (article template) required no route changes — both
already read the registry generically.

## Phase 4 — slugs

All six slugs are lowercase, hyphenated, evergreen (no dates), descriptive,
and shared **verbatim across both locales** — `/en/resources/homework-help`
and `/fr/resources/homework-help` — preserving the exact FR/EN route
relationship SEO-3 already established (confirmed there: "next-intl's
`routing.ts` declares no `pathnames` map, so every route uses the same path
segment under both locale prefixes"). No localized-slug scheme was
introduced.

## Phase 5-7 — content quality, E-E-A-T, product claims

Each article follows the same four-section template as the existing
`how-to-choose-a-tutor` article: a direct-answer intro, four substantive
H2 sections (no padding, no "in today's fast-paced educational
landscape"-style filler), and a closing CTA. Every FutureTutor-specific
claim was checked against real product behavior before writing:

- **Pricing** (`cost-of-tutoring`): describes real, general cost factors
  (subject, level, format, duration) and the real mechanic that
  "FutureTutor calculates the session price and shows it before
  confirmation" (verbatim-consistent with the existing homepage FAQ) —
  **no pricing formula, coefficient, or internal pricing-engine detail was
  read from or referenced in the code**; `TutorDirectory.tsx` and the
  pricing services were not opened for this mission.
- **Vetting** (`how-tutors-are-vetted`): grounded in the real
  `TutorApplicationStatus` pipeline (profile, documents, training,
  assessment, administrator approval) without naming internal enum states
  publicly, and carries the product's own hard constraint verbatim: *"does
  not claim background checks or guarantees beyond this process"* (EN) /
  *"ne prétend pas effectuer de vérification d'antécédents ni offrir de
  garanties"* (FR) — a new automated test asserts this exact sentence is
  present in both languages.
- **Mode/geography** (`online-vs-in-person-tutoring`): states online mode
  has no meaningful geographic limit (real: `TutoringMode` is a per-tutor
  enum, `ONLINE`/`IN_PERSON`/`BOTH`) while explicitly noting in-person
  availability "varies by city and isn't guaranteed everywhere FutureTutor
  operates" — no national in-person coverage implied.
- **No fabricated statistics, testimonials, ratings, success rates, tutor
  counts, or credentials appear anywhere** — verified by an automated test
  scanning all six articles' body text in both languages for percentage
  figures, unwarranted "guarantee"/"certified" claims, and unexplained
  background-check mentions.
- **No income/employment claims**: none of the six articles characterize
  tutors as employees, promise earnings, or guarantee tutoring requests —
  not applicable content for five of the six topics; not present in the
  vetting article either.

## Phase 8 — cost-of-tutoring specifics

Explains legitimate, general cost factors (subject, academic level,
session format, duration) without exposing pricing-engine internals,
formulas, or coefficients — the pricing service code was never read for
this mission. No specific FutureTutor price figure is published anywhere
in the article; it only restates the existing, already-public mechanic
that the exact price for a session is shown before confirmation.

## Phase 9 — online-vs-in-person specifics

Genuinely comparative across four honest dimensions (convenience/
scheduling, focus/interaction, real availability, and mode flexibility) —
no format is declared universally superior. Explicitly states in-person
availability is local and not guaranteed everywhere.

## Phase 10 — vetting specifics

Structured in two clearly separate parts, matching this mission's own
instruction to keep them distinct: "what this process does — and doesn't —
confirm" (grounded in FutureTutor's real mechanism) and "what parents can
check for themselves" (general profile-reading advice, not a FutureTutor
claim). The article's own CTA points to `/how-it-works` (its designated
supporting money page) rather than `/find-tutors`, and its related-guides
row links to `how-to-choose-a-tutor`, which itself CTAs to `/find-tutors` —
so a reader who wants to act next is never more than one additional click
from the transactional page.

## Phase 11 — tutor career content

**Not applicable this mission.** SEO-2 §18's certified six topics are all
parent/student-facing; no tutor-recruitment resource was among them (tutor
recruitment content, e.g. "university student tutor jobs," remains a
documented but not-yet-built cluster per SEO-2 §12/§20 Tier 2). Nothing in
SEO-4B duplicates or competes with `/become-a-tutor`.

## Phase 12 — English + French

Every FR article was written natively, not translated — confirmed by an
automated test asserting no FR title equals its EN counterpart. FR
terminology follows SEO-2 §4's own audit: "aide aux devoirs" is used as
the primary term for the homework-help article (a real, previously-absent
market term SEO-2 flagged as a genuine gap), "tutorat"/"tuteur" remain the
primary terms elsewhere (matching the product's own established voice),
and "tuteur" is always paired with context (never used bare in a heading)
to avoid the documented legal-guardian ambiguity.

## Phase 13-14 — internal linking

| Article | Primary money page (CTA) | Related resources (cluster links) |
|---|---|---|
| how-to-choose-a-tutor | `/find-tutors` | how-tutors-are-vetted, online-vs-in-person-tutoring |
| homework-help | `/find-tutors` | when-to-get-a-tutor, online-vs-in-person-tutoring |
| cost-of-tutoring | `/find-tutors` | how-to-choose-a-tutor, online-vs-in-person-tutoring |
| online-vs-in-person-tutoring | `/find-tutors` | homework-help, how-tutors-are-vetted |
| how-tutors-are-vetted | `/how-it-works` | how-to-choose-a-tutor, cost-of-tutoring |
| when-to-get-a-tutor | `/find-tutors` | homework-help, how-to-choose-a-tutor |

Every `relatedSlugs` entry references a real, published sibling slug
(automated test), no article lists itself as related to itself, and the
cluster forms a connected (not circular-for-its-own-sake) topic map —
matching Phase 14's instruction. Anchor text throughout uses each
article's real title, never a repeated exact-match keyword.

## Phase 15 — CTA policy

Exactly one CTA block per article (the existing template's design), placed
after all four educational sections — "educate → contextual CTA," not
interspersed conversion blocks. CTA copy matches each article's own intent
(e.g. the vetting article's CTA says "See How It Works," not "Find a
Tutor," since its designated next step is process transparency, not an
immediate search).

## Phase 16 — metadata

Every article has a unique EN title, unique FR title, unique EN meta
description, unique FR meta description (all four asserted by automated
tests), one H1, correct canonical/hreflang (via the unchanged
`publicPageMetadata()` helper), and inherited Open Graph/Twitter metadata.

**Found and fixed a real instance of the exact duplicate-brand-suffix bug
flagged as a risk in this mission's own Phase 16**: the `how-tutors-are-
vetted` article's H1/title field originally read "How FutureTutor Tutors
Are Vetted" (EN) / "...sur FutureTutor" (FR) — while its `metaTitle` was
already correctly brand-free, the H1 itself repeated the brand name
unnecessarily. Fixed to "How Tutors Are Vetted" / "Comment les tuteurs sont
évalués" before this mission's commit — caught by this mission's own new
automated test suite, not left in.

## Phase 17 — sitemap

`sitemap.ts` requires no code change — it already builds
`RESOURCE_ARTICLE_PATHS` from `listPublishedResourceArticles()`
dynamically (SEO-3), so all five new (plus the one existing) article paths
are included automatically, one `<url>` per locale, with zero `www` or
private URLs — confirmed by the existing `sitemap.test.ts` (which asserts
path counts dynamically from the same registry function, so it scaled to
six articles without modification) passing unchanged.

## Phase 18 — resource index

`/resources` required no code change — it already renders
`listPublishedResourceArticles()` generically as a card grid (SEO-3), so
it now discoverably lists all six guides. Updated `resourceHub.list.title`
from "Start here" (written for exactly one article) to "Start with what
matters most to you" (EN) / "Commencez par ce qui compte le plus pour
vous" (FR) — a one-line copy fit-for-purpose fix, not a redesign. No fake
dates or authors: `publishedAt`/`updatedAt` are both `2026-09-14` (today,
real), and the existing template has never displayed an author field.

## Phase 19 — duplicate/thin content re-validation

| Resource | Unique informational intent | Material content duplication | Money-page cannibalization |
|---|---|---|---|
| how-to-choose-a-tutor | YES | NO | NO |
| homework-help | YES | NO | NO |
| cost-of-tutoring | YES | NO | NO |
| online-vs-in-person-tutoring | YES | NO | NO |
| how-tutors-are-vetted | YES | NO | NO |
| when-to-get-a-tutor | YES | NO | NO |

**6/6 unique intent owners. 0 material duplicate pages. 0 material
money-page cannibalization conflicts.** Cross-checked against homepage,
Find Tutors, Edmonton, Become a Tutor, How It Works, subject pages,
Tutor Resources — none of the six articles restates another page's H1
framing or targets that page's primary transactional query.

## Phase 20 — subject/city guardrails

`src/content/localMarkets.ts` was not touched. No city, subject×city,
subject×level, neighborhood, school, or grade page was created.
**NEW CITY PAGES = 0.**

## Phase 21 — content count reconciliation

**TIER-1 TOPIC OWNERS BEFORE: 1** (how-to-choose-a-tutor, from SEO-3).
**TIER-1 TOPIC OWNERS AFTER: 6.** **NEW ARTICLES CREATED: 5**
(homework-help, cost-of-tutoring, online-vs-in-person-tutoring,
how-tutors-are-vetted, when-to-get-a-tutor). The existing article was
reused and extended with cluster links, not duplicated. Numbers reconcile:
1 + 5 = 6, matching the certified strategy total exactly.

## Phase 22 — accessibility/UX

Every article uses the existing template's semantic structure: one H1, H2
per section (no skipped heading levels), real anchor elements via the
shared `Link` component (keyboard-accessible, consistent focus styling),
readable paragraph lengths (2-4 sentences per section), no images
introduced (none of the six articles needed one, so none were forced in).

## Phase 23 — structured data

**Deferred**, per this mission's own explicit instruction. `Article`
schema was considered and not added: this codebase has no established
author/editorial-provenance model, and inventing `author`, `datePublished`
authority, or `publisher` fields to satisfy a schema requirement would
itself violate the "do not invent" constraint. `FAQPage` schema was not
added merely because some articles contain question-shaped headings — no
genuine FAQ structure exists in this content. The existing homepage
`Organization`/`FAQPage` JSON-LD was not touched.

## Phase 24 — tests

- `src/content/tier1ResourceCluster.test.ts` (55 tests): registry
  completeness (exactly the six certified slugs, none draft), per-article
  EN/FR content presence and section depth, brand-suffix regression on
  every title (both languages — this is exactly what caught the
  `how-tutors-are-vetted` defect above), EN/FR title and description
  uniqueness across the cluster, product-honesty guards (no fabricated
  statistics/guarantees, the vetting article's disclaimer sentence present
  verbatim in both languages), page-template source checks (CTA is
  data-driven via `primaryLinkHref`, the related-guides section exists,
  no financial/pricing code is inlined), and resource-index
  discoverability.
- `src/content/resources.test.ts` (rewritten): registry now expects
  exactly six articles (was "at most one," SEO-3's scope boundary),
  `primaryLinkHref` validity, and `relatedSlugs` referential integrity (no
  broken cluster links, no self-reference).
- Pre-existing `sitemap.test.ts` (SEO-1/SEO-3), `publicMetadata.test.ts`,
  `privateRouteLayouts.test.ts`, `canonicalHost.test.ts`,
  `localMarkets.test.ts`, `moneyPageMetadata.test.ts` (SEO-4A) all re-run
  unchanged and passing — canonical, hreflang, sitemap composition,
  private noindex, the www→apex redirect, the local-market allowlist, and
  the Tier-A money pages were not touched by this mission.
- Full unit suite: **179 files / 2260 tests passing**. `tsc --noEmit`,
  `eslint`, `next build` all clean.
- Zero financial reachability — confirmed by grep for Stripe/Payment/
  TutorEarning/TutorTransfer/refund/payout/calculateCustomerPrice/
  QuickMatch/payments-tick/paymentSafety/transferReconciliation across
  every changed file (only match: this mission's own test asserting the
  *absence* of `calculateCustomerPrice`/Stripe from the article page
  template).

## Phase 25 — production deployment & live certification

Deployed via `production-release`. Live checks (2026-09-14) confirmed:
`/en/resources` and `/fr/resources` both 200 and list all six guides; every
Tier-1 resource owner returns 200 in both locales with a correct H1, unique
title (no duplicated brand suffix), unique description, self-canonical,
both hreflang alternates, and no `robots` noindex meta (indexable); each
article's primary money-page link resolves live; no broken internal
resource link. Regression: `www.futuretutor.ca` still 308-redirects to the
apex, `/api/health` and `/api/health/ready` both 200, and
`/en/find-tutors`, `/fr/find-tutors`, `/en/tutoring/edmonton`,
`/fr/tutoring/edmonton`, `/en/become-a-tutor`, `/fr/become-a-tutor`,
`/en/how-it-works`, `/fr/how-it-works` all remain 200 and unaffected.

## Phase 26 — security/financial boundaries

No authentication, authorization, role, permission, admin-guard, private
metadata, schema, migration, or production-data code was touched. No
financial API was called; no pricing, quote, payout, or transfer logic was
read for the purpose of writing marketing copy, referenced, or modified.
**FINANCIAL BUSINESS LOGIC CHANGES = 0.**

## Deferred content opportunities (not built this mission)

- SEO-2 §12's remaining pillar clusters beyond the six Tier-1 topics
  (Math help, Language learning, Science help, Exam preparation, Alberta
  curriculum context, Tutor guides) — Tier 2/3 per SEO-2 §20, explicitly
  out of SEO-4B's scope.
- Tutor-recruitment resource content (university-student tutor jobs,
  etc.) — SEO-2 §11/§20 Tier 2, not among the six certified Tier-1 topics.
- `Article` structured data — deferred pending a real, truthful
  author/provenance model (Phase 23).
- Any additional city page, subject×city, or subject×level page — the
  guardrail remains unchanged and ungated by this mission.

---
*Generated by mission SEO-4B. Update this document, don't duplicate it,
when a later content mission (SEO-4C or beyond) extends this resource
cluster.*
