# FutureTutor — Subject Hub & Subject Page Architecture (SEO-SUBJECT-REBUILD1)

## 1. Executive summary

This mission rebuilt FutureTutor's subject discovery layer — the
`/subjects` hub and the 10 `/subjects/[subject]` pages — from thin,
template-repeated shells into pages with real, subject-specific content,
without creating a single new route. The central finding driving every
decision: **live tutor supply (1 approved tutor, math only) and content
quality are separate questions**, and this mission's own governing
instruction is explicit that low supply must never be used as a reason to
noindex a page that provides genuine educational/discovery value. All 10
subject pages remain indexable; none was noindexed, removed, or merged.

## 2. Baseline

- Branch `frontend-ui`, HEAD `db3ee93` before this mission (confirmed
  present, matching the latest deployed `production-release`); SEO-
  PRIVATE-NOINDEX1 (`ae5b755`) and DATA-2 (`0fcd19b`) commits both
  reconfirmed present in history.
- Live production tutor supply re-verified, **per subject this time**
  (previous missions only confirmed the total), via a disposable,
  read-only script: **`math`: 1 approved tutor. Every other of the 9
  subjects: 0.** Script deleted after use; no schema/data touched.
- Registry re-confirmed unchanged: exactly 10 subjects in
  `src/content/subjects.ts` — not assumed from a prior audit's own count,
  read directly this mission.
- SEO-2, SEO-3, SEO-4, SEO-PRIVATE-NOINDEX1 all re-read in full.

## 3. Authoritative subject inventory

| Slug | EN label | FR label | Product-supported? | Filter-supported? | Page exists? | Indexable? | In sitemap? | Tracked? | Live supply |
|---|---|---|---|---|---|---|---|---|---|
| `math` | Mathematics | Mathématiques | Yes | Yes | Yes | Yes | Yes | `subject_page_viewed` | **1** |
| `english` | English | Anglais | Yes | Yes | Yes | Yes | Yes | `subject_page_viewed` | 0 |
| `french` | French | Français | Yes | Yes | Yes | Yes | Yes | `subject_page_viewed` | 0 |
| `science` | Science | Science | Yes | Yes | Yes | Yes | Yes | `subject_page_viewed` | 0 |
| `chemistry` | Chemistry | Chimie | Yes | Yes | Yes | Yes | Yes | `subject_page_viewed` | 0 |
| `physics` | Physics | Physique | Yes | Yes | Yes | Yes | Yes | `subject_page_viewed` | 0 |
| `biology` | Biology | Biologie | Yes | Yes | Yes | Yes | Yes | `subject_page_viewed` | 0 |
| `computer-science` | Computer Science | Informatique | Yes | Yes | Yes | Yes | Yes | `subject_page_viewed` | 0 |
| `exam-prep` | Exam Preparation | Préparation aux examens | Yes (intent-based, not a conventional subject) | Yes | Yes | Yes | Yes | `subject_page_viewed` | 0 |
| `elementary` | Elementary Support | Soutien au primaire | Yes (level-based, not a conventional subject) | Yes | Yes | Yes | Yes | `subject_page_viewed` | 0 |

Routing: every slug uses the same path segment under both locale
prefixes (no separate FR slug scheme — unchanged, established convention
since SEO-3). `exam-prep` and `elementary` remain, as SEO-2/3 both
already flagged, intent/level categories folded into the subject
taxonomy rather than true academic subjects — this mission did not
restructure that taxonomy decision (out of scope — see §24), but did
write their new content honestly reflecting their real nature (§11)
rather than pretending they're conventional subjects.

## 4. Existing hub audit

Before this mission, `/subjects` was: `MarketingPageHero` (hero) +
`SubjectGrid` (the icon grid, shared with the homepage) — nothing else.
Functionally, it was a **navigation utility**, not a discovery page: it
helped a visitor who already knew they wanted a subject list get to one,
but offered no guidance for a visitor who didn't know where to start, no
onward content path, and no explanation of how subject tutoring works
beyond the grid itself. This exactly matches why SEO-2/SEO-4A both
explicitly deferred rebuilding it — "low commercial priority" was a
reasonable call *for a full rebuild*, but the page still had a real,
fixable content gap that this mission's narrower scope could close
without the larger content investment SEO-4A/4B were reserved for.

Metadata/EN-FR/canonical/hreflang/robots/sitemap were all already
correct (unchanged, `publicPageMetadata()`, `index` defaults `true`) —
confirmed, not modified.

## 5. Existing subject-page audit

Before this mission, every one of the 10 pages shared:

- **Title/description/H1**: template strings (`"{subject} Tutors"`, etc.)
  with only the translated subject label swapped in — real per-subject
  text, but zero subject-specific *substance*.
- **Levels section**: fully generic — the same 6-level list and the same
  honesty note for every subject.
- **Mode section**: fully generic — the same online/in-person icon pair
  for every subject, no subject-specific text at all.
- **Related content**: every subject linked to the same one resource
  article (`how-to-choose-a-tutor`) and the same one local market
  (Edmonton) — reasonable (§11), but not subject-differentiated.
- **No section anywhere described what tutoring in that specific
  subject actually helps with.**

This is the exact "generic/template copy repeated with nouns swapped"
pattern this mission's own Phase 8 explicitly warned against — confirmed
as a real, present issue by direct source inspection, not assumed.

## 6. Classification per subject

All 10 subjects received the identical classification and identical
treatment, because the identified gap (missing subject-specific content)
applied identically to all 10 — there was no basis to treat any one
subject differently at the *content* layer, and the mission's own
instruction is explicit that supply differences alone must not drive a
different indexation outcome.

| Subject | Before | After | Classification |
|---|---|---|---|
| All 10 | Generic template content, technically indexable but thin subject-specific substance | Real, distinct, per-subject topic content added | **B → A** (IMPROVE_AND_INDEX → STRONG_INDEXABLE) |

No subject was classified C, D, E, or F — none was found too thin to
improve within this mission's scope, and none required noindexing.

## 7. Subject-page quality standard

Adopted (from this mission's own Phase 4 framework, applied narrowly —
not every listed element was added, only what provides genuine,
non-filler value):

1. Subject-specific hero (existing — title/H1 already real per subject).
2. **What tutoring in this subject can help with** (new this mission —
   §11).
3. Relevant educational levels (existing, SEO-4A).
4. Online vs. in-person explanation (existing, SEO-4A).
5. Find-a-Tutor conversion path (existing, unchanged).
6. Honest availability language (existing empty-state, unchanged).
7. Related resource + local-market links (existing, unchanged).

Deliberately **not** added: a subject-specific FAQ (no genuinely
subject-specific question-and-answer content existed to write without
inventing filler — matching Phase 4's own "not mandatory filler"
instruction), curriculum-specific claims (no curriculum authority exists
to draw from), and any new section that would exist only to add word
count.

## 8. Indexation decisions

| Subject | Current state | Target state | Why | Action |
|---|---|---|---|---|
| All 10 | Indexable, thin subject-specific substance | Indexable, real subject-specific substance | Content quality and marketplace supply are separate questions (this mission's own explicit instruction) — a page can provide legitimate educational/discovery value with 0 current supply, as long as the empty state is honest (it already was) | Add real content; keep indexed |

**Zero subjects were noindexed, removed, or redirected.**

## 9. Hub architecture

`/subjects` now reads: Hero (unchanged) → `SubjectGrid` (unchanged) →
**new** "Not sure where to start?" guidance section (real, useful
choosing-a-subject advice: start with a specific weak class if one
exists; consider Elementary Support or Exam Preparation for general
support; the full directory is always searchable) → **new** "Keep
exploring" link row (How to Choose a Tutor, When to Get a Tutor, How It
Works, Tutoring in Edmonton — four real, existing destinations). No
fabricated availability count, no fabricated review/rating, no SEO text
wall — two short additions, matching Phase 7's own "do not make the hub
a giant SEO text wall" instruction.

## 10. Subject-page architecture

Structure (updated portion in bold): Breadcrumbs → Hero/H1/description →
**new: "What \[Subject\] tutoring can help with" (intro sentence + 3 real
topic items)** → Levels section (unchanged) → Mode section (unchanged) →
Tutor grid / honest empty state (unchanged) → Related resource + local
link (unchanged).

## 11. Content strategy

Ten genuinely distinct intro sentences and 30 distinct topic items were
written (one set per subject, in both languages — 80 new strings total),
grounded in general, defensible, conservative descriptions of what
tutoring in each subject can help with — never a specific FutureTutor
tutor's specialization claim (per this mission's own explicit "a math
tutor *can* help students work through…" vs. "our math tutors
*specialize in*…" distinction). Examples: math → number sense/algebra/
geometry; English → reading comprehension/writing/grammar; French →
grammar/vocabulary/oral communication; science → concepts/reasoning/
course foundations. `exam-prep` and `elementary` were written honestly
as what they actually are — general exam-readiness support and
foundational multi-subject support for younger learners — rather than
forced into a conventional-subject frame they don't fit. No tutor
counts, degrees, credentials, specializations, availability figures,
ratings, reviews, schools served, success rates, grade-improvement
claims, response/matching times, or background-check claims appear
anywhere in the new content — confirmed by two automated tests scanning
every subject's EN and FR text for prohibited claim language.

## 12. Availability / supply language

Unchanged — the existing, honest per-subject empty state
(`"No approved public {subject} tutors match yet. Try the full directory
or another subject."`) was not touched. The new topic content never
states or implies current tutor availability for any subject; it
describes what tutoring in that subject can help with in general, which
remains true regardless of current marketplace supply.

## 13. Level relationship

Unchanged — levels remain filters within `/find-tutors` and an
informational section on each subject page (SEO-2/3's own established,
unrevisited decision). No `/subjects/[subject]/[grade]` route was
created or considered viable; the existing levels section (all 6 real
levels, honesty-guarded) continues to serve this need without URL
fragmentation.

## 14. Find Tutors integration

Unchanged and reconfirmed safe: the existing CTA
(`/find-tutors?subject=${encodeURIComponent(label)}`) passes the
translated subject *label* (not a raw arbitrary value or a slug) as a
free-text query parameter, which `TutorDirectory.tsx`'s own existing,
unmodified logic matches case-insensitively against each subject's own
translated label — the exact same mechanism a visitor typing into the
search box themselves would produce. This mission reused it exactly, per
its own "if preselection already exists and is safe, reuse it"
instruction — no new search architecture, no new query-parameter
semantics, and `TutorDirectory.tsx` (the one file in this area with real
financial-logic proximity via `calculateCustomerPrice`) was read for
confirmation only, never edited.

## 15. Resource relationships

Unchanged for subject pages (still `how-to-choose-a-tutor`, the one
genuinely subject-agnostic, broadly relevant article — no article in the
current 6-article registry is written to be more relevant to one subject
than another, so forcing an artificial 1:1 subject→article mapping would
invent relevance that doesn't exist). The hub's new "Keep exploring" row
adds two real resource links (`how-to-choose-a-tutor`,
`when-to-get-a-tutor`) — both genuinely relevant to "which subject should
I start with" intent, both real, published, registry-validated slugs
(confirmed by an automated test that both resolve via
`getResourceArticle()`).

## 16. Edmonton relationship

Unchanged for subject pages (still linking to the one real market,
`localMarkets[0]`). The hub now links to `/tutoring/edmonton` in its new
"Keep exploring" row — a reasonable, useful, reciprocal cross-link (the
Edmonton page already links back to subject pages via its own subject
chips, SEO-3). No subject×Edmonton URL was created, and no subject-
specific Edmonton tutor availability is implied anywhere — the Edmonton
page's own live tutor grid remains the sole source of truth for that.

## 17. Analytics

**Zero new analytics events. Zero new analytics properties.**
`subject_page_viewed` with the real `subject_slug` continues to fire
exactly as before (confirmed unchanged by source inspection and a new
test). No CTA on the rebuilt hub fires any tracking at all (its new links
are plain informational cross-links, matching the established "Keep
exploring" pattern elsewhere in the app, which has never been a tracked
CTA type) — confirmed by a test that no `trackEvent`/`event="..."` call
exists anywhere in the hub's source. No GTM, GA4, consent, or Key Event
configuration was touched.

## 18. Metadata

Unchanged for both the hub and subject pages — `publicPageMetadata()`
was not modified, no page's `index`/title/description parameters were
changed. Titles remain subject-owned (`"{subject} Tutors"`), never
Edmonton-stuffed (`/tutoring/edmonton` remains the sole owner of local
intent, per SEO-2/3's own cannibalization map, re-confirmed unaffected
since no subject page's title/H1/metadata changed).

## 19. EN/FR

All 80 new strings (10 subjects × (1 intro + 3 items) × 2 locales, plus
the hub's guidance/explore blocks) were written natively per language,
not translated word-for-word — confirmed by an automated test that no
subject's FR intro is identical to its EN intro. French terminology
matches the product's own established labels exactly (Mathématiques,
Anglais, Français, Science, Chimie, Physique, Biologie, Informatique,
Préparation aux examens, Soutien au primaire) — none were renamed, and no
routing/filter consequence exists since these are translated display
labels only, never slugs.

## 20. Internal linking

New: hub → 2 resource articles, How It Works, Edmonton (§9). Unchanged:
homepage/Find Tutors → Subjects (SubjectGrid, both places); Subjects hub
→ every subject page (SubjectGrid); subject page → Find Tutors, one
resource article, Edmonton. No orphan subject page exists — every one of
the 10 is linked from the hub's own grid, confirmed by an automated test
that the hub still renders `<SubjectGrid>` (which maps over the full,
unmodified registry).

## 21. Sitemap / indexation

No sitemap change — no subject's indexation state changed, so
`sitemap.ts`'s existing, unmodified `SUBJECT_PATHS` (all 10, unchanged)
remains exactly correct. SEO-PRIVATE-NOINDEX1's protection is entirely
unaffected — zero files under any protected route group were touched.

## 22. Tests

`src/app/seoSubjectRebuild1.test.ts` (**26 new tests**): every registry
subject has real, non-empty, mutually distinct EN and FR topic content;
no prohibited availability/credential/outcome claim appears anywhere in
that content (EN and FR, separately checked); the subject page's source
correctly wires the new section to the subject-specific translation key
(not a hardcoded string); `subject_page_viewed`/`subject_slug` firing is
unchanged; unknown slugs still 404 before any metadata is returned; the
Find Tutors CTA and resource/local-market links still target real,
registry-validated destinations; no event name outside DATA-2's
certified allowlist appears anywhere in either changed file; no
subject×city/grade/mode route directory exists anywhere in the app
(swept via a real filesystem walk); the hub's new content wires
correctly and introduces no new analytics event; zero financial
reachability across every changed file.

Full non-DB suite re-run: **2567 passing, zero regressions** (same 36
pre-existing DB-integration-only test files failed, identical to every
prior mission's baseline this session — unrelated, not fabricated as
passing). `tsc --noEmit`, `eslint`, `next build` all clean.

## 23. Production certification

See the mission's own final report for the full live breakdown — in
summary: `/en/subjects`, `/fr/subjects`, and a representative set of
subject pages all verified 200 with the new content genuinely present in
the live HTML, correct canonical/hreflang/robots (indexable, unchanged),
the Find Tutors CTA resolving correctly; `robots.txt`, `sitemap.xml`,
`/api/health`, `/api/health/ready`, `www→apex`, and a representative
private route were all re-confirmed unaffected.

## 24. Deferred opportunities

- A deeper subject-taxonomy restructure (e.g., separating `exam-prep`/
  `elementary` from the conventional-subject list architecturally, as
  SEO-2 §9 itself flagged as an open question) — this mission wrote
  honest content around the existing taxonomy but did not restructure it;
  a genuine architecture change is a larger, separate decision.
- Subject-specific FAQ content — deliberately not added this mission, no
  genuinely subject-specific Q&A existed to write without inventing
  filler; worth revisiting if real, recurring subject-specific questions
  are identified from support/search data.
- Any subject×city page (e.g., a future `math` × Edmonton page) — still
  correctly gated by SEO-2/3's own supply threshold (5+ tutors), re-
  verified unmet (1 tutor, math only).
- A richer per-subject resource-article relationship, if/when future
  articles are written with genuine subject-specific angles (today's 6
  articles are all subject-agnostic by design).

---
*Generated by mission SEO-SUBJECT-REBUILD1. Update this document, don't
duplicate it, when a later SEO mission changes subject taxonomy, adds
subject-specific resource content, or further develops this
architecture.*
