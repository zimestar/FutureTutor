# FutureTutor — Landing Pages & Content Expansion (SEO-4)

## 1. Executive summary

This mission re-audited FutureTutor's complete public acquisition surface
after SEO-2 (keyword strategy), SEO-3 (information architecture), SEO-4A
(existing money-page optimization), and SEO-4B (six Tier-1 resource
articles) had already executed nearly all of SEO-2's own certified Tier-1
recommendations. The audit's central finding: **the acquisition
architecture is already substantially complete and well-built**. Exactly
one genuine, still-open content gap remained — SEO-2's own explicitly
flagged, twice-deferred "university student tutor jobs" recruitment
content — and it is better served as a new section on the existing
`/tutor-resources` page than as a new URL, per SEO-2's own original
targeting (`/tutor-resources`, not a new route).

**Zero new indexable pages were created.** One existing page was
meaningfully strengthened. This is a deliberate, evidence-based outcome,
not an under-delivery — the mission's own instruction ("if only 2-3 pages
are justified, build only 2-3... do not fill the quota") applies with
equal force at zero.

## 2. Baseline

- Branch `frontend-ui`, HEAD `ae5b755` before this mission (confirmed
  present, matching the latest deployed `production-release`).
- Live production tutor supply re-verified via a disposable, read-only
  script against the production database: **still exactly 1 approved
  tutor** (Edmonton, `math`, mode `BOTH`) — unchanged since SEO-2's own
  audit. This is the single most important fact gating this mission's
  scope: every supply-gated threshold in SEO-2/SEO-3 (5+ tutors for a new
  city, 3+ subjects for city expansion, 5+ for a subject×Edmonton page)
  remains unmet. Script deleted after use; no schema/data touched.
- Registries re-confirmed unchanged: 10 subjects (`subjects.ts`), 1 local
  market — Edmonton (`localMarkets.ts`), 6 published resource articles
  (`resources.ts`).
- All prior SEO/DATA-1/DATA-2 documentation read in full:
  SEO-2-KEYWORD-STRATEGY.md, SEO-3-INFORMATION-ARCHITECTURE.md,
  SEO-4A-EXISTING-MONEY-PAGES.md, SEO-4B-TIER1-CONTENT.md,
  SEO-PRIVATE-NOINDEX1.md, DATA-1/DATA-2 foundation docs.

## 3. Existing acquisition inventory

18 real, public, indexable pages exist today (source-verified this
session, not inferred from filenames):

| URL pattern | Locale | Page type | Primary user | Intent | Commercial/Info/Nav | Primary CTA | Analytics event | Current role |
|---|---|---|---|---|---|---|---|---|
| `/` | EN/FR | Homepage | Parent, Student, Tutor | Brand/category | Commercial | Find a Tutor (hero) | `futuretutor_page_view` (page_type: homepage) | Top-of-funnel hub, links to every other pillar |
| `/find-tutors` | EN/FR | Directory | Parent, Student | Transactional | Commercial | Search/CTA embedded | `futuretutor_page_view` (find_tutors) | Primary money page — full tutor directory |
| `/how-it-works` | EN/FR | Process explainer | Parent, Student | Commercial investigation | Commercial-support | Find a Tutor | `futuretutor_page_view` (how_it_works) | Trust/process assist, feeds Funnel D |
| `/become-a-tutor` | EN/FR | Recruitment landing | Tutor | Recruitment | Commercial | Start application (signup) | `futuretutor_page_view` (become_tutor) | Primary tutor-acquisition page |
| `/tutoring/edmonton` | EN/FR | Local landing | Parent, Student | Local/transactional | Commercial | Find a Tutor | `local_landing_viewed` | Sole local-market page (Edmonton-first) |
| `/resources` | EN/FR | Article index | Parent, Student | Informational | Informational | Per-article links | — (index has no dedicated event) | Content hub |
| `/resources/[slug]` ×6 | EN/FR | Article | Parent, Student | Informational→commercial | Informational | Per-article (`/find-tutors` ×5, `/how-it-works` ×1) | `resource_article_viewed`, `resource_primary_cta_clicked` | SEO-4B's certified Tier-1 cluster |
| `/subjects` | EN/FR | Subject hub | Parent, Student | Navigational | Navigation | Find a Tutor | — | Thin by design (SEO-2/4A both deferred rebuilding it) |
| `/subjects/[subject]` ×10 | EN/FR | Subject landing | Parent, Student | Transactional | Commercial | Find a Tutor | `subject_page_viewed` | Level/mode-aware since SEO-4A |
| `/tutors/[slug]` | EN/FR | Profile | Parent, Student | Transactional (bottom) | Commercial | Request to Book | none (not a certified event) | Approved-only, not in sitemap (deliberate, SEO-1 carryover) |
| `/tutor-resources` | EN/FR | Recruitment hub | Tutor | Recruitment/informational | Commercial-support | Become a Tutor / Create account | none page-view event; CTA fires `become_tutor_cta_clicked` | **Strengthened this mission** |
| `/about`, `/contact`, `/careers` | EN/FR | Brand/utility | All | Navigational/Informational | Navigation | Varies | — | Unchanged |
| `/privacy`, `/terms`, `/cookies`, `/tutor-agreement` | EN/FR | Legal | All | Navigational | Navigation | n/a | — | Unchanged, low sitemap priority |

Every one of the 18 already carries correct canonical + reciprocal
hreflang via the unchanged `publicPageMetadata()` helper (re-confirmed by
SEO-PRIVATE-NOINDEX1's own recent, thorough audit — not re-verified
line-by-line again here to avoid duplicating that certification).
Structured data: homepage `Organization` + `FAQPage` JSON-LD only
(unchanged, not expanded — see §19).

## 4. Search-intent map

Using SEO-2 as authoritative, cross-checked against actual implementation:

| Intent category | Example queries | Status |
|---|---|---|
| General commercial (tutor, tutoring, find a tutor) | — | **COVERED WELL** — `/find-tutors`, homepage |
| Local commercial (tutor Edmonton) | — | **COVERED WELL** — `/tutoring/edmonton` |
| Subject commercial (math tutor, etc.) | 10 real subjects | **COVERED, VARYING DEPTH** — see §11 (subject strategy) |
| Level/student intent (elementary, high school, etc.) | — | **COVERED AS FILTERS**, not separate pages — SEO-2/3's own deliberate, unchanged decision (a subject×level URL matrix would combinatorially explode against 1-tutor supply) |
| Tutor supply intent (become a tutor, tutoring jobs) | — | **COVERED, WEAK ON ONE SUB-INTENT** — general recruitment covered well (`/become-a-tutor`); "university student tutor jobs" specifically was **NOT COVERED** until this mission (now covered — §7) |
| Informational (homework help, cost, vetting, etc.) | 6 SEO-4B topics | **COVERED WELL** — no informational gap found among SEO-2's own certified Tier-1 list |
| Subject×city (math tutor Edmonton) | — | **NOT YET JUSTIFIED** — supply unchanged at 1 tutor, still below SEO-2/3's own 5-tutor threshold |
| Any city beyond Edmonton | — | **OUT OF CURRENT SCOPE** — Edmonton-first strategy, supply-gated, unchanged |
| Online-tutoring dedicated page | — | **NOT YET JUSTIFIED** — SEO-2 §10's own reasoning (mode is a filter/property, not a distinct content surface) still holds; no new justification found |

## 5. Cannibalization findings

**Zero new cannibalization risk.** This mission introduced no new URL, so
the cannibalization map SEO-2/3/4A/4B already established and
re-validated at each step remains unchanged and valid. The one content
addition (§7) lives on an existing page (`/tutor-resources`) that already
owns the "tutor recruitment support" intent — it extends that page's own
existing role rather than competing with it or with `/become-a-tutor`
(which remains the sole primary target for the bottom-funnel "become a
tutor" query, per SEO-2 §17's unchanged cannibalization map).

## 6. Tier-1 prioritization

| Item | Classification | Reasoning |
|---|---|---|
| University-student tutor-recruitment content | **P1 — build now** | Real, twice-flagged gap (SEO-2 §11/§12/§20, SEO-4B's own explicit deferred list); directly serves Funnel C, which SEO-2 itself calls "arguably the higher-leverage investment" given current 1-tutor supply |
| Math×Edmonton page | **DEFER** | Supply re-verified unchanged (1 tutor); SEO-2/3's own 5-tutor threshold still unmet |
| Any additional city | **DEFER** | Same supply gate; Edmonton remains the only qualifying market |
| Subject×city beyond math | **DEFER** | Zero supply for any subject other than math in any city |
| `/subjects` hub rebuild | **DEFER** (unchanged from SEO-2/4A) | Explicitly low commercial priority in both prior missions; no new justification surfaced this audit — reconfirmed thin-but-intentional, not silently ignored |
| `/online-tutoring` dedicated page | **DEFER** (unchanged from SEO-2) | Mode remains a filter/property, not a distinct content surface with unique framing |
| Additional resource articles beyond the 6 certified topics | **P2** | SEO-2 §12's remaining pillar clusters (math help, language learning, science help, exam prep, Alberta curriculum context) are real but lower-priority Tier 2/3, not required for this mission's own scope |
| Biology/computer-science subject-page refinement | **P2** | SEO-2 Tier 3, unchanged |

**Tier-1 scope actually built: 1 item** (university-student recruitment
content, as a new section on an existing page — 0 new URLs). This is
within the mission's 6-new-page hard cap by a wide margin, deliberately —
quality and genuine justification governed scope, not the cap.

## 7. Pages improved

**`/tutor-resources`** — added a new section, "For university students,"
between the existing hero and the existing 7-card process hub:

- **Target query family**: "tutoring jobs for university students,"
  "university student tutor jobs," "part-time tutoring for students."
- **Search intent**: Recruitment / commercial investigation.
- **Audience**: University students evaluating whether tutoring fits
  their schedule.
- **Primary page role**: Supporting section on the existing recruitment-
  support hub (not a standalone page).
- **Parent page**: `/tutor-resources` itself.
- **Primary CTA**: "Become a Tutor" → `/become-a-tutor`, reusing the
  certified `become_tutor_cta_clicked` event with `cta_location:
  "content"` — no new analytics event or property.
- **Why this deserves to exist**: a real, distinct audience segment
  SEO-2 explicitly identified as a legitimate, not-yet-served recruitment
  angle ("university students are a classic tutor-supply demographic");
  genuinely different content than the existing 7-card *process* grid
  (this section addresses *audience fit*, not *process steps*).

Content grounds every claim in real, verifiable product facts only:
tutors set their own `TutorAvailability` (real, existing product
mechanic — not a new claim), the application process is the same
`TutorApplicationStatus` pipeline every tutor goes through (document
review → interview → training → exam → final review), no compensation
figures, no earnings claims, and an explicit, honest negation — "no
separate student program and no guaranteed number of requests" — directly
satisfying SEO-2 §11's own constraint ("not invent a 'student-tutor
program' that doesn't exist as a distinct product feature").

No other existing page was found to need improvement this mission.
Homepage, Find Tutors, Tutoring Edmonton, Become a Tutor, How It Works,
and the subject-page template were all substantially strengthened by
SEO-4A already (Keep-exploring internal links, local Edmonton framing,
level/mode sections, duplicate-brand-suffix fix, trust-content
cross-links) — re-audited this mission and found to remain in good,
complete standing with no new gap.

## 8. Pages created

**None.** Zero new indexable URLs. This mission's own audit concluded
the single genuine content gap was better served by strengthening an
existing page than by creating a new one — directly matching SEO-2's own
original targeting for this exact content ("university student tutor
jobs | `/tutor-resources` new resource article").

## 9. Pages deliberately NOT created

- Any `/subjects/[subject]/edmonton` or other subject×city URL (supply
  gate unmet — §6).
- Any additional city page beyond Edmonton (supply gate unmet).
- A dedicated `/online-tutoring` page (no new content angle distinct from
  the existing mode filter + How It Works framing).
- A rebuilt `/subjects` hub with more content depth (deferred, unchanged
  low priority from SEO-2/4A — noted as a real, open opportunity for a
  future mission, not silently dropped).
- A standalone "university student tutor jobs" URL (content added to the
  existing `/tutor-resources` page instead — §7).

## 10. Edmonton strategy

Unchanged from SEO-2/3/4A, re-confirmed still accurate: Edmonton remains
the platform's sole real market (1 approved tutor, re-verified live this
mission). No fake location signal was added or found — no office,
storefront, phone number, local staff, tutor count, review, address,
partnership, or served-neighbourhood claim exists anywhere in the
Edmonton page or elsewhere. Online vs. in-person distinction remains
correctly maintained (the one real tutor's mode is `BOTH`); no immediate
local-availability promise exists anywhere in the copy.

## 11. Subject strategy

10 real subjects unchanged. Per-subject pages carry the level-aware and
mode-aware sections SEO-4A added (all 10 share one template, so the
improvement already applies uniformly). This mission did not perform a
subject-architecture rebuild — per its own explicit Phase 8 instruction,
that remains a separate, larger `SEO-SUBJECT-REBUILD1` mission if pursued
(see §23). No subject page was found thin enough to require an
emergency fix beyond what SEO-4A already did; each has a defensible,
non-duplicated reason to exist (a real taxonomy slug with its own
directory/search hand-off).

## 12. Content strategy

One new content block (§7), written to the same discipline as SEO-4A/4B's
own established content: no fabricated statistics, no invented product
features, no compensation/earnings claims, no "best"/"#1"/"guaranteed"/
"certified"/"verified"/"background checked"/"24/7"/numeric-scale language
anywhere. The one occurrence of "guarantee"/"garanti" in the new EN/FR
text is exclusively the honest negation ("no guaranteed number of
requests" / "aucun nombre garanti de demandes") — verified by a dedicated
automated test that checks every such occurrence is part of that negation,
never a standalone claim.

## 13. Internal-link architecture

No new internal links were required — the new content lives on an
already-linked page. `/tutor-resources` is already reachable from
`/become-a-tutor`'s own hero secondary CTA (SEO-3/DATA-2's own certified
wiring, confirmed unchanged) and from the site's existing navigation.
No orphan page was introduced (no new page exists to orphan). A full
internal-link audit of the existing 18-page inventory found no
regression — every Tier-1 acquisition page retains at least one
meaningful discovery path, unchanged from SEO-4A's own certified state.

## 14. CTA / conversion paths

The new section's CTA is a direct, single hop: university-student reader
→ "Become a Tutor" → `/become-a-tutor` → the real application entry
point. This mirrors the existing, certified Funnel C model (DATA-2 §7,
`docs/analytics/DATA-2-FUNNEL-CONVERSION-ANALYTICS.md`) exactly — no new
funnel, no new terminal event, just one more real entry surface feeding
the same certified `become_tutor_cta_clicked` → `signup_started` path.

## 15. EN/FR strategy

Written natively per language, not translated word-for-word, matching
every prior mission's own established discipline — confirmed by an
automated test that the FR title/description are not identical to their
EN counterparts. French uses "tuteur"/"tutorat" as the established
primary terms (per SEO-2 §4's own Canadian-French audit), paired with
context throughout (never used bare, avoiding the documented
tutor/legal-guardian ambiguity). No mixed-language UI was introduced.

## 16. Metadata matrix

`/tutor-resources`'s own metadata (`metaTitle`, `metaDescription`,
canonical, hreflang, robots) was **not** touched by this mission — the
new content is a page section, not a metadata change, so the page's
existing, already-correct `publicPageMetadata()` call is unaffected. No
metadata regression is possible from a content-only, non-metadata edit.

## 17. Sitemap / indexation

No sitemap change required or made — `/tutor-resources` was already a
correctly-included, indexable static path in `sitemap.ts` before this
mission; adding a content section to an existing page changes nothing
about its sitemap entry, canonical, or indexability. SEO-PRIVATE-
NOINDEX1's certified private-route protection is entirely unaffected —
this mission touched zero files under any of the 7 protected route
groups, zero auth-utility pages, and zero sitemap/robots generator code.

## 18. Analytics compatibility

**Zero new analytics events. Zero new analytics properties.** The new
section's only tracked interaction reuses the existing, certified
`become_tutor_cta_clicked` event with the existing, certified
`cta_location: "content"` property value — both already part of DATA-2's
frozen taxonomy. Confirmed by three new source-level tests: the exact
event/property pair is present, the real `/become-a-tutor` URL is
targeted (never an invented one), and — swept programmatically across
every `event="..."` occurrence in the changed file — no event name
outside DATA-2's certified 11-event allowlist appears anywhere in it. No
GTM, GA4, consent, or Key Event configuration was touched, referenced, or
modified.

## 19. Structured-data boundary

No structured data was added, removed, or modified. The homepage's
existing `Organization`/`FAQPage` JSON-LD (unchanged) remains the only
schema in the app. No `Review`, `AggregateRating`, `LocalBusiness`
address, `priceRange`, award, or credential schema was fabricated or
added — consistent with this mission's explicit boundary and with SEO-4B's
own prior finding that no genuine schema opportunity currently exists
beyond what's already live. Any future broader schema expansion remains
SEO-6's territory, not addressed here.

## 20. Tests

- `src/content/moneyPageMetadata.test.ts` (9 new tests, `describe`
  block "tutor-resources university-students section (SEO-4)"): EN/FR
  content presence and non-emptiness, FR is not a literal copy of EN, no
  compensation/earnings claims, no invented "student program" claim, and
  a precise positive check that every "guarantee"/"garanti" occurrence is
  part of the honest negation, never a standalone claim.
- `src/lib/analytics/instrumentation.test.ts` (3 new tests, `describe`
  block "SEO-4 — tutor-resources..."): the correct certified event/
  property pair fires, the real `/become-a-tutor` URL is targeted, and no
  event name outside DATA-2's certified allowlist appears anywhere in the
  changed file.
- Full non-DB suite re-run: **2541 passing, zero regressions** (same 36
  pre-existing DB-integration-only test files failed, identical to every
  prior mission's baseline this session — unrelated, require a live
  Postgres connection this environment doesn't have, not fabricated as
  passing).
- `tsc --noEmit`, `eslint`, `next build` all clean.
- Zero financial reachability — grep-confirmed across all 5 changed
  files (the only matches are pre-existing, unrelated lines reprinted by
  the diff context, not new financial-term references).

## 21. Production certification

See the mission's own final report for the full live breakdown. In
summary: `/en/tutor-resources` and `/fr/tutor-resources` both verified
200 with the new section's content present, correct H1/canonical/
hreflang/robots (indexable, unchanged), the "Become a Tutor" CTA
resolving to the real `/become-a-tutor` page; `robots.txt`, `sitemap.xml`,
`/api/health`, `/api/health/ready`, and `www→apex` all re-confirmed
unaffected; representative private/admin/auth routes re-confirmed still
protected (SEO-PRIVATE-NOINDEX1 unregressed).

## 22. Deferred opportunities

- `/subjects` hub content depth (SEO-2/4A's own long-standing, still-
  low-priority deferral — not touched this mission, not newly urgent).
- SEO-2 §12's remaining Tier 2/3 pillar clusters (math help, language
  learning, science help, exam prep, Alberta curriculum context) —
  real, documented, lower-priority than the item this mission built.
- Any subject×city or additional-city page — gated on real supply
  growth, re-verified still unmet.
- A dedicated `/online-tutoring` page — no new justification found.

## 23. Inputs for SEO-5 / SEO-6 / SEO-7 / SEO-SUBJECT-REBUILD1

- **SEO-SUBJECT-REBUILD1** (if pursued): `/subjects` hub and the 10
  subject-page template are the explicit candidates — this mission
  reconfirms they remain deliberately deferred, not silently thin by
  neglect.
- **SEO-6** (if it owns structured data): no urgent schema gap was found;
  `Article`/`FAQPage` expansion on the 6 resource articles remains a
  real, undecided-provenance-model question carried over from SEO-4B,
  unchanged.
- **SEO-5/SEO-7**: no specific input identified by this mission — the
  acquisition-architecture audit found the existing surface already
  substantially complete; future missions in this numbering are better
  scoped once real traffic/conversion data exists (DATA-2's own Key Event
  checkpoint, still pending the owner's GA4 confirmation) to prioritize
  against, rather than against further audit alone.
- **City-expansion criteria** (SEO-2/3's own 4-part test): re-verify
  supply whenever any future mission considers a second city or a
  subject×Edmonton page — this mission's own live check (1 tutor) is a
  point-in-time fact, not a standing certification; check again fresh
  each time.

---
*Generated by mission SEO-4. Update this document, don't duplicate it,
when a later SEO mission changes route classification, adds a certified
event/property, or builds further on this acquisition architecture.*
