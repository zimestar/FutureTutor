# FutureTutor — Public Information Architecture (SEO-3)

Builds on [SEO-1-BASELINE.md](./SEO-1-BASELINE.md) (technical baseline) and
[SEO-2-KEYWORD-STRATEGY.md](./SEO-2-KEYWORD-STRATEGY.md) (keyword/intent
research). This document turns that research into an explicit page
ownership map and a narrow, honest implementation — grounded throughout in
real product data (10 real subjects, 6 real academic levels, exactly 1
approved tutor at the time of writing, located in Edmonton, AB) rather than
aspirational or fabricated content.

## 1. Intent ownership map

For each search intent: the page that should rank and convert for it, the
page that supports it, the primary CTA, and the page that must **not**
compete for the same query (to avoid cannibalization, per SEO-2 §17).

| Search intent | Primary owner | Secondary support | CTA | Do-not-compete |
|---|---|---|---|---|
| General find-a-tutor | `/find-tutors` | `/` (home) | Search tutors | `/subjects` (browse, not search) |
| Tutoring in Edmonton | `/tutoring/edmonton` | `/find-tutors`, `/subjects` | Find a tutor / Become a tutor | Any other city page (none exist) |
| Math tutoring | `/subjects/math` | `/find-tutors?subject=Mathematics` | Search all math tutors | `/tutoring/edmonton` |
| English tutoring | `/subjects/english` | `/find-tutors` | Search all tutors | — |
| French tutoring | `/subjects/french` | `/find-tutors` | Search all tutors | — |
| Science tutoring | `/subjects/science` | `/find-tutors` | Search all tutors | — |
| Chemistry tutoring | `/subjects/chemistry` | `/find-tutors` | Search all tutors | — |
| Physics tutoring | `/subjects/physics` | `/find-tutors` | Search all tutors | — |
| Other real subjects (biology, computer-science, exam-prep, elementary) | `/subjects/[slug]` | `/find-tutors` | Search all tutors | — |
| Online tutoring | `/find-tutors` (mode filter) + a section within `/how-it-works` | `/tutoring/edmonton` (honest mode note) | Find a tutor | **No dedicated `/online-tutoring` page** — see §2 |
| In-person tutoring | `/tutoring/edmonton` (the only city with real in-person supply) + `/find-tutors` (mode filter) | `/how-it-works` | Find a tutor | **No dedicated `/in-person-tutoring` page** |
| Become a tutor | `/become-a-tutor` | `/tutor-resources` | Apply now | `/resources` (student-facing, not recruitment) |
| Tutoring jobs Edmonton | `/become-a-tutor` (section, no fabricated job-board framing) | `/tutoring/edmonton` (become-tutor CTA) | Apply now | No separate `/tutoring-jobs-edmonton` page — no real job-board exists |
| How tutors are vetted | `/how-it-works` (section) | `/resources/how-to-choose-a-tutor` | Find a tutor | Must stay consistent with the product's own FAQ, which explicitly does not claim background checks |
| Cost of tutoring | `/how-it-works` (pricing section, if present) | future `/resources` article | Find a tutor | No invented price-comparison page yet — real pricing model documentation is a future resources article, not fabricated numbers today |
| How to choose a tutor | `/resources/how-to-choose-a-tutor` | `/subjects/[slug]`, `/find-tutors` | Find a tutor | `/become-a-tutor` (recruitment intent, different audience) |
| Online vs in-person | Section inside `/resources/how-to-choose-a-tutor` (§2 of the article) | `/find-tutors` mode filter | Find a tutor | No dedicated comparison page — see §2 |
| Parent educational guides | `/resources` (index) | `/resources/[slug]` articles as they're added | Find a tutor | `/tutor-resources` (tutor-facing, different audience — see §9) |

## 2. Target page tree

```
/                              existing — home
/find-tutors                   existing — full directory + filters
/subjects                      existing — subject index
/subjects/[subject]            existing (10 real slugs) — now with breadcrumbs + related links
/tutors/[slug]                 existing — public tutor profile
/tutoring/[city]                NEW — local-market landing page, gated by src/content/localMarkets.ts
  /tutoring/edmonton             the one real, seeded market
/how-it-works                  existing
/become-a-tutor                existing
/tutor-resources                existing — tutor-facing hub (unchanged)
/resources                      NEW — student/parent-facing article index
/resources/[slug]               NEW — article template, gated by src/content/resources.ts
  /resources/how-to-choose-a-tutor   the one representative article
/about                          existing
/contact                        existing
/careers, /privacy, /terms,
/cookies, /tutor-agreement      existing legal/utility pages
```

**Deliberately not created**, per this mission's own scope boundary and the
real state of the product:

- `/online-tutoring` or `/in-person-tutoring` — these are *modes*, not
  distinct audiences or distinct supply; they're served as a filter on
  `/find-tutors` and a section of `/how-it-works`/the resource article. A
  dedicated page would either duplicate `/find-tutors` (thin/near-duplicate
  content) or make claims about mode-specific supply the platform can't back
  up city-by-city.
- Any subject × city combination page (e.g. "math tutoring Edmonton") —
  with 1 approved tutor total, a matrix of subject/city pages would be
  overwhelmingly empty-state doorway pages. The Edmonton page's subject
  chips (§3) cover this intent honestly without a combinatorial URL
  explosion.
- Any city page beyond Edmonton — gated by the guardrail in §4.
- A "tutoring jobs Edmonton" page — no real job board exists; the intent is
  served by `/become-a-tutor`.

## 3. The Edmonton local-market page

Route: `/[locale]/tutoring/[city]/page.tsx`, rendering only for slugs
present in `src/content/localMarkets.ts` (currently `edmonton` only — see
§4). `notFound()` for any other slug.

Content, deliberately honest about current scale:

- Hero: platform description grounded in what's actually true today
  (FutureTutor connects Edmonton students with tutors, online and in
  person) — no invented tutor counts, no "hundreds of tutors," no
  "same-day," "guaranteed match," or coverage claims.
- Intro section: explains the real application-review process (every tutor
  goes through the same approval pipeline before appearing publicly).
- Subject chips: links to all 10 real `/subjects/[slug]` pages — lets the
  page serve "math tutoring Edmonton"-shaped intent without a fabricated
  combinatorial page.
- **Live tutor grid**: queries `TutorProfile` for
  `applicationStatus: "APPROVED"` and `city` matching the market's real
  city value (case-insensitive), reusing the exact same
  `tutorProfileToCardData` pattern as `/subjects/[subject]`. This is the
  single most important honesty mechanism in the whole page — it never
  states a tutor count in copy; it shows the real, live approved tutors (or
  a genuine empty-state message if there are none), so the page can never
  drift out of sync with actual supply.
- CTA: "Become an Edmonton tutor" → `/become-a-tutor`, to grow real supply
  rather than paper over the current gap.

## 4. Local-market expansion guardrail

`src/content/localMarkets.ts` is a small, static, hand-maintained array —
**not** derived from `TutorProfile.city` at runtime. `/tutoring/[city]`
looks up the slug in this array and 404s for anything not listed.

Edmonton is seeded directly, as the platform's one real, current market — it
is *not* subject to the criteria below, which govern any **additional**
city. Per SEO-2's own guardrail (carried forward unchanged), a new city may
only be added once all four are true and documented at the time of the
change:

1. 5+ approved tutors with that city on their profile
2. 3+ distinct subjects represented among those tutors
3. realistic fulfillment ability (not just registered supply)
4. real, non-fabricated demand evidence for that market

Because the route is allowlist-gated in code (not a `generateStaticParams`
sweep over live DB city values), this guardrail is structural: nobody can
accidentally ship a thin doorway page for every distinct string a tutor
happens to type into a free-text `city` field.

## 5. Subject-page architecture

`/subjects/[subject]` stays a **section model, not a new URL scheme**: the
existing 10 real subject slugs (`src/content/subjects.ts`) each render one
page (H1, description, live approved-tutor grid or empty state). This
mission added:

- Breadcrumbs (`Home / Subjects / {Subject}`).
- A "Keep exploring" related-links row linking to the one resource article
  and to `/tutoring/edmonton` (phrased as "{Subject} tutors in Edmonton").

Full content expansion of these pages (FAQ sections, curriculum-specific
copy, grade-level breakdowns) is explicitly **out of scope** here — SEO-2
already flagged these pages as genuinely thin, and rebuilding them with
real, non-duplicated content per subject is proportionate work for a
dedicated SEO-4 mission, not a narrow addition bolted onto SEO-3.

## 6. Academic-level architecture

The 6 real academic levels (`elementary`, `middleSchool`, `highSchool`,
`cegepCollege`, `university`, `adultLearner`) are **filters within
`/find-tutors`**, not separate URLs — the same reasoning as subject × city:
a subject × level matrix would combinatorially explode into mostly-empty
pages against a 1-tutor supply base. `cegepCollege` and `adultLearner` are
real, distinct levels in the schema and must stay visible in the
`/find-tutors` filter UI and in any future subject-page content — no
Canadian-specific level should be silently dropped in favor of a
US-centric K-12 model when copy is written for these pages.

## 7-8. Resource content architecture

`src/content/resources.ts` — a small static typed registry, the same
pattern as `src/content/subjects.ts`, not a CMS/DB model:

```ts
interface ResourceArticle {
  slug: string;
  category: "choosingATutor" | "parentGuides" | "tutoringBasics";
  publishedAt: string;
  updatedAt: string;
  draft?: boolean; // excluded from index + sitemap, served noindex
}
```

Display copy (title, meta description, intro, four body sections, closing
CTA) lives in `messages/*.json` under `resourceArticles.items.<slug>`,
matching every other content page's convention in this codebase.

Routes:

- `/[locale]/resources` — index, lists only `!draft` articles via
  `listPublishedResourceArticles()`, with a genuine empty state for when the
  registry is empty.
- `/[locale]/resources/[slug]` — article template. `notFound()` for any
  slug not in the registry. `publicPageMetadata(..., index: !article.draft)`
  so a draft article's route can be reviewed without being indexed.

**Exactly one article was created**, per this mission's explicit boundary:
`how-to-choose-a-tutor` — a practical, non-promotional guide (subject/level
match, online-vs-in-person, reading a profile for specifics, judging fit
after a real first session). It makes no claims the product doesn't
support: no background-check language (the product's own FAQ explicitly
disclaims this), no invented statistics, no guarantee language.

## 9. Tutor-recruitment intent ownership

- `/become-a-tutor` — the primary recruitment landing page (unchanged).
- `/tutor-resources` — the existing tutor-facing *hub* (application steps,
  training, payouts) once someone has already decided to apply or is
  already a tutor. Unchanged by this mission.
- `/resources` (new) — explicitly **student/parent-facing**, not
  tutor-facing. `messages/*.json` keeps these as separate namespaces
  (`publicExperience.resources` for the existing tutor hub,
  `resourceHub`/`resourceArticles` for the new student-facing index/articles)
  specifically so the two audiences are never accidentally merged into one
  page or one nav entry.

## 10. Find-tutors filter/canonical policy (audit — no change needed)

`generateMetadata` in `/[locale]/find-tutors/page.tsx` never reads
`searchParams`, so the canonical is always the bare `/[locale]/find-tutors`
path regardless of any `?subject=`/`?mode=`/etc. filter combination — Google
never sees a distinct indexable URL per filter combination. This was already
correct; confirmed by direct code read, no change made.

## 11. Public tutor-profile policy (audit — no change needed)

`/[locale]/tutors/[slug]/page.tsx`'s `findApprovedTutor` query filters to
`applicationStatus: "APPROVED"` only, and exposes only first name, headline,
bio, rating, mode, city/province (no street address), languages, levels,
subjects, years of experience — no private documents or contact info.
Confirmed via `src/services/accountSuspension.ts` that there is no
independent tutor-specific `User.deactivatedAt` path that could bypass the
`applicationStatus` filter (only student/parent suspension functions exist
there) — so a suspended/deactivated tutor cannot remain publicly visible
through a side channel. No code change needed. Sitemap inclusion for
individual tutor profiles remains an open decision, explicitly deferred (see
SEO-1 Known Debt #4 and §12 below) — not decided in this mission.

## 12. Sitemap inclusion rules

`src/app/sitemap.ts` now also includes, per-locale, gated by the same static
registries the routes themselves are gated by (never a live DB sweep):

- `/resources` (static index)
- `/resources/[slug]` for every `!draft` entry in
  `listPublishedResourceArticles()`
- `/tutoring/[city]` for every entry in `localMarkets`

Tutor-profile pages (`/tutors/[slug]`) remain **out** of the sitemap,
unchanged from SEO-1 — that's a separate content-strategy decision (churn
cadence, hundreds of potential URLs) not revisited here.

## 13. Internal linking

- `/subjects/[subject]` → the resource article, and → `/tutoring/edmonton`
  (phrased per-subject: "{Subject} tutors in Edmonton").
- `/tutoring/edmonton` → all 10 subject pages (chips), `/find-tutors`,
  `/become-a-tutor`.
- `/resources` (index) → each published article.
- `/resources/how-to-choose-a-tutor` → `/find-tutors` (closing CTA); the
  index breadcrumb link back to `/resources`.
- `mainNav`/`footerNav` links into `/resources` and (footer only)
  `/tutoring/edmonton` — see §15.

## 14. Breadcrumbs

`Breadcrumbs`/`BreadcrumbItem` already existed at
`src/components/ui/Navigation.tsx` but was unused anywhere in the app. This
mission wired it into every new/touched public page:

- `/subjects/[subject]`: Home / Subjects / {Subject}
- `/tutoring/[city]`: Home / {City}
- `/resources`: Home / Resources
- `/resources/[slug]`: Home / Resources / {Article title}

`/subjects` (the index) and `/tutors/[slug]` were evaluated and left
without breadcrumbs — `/subjects` is one level deep from home already (no
real hierarchy to show), and adding breadcrumbs to `/tutors/[slug]` is a
reasonable future improvement but touches a page this mission deliberately
treated as audit-only (§11).

## 15. Navigation

`src/content/navigation.ts`:

- `mainNav` gains a `resources` entry (between "How It Works" and "About").
- `footerNav.students` gains `resources` and `tutoringEdmonton`.
- **Edmonton is deliberately kept out of `mainNav`**, per this mission's own
  suggested direction — it's a supporting local page for one market, not a
  primary global navigation destination. It's reachable from the footer,
  from every subject page's related-links row, and from search.

`Header.tsx`/`Footer.tsx` needed no changes — both already render generically
from `mainNav`/`footerNav`.

## 16. FR/EN route relationship

Unchanged convention, confirmed for every new page type: `next-intl`'s
`routing.ts` declares no `pathnames` map, so every route uses the **same
path segment under both locale prefixes** — `/en/tutoring/edmonton` and
`/fr/tutoring/edmonton`, `/en/resources/how-to-choose-a-tutor` and
`/fr/resources/how-to-choose-a-tutor`. This matches every existing route in
the app (e.g. `/en/subjects/math` / `/fr/subjects/math`) and was a
deliberate choice not to introduce a second, French-specific slug scheme —
doing so would be a disruptive URL-migration decision explicitly out of
scope here. `publicPageMetadata()` (unchanged) builds the canonical and full
reciprocal hreflang set for every new page exactly as it does for existing
pages.

## 17. Cannibalization re-validation

Re-checked SEO-2 §17's cannibalization map against every new page added
here:

- `/tutoring/edmonton` vs `/find-tutors`: different intent (local market
  landing vs. full-directory search); `/find-tutors` canonical is unaffected
  (§10) and Edmonton page content is not duplicated from `/find-tutors`.
- `/tutoring/edmonton` vs `/subjects/[subject]`: different intent (city vs.
  subject); the Edmonton page links out to subject pages rather than
  duplicating their content.
- `/resources/how-to-choose-a-tutor` vs `/how-it-works`: `/how-it-works`
  explains the platform's own process; the article is an independent,
  general-purpose buying guide. No shared H1/meta-description language
  between the two (verified by direct comparison while writing both).
- `/resources` vs `/tutor-resources`: distinct audiences (§9), distinct
  namespaces, distinct nav placement — no shared query intent.
- No new page duplicates an existing page's `title`/`metaDescription` — all
  new metadata was authored fresh, not copied.

## 18. Implementation-boundary confirmation

No schema/migration change. No Stripe/payment/financial code touched (§23
grep below). No mass content generation — exactly one new local-market page
and one new resource article were created, both real and specific, not
templated placeholders. No fabricated supply, coverage, or trust claims
anywhere in the new copy.

## 19-20. Accessibility / UX / metadata

Every new page uses `publicPageMetadata()` (canonical + full hreflang + OG +
Twitter, unchanged builder from SEO-1). Headings follow a single-H1 pattern
per page with H2s for sections. `Breadcrumbs` renders a semantic `<nav
aria-label>` / `<ol>` with `aria-current="page"` on the active crumb
(pre-existing component behavior, unchanged). All new interactive elements
are the existing `Button`/`Link` components, which already carry the
project's focus-visible/keyboard-accessible styling — no new custom
interactive elements were introduced.

## 21. No draft/empty content in the sitemap

`listPublishedResourceArticles()` filters out `draft: true` entries before
the sitemap (and the index page) ever sees them; a draft article's page
route still resolves (so it can be reviewed via direct URL) but is served
with `robots: {index:false}`. The current registry has zero draft entries —
this is forward-looking plumbing, not a currently-exercised path.

## 22. Verification performed

- `tsc --noEmit`: clean.
- `eslint` on every new/changed file: clean.
- Full unit suite (`vitest run --exclude "**/*.integration.test.ts"`):
  **173 files / 2134 tests passed**, including all pre-existing SEO-1 tests
  (`publicMetadata.test.ts`, `site.test.ts`, `sitemap.test.ts`) plus new
  tests for `localMarkets.ts`, `resources.ts`, and the extended
  `sitemap.test.ts` assertions for the new paths.
- Production build (`next build`): succeeded. `/[locale]/resources` built
  as static (SSG); `/[locale]/resources/[slug]` and `/[locale]/tutoring/[city]`
  built as dynamic server-rendered routes (both gated by `notFound()` against
  their static registries).

## 23. Financial-reachability confirmation

`grep -riE "stripe|TutorEarning|TutorTransfer|refund|payout|payment"` across
every file this mission created or touched
(`src/content/localMarkets.ts`, `src/content/localMarkets.test.ts`,
`src/content/resources.ts`, `src/content/resources.test.ts`,
`src/content/navigation.ts`, `src/app/sitemap.ts`, `src/app/sitemap.test.ts`,
`src/app/[locale]/subjects/[subject]/page.tsx`,
`src/app/[locale]/tutoring/[city]/page.tsx`,
`src/app/[locale]/resources/page.tsx`,
`src/app/[locale]/resources/[slug]/page.tsx`, and the diffed portions of
`messages/en.json`/`messages/fr.json`) returned **zero matches**.

## Known follow-up work (explicitly deferred, not silently dropped)

1. Full content rebuild of `/subjects/[subject]` pages (currently thin) —
   proportionate scope for a dedicated SEO-4 mission (§5).
2. Additional resource articles beyond the one seeded here — each new
   article is a deliberate content decision, not a batch-generation task.
3. Tutor-profile sitemap inclusion policy — still undecided (SEO-1 debt #4,
   restated in §12).
4. `www.futuretutor.ca` DNS/infrastructure fix — still undecided (SEO-1
   debt #1), unrelated to this mission.
5. Breadcrumbs on `/tutors/[slug]` — reasonable, not done here (§14).
6. Any additional local-market page — gated by §4's four-criteria guardrail;
   no city currently qualifies for addition beyond the seeded Edmonton page.

---
*Generated by mission SEO-3. Update this document, don't duplicate it, when
a later SEO mission changes any of the above.*
