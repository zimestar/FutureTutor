# FutureTutor — Funnel & Conversion Analytics (DATA-2)

## 1. Executive purpose

DATA-1 built and certified the analytics *foundation* (consent, GTM/GA4
wiring, PII safety, private-route exclusion — CLOSED/GO,
`docs/analytics/DATA-1-ANALYTICS-FOUNDATION.md`). This mission builds the
first trustworthy **funnel/conversion model** on top of that foundation: it
audits which of the 11 certified events actually fire from real production
code, closes the gaps that made several of them theoretical rather than
real, defines FutureTutor's canonical public-acquisition funnels, and
recommends (without touching) which events GA4 should treat as Key Events.
No dashboard is built here — that is DATA-3.

## 2. DATA-1 dependency

Everything below assumes DATA-1's certified architecture, unchanged by this
mission:

- GTM `GTM-KCNP4STK`, GA4 `G-3BQQXRZHY2`, consent-gated, human-certified
  live in production.
- `trackEvent()` (`src/lib/analytics/track.ts`) is the sole call surface —
  every event in this document goes through it, and therefore through its
  three runtime gates: the PII denylist, `isAnalyticsEligiblePath()`
  (private/admin/auth-utility routes excluded), and
  `hasAnalyticsConsent()`.
- The 11 certified events and 9 certified properties (below) are
  **unchanged** — this mission wires up existing gaps, it does not expand
  the taxonomy (Phase 4 required a STOP-and-report if expansion were
  genuinely necessary; it never was).
- Private/authenticated/admin/financial surfaces remain entirely outside
  this document's scope, by the same architecture DATA-1 already enforces.

## 3. Analytics population definition

Every number any FutureTutor funnel built from this document produces
describes **consented, analytics-eligible public-surface traffic only** —
not all visitors. Concretely, excluded from every funnel below:

- Any visitor who has not granted ANALYTICS consent (undecided or denied).
- Any activity on a private/authenticated/admin/auth-utility route
  (`/dashboard/*`, `/tutor/*`, `/messages/*`, `/notifications/*`,
  `/session/*`, `/admin/*`, `/family/*`, `/login`, `/signup`,
  `/forgot-password`, `/reset-password`, `/verify-email`,
  `/check-email`) — these routes never load GTM at all, so no event can
  physically fire there.
- Anyone with ad/tracking-blocking software that prevents `gtm.js` from
  loading (a real, unmeasurable population by construction — no analytics
  system can see traffic it cannot instrument).
- Anyone browsing before GTM has finished loading on their very first
  pageview of a session (a small, structurally unavoidable gap — see §16).

No funnel number in DATA-2 or any future DATA-3 dashboard should be
presented as "total visitors" or "all traffic" — it is always "consented,
GTM-instrumented, analytics-eligible-route traffic."

## 4. Current event coverage audit

Audited by reading every real call site in production code (not assumed
from `types.ts`), classified A–E per this mission's own scheme. **Before
this mission**, three certified events had zero real call sites anywhere
in the codebase (Class C) despite being fully defined and type-safe;
**after** this mission, all 11 have at least one real, reachable call site.

| Event | Call sites (after this mission) | Public routes | Trigger | Properties actually sent | Reachable in production | Duplicate risk | Missing/deferred call sites | Funnel role | Class |
|---|---|---|---|---|---|---|---|---|---|
| `futuretutor_page_view` | `find-tutors/page.tsx`; homepage `page.tsx` **(new)**; `how-it-works/page.tsx` **(new)**; `become-a-tutor/page.tsx` **(new)** | `/`, `/find-tutors`, `/how-it-works`, `/become-a-tutor` | `<TrackPageView>` mount (once, empty dep array) | `locale`, `page_type` (`homepage`/`find_tutors`/`how_it_works`/`become_tutor`) | YES | None — distinct name from GA4's automatic `page_view` (§13) | `/subjects` (hub), `/about`, `/contact`, `/tutor-resources`, `/resources` (index), `/tutors/[slug]` — all still use `page_type: "other_public"`'s absence, i.e. unmeasured by this custom event; deliberately deferred, not required by any funnel below | Entry point, Funnels A/B/C/D | Was B (1/4 real page types wired), now **A** |
| `find_tutor_cta_clicked` | `Header.tsx` ×2 (`header`/`header_mobile`); `Hero.tsx` **(new, `hero`)**; `FeaturedTutors.tsx` **(new, `content`)**; `FinalCTA.tsx` **(new, `content`** — renders on home + how-it-works); `MarketingPageHero.tsx` auto-map **(new, `hero`** — fires wherever any of its 8 call sites' `primary`/`secondary` href is `/find-tutors`: how-it-works, resources, subjects, tutoring/edmonton primary; about secondary) | Nearly every real public page | Click | `locale?`, `cta_location` (`header`/`header_mobile`/`hero`/`content`) | YES | None — one handler per button, no re-fire | `/about`'s own standalone "future.cta" Button (not via MarketingPageHero) remains untracked | Entry/intermediate, Funnels A & B | Was B (Header only), now **A** |
| `become_tutor_cta_clicked` | `Header.tsx` ×2; `TutorCTA.tsx` **(new, `content`)**; `FinalCTA.tsx` **(new, `content`)**; `MarketingPageHero.tsx` auto-map **(new, `hero`** — tutoring/edmonton secondary, resources secondary) | Homepage, how-it-works, tutoring/edmonton, resources | Click | `locale?`, `cta_location` | YES | None | `tutoring/[city]/page.tsx`'s own second, standalone become-a-tutor button (below the tutor grid) remains untracked — the page's hero CTA already covers this page once per pageview | Entry event, Funnel C | Was B, now **A** |
| `how_it_works_cta_clicked` | `Hero.tsx` **(new, `hero`)**; `HomeStory.tsx` **(new, `content`)**; `MarketingPageHero.tsx` auto-map **(new, `hero`** — about primary, subjects secondary) | Homepage, about, subjects | Click | `locale?`, `cta_location` | YES | None | `find-tutors/page.tsx`'s and `tutoring/[city]/page.tsx`'s own inline text links remain untracked (deliberately deferred — see §17) | Entry event, Funnel D | **Was C (zero call sites) — now A** |
| `resource_article_viewed` | `resources/[slug]/page.tsx` | All 6 resource articles × 2 locales | `<TrackPageView>` mount | `locale`, `resource_slug` (registry-validated) | YES | None | None | Entry, Funnel B (content variant) | Unchanged, **A** |
| `resource_primary_cta_clicked` | `resources/[slug]/page.tsx` (`TrackedCtaButton`) | Same 6 articles | Click | `resource_slug`; `cta_location` not currently passed (optional) | YES | None | None | Intermediate, Funnel B | Unchanged, **A** |
| `subject_page_viewed` | `subjects/[subject]/page.tsx` | All 10 subject pages × 2 locales | `<TrackPageView>` mount | `locale`, `subject_slug` (registry-validated) | YES | None | None | Entry, Funnel B | Unchanged, **A** |
| `local_landing_viewed` | `tutoring/[city]/page.tsx` | `/tutoring/edmonton` × 2 locales | `<TrackPageView>` mount | `locale`, `city_slug` (allowlist-validated) | YES | None | None | Entry, Funnel B (local variant) | Unchanged, **A** |
| `signup_started` | `MarketingPageHero.tsx` auto-map **(new** — become-a-tutor primary, how-it-works secondary, tutor-resources secondary, no `user_intent` set); `become-a-tutor/page.tsx`'s own closing CTA **(new, explicit `user_intent: "become_tutor"`)** | `/become-a-tutor`, `/how-it-works`, `/tutor-resources` | Click, immediately before navigating to the (analytics-excluded) `/signup` route | `locale?`, `user_intent?` (`"become_tutor"` where known, otherwise omitted) | YES | None | The public tutor-profile "Request to Book" → `/signup` CTA (`tutors/[slug]/page.tsx`) is a real, valuable `user_intent: "find_tutor"` signal — **deliberately deferred**, not wired this mission, because that file directly imports and passes a Stripe publishable key to a sibling component; touching it carries materially higher review risk than every other file in this mission's scope for a single CTA. `LoginForm.tsx`'s own "sign up" link is correctly left untouched: it renders only on `/login`, an analytics-excluded route, so any event fired there would already be silently dropped by `trackEvent()`'s own route check — adding tracking there would be dead code, not a real fix. | Terminal event, Funnels A & C | **Was C (zero call sites) — now A** |
| `login_started` | `Header.tsx` ×2 (desktop + mobile — sitewide, every public page); `MarketingPageHero.tsx` auto-map **(new** — contact page secondary) | Every public page (Header) + `/contact` | Click, before navigating to (analytics-excluded) `/login` | `{}` (locale not currently threaded through) | YES | None | None material — this is a returning-user signal, not an acquisition-funnel step (§9) | Diagnostic/engagement only — not part of Funnels A–D | **Was C (zero call sites) — now A** |
| `search_started` | `TutorSearch.tsx` (rendered in `Hero.tsx` on the homepage, and in `TutorDirectory.tsx` on both `/find-tutors` [public] and `/dashboard/find-tutors` [private]) | `/`, `/find-tutors` | Form submit | `level?`, `mode?` — both fixed `<select>` values, never the free-text subject query | YES on public routes; **correctly suppressed on `/dashboard/find-tutors`** by `trackEvent()`'s own `isAnalyticsEligiblePath()` check — confirmed, not a gap | None | `locale` not currently threaded through (optional, low priority) | Core intermediate step, Funnels A & B | Unchanged, **A** |

**No event is classified D (incorrectly emitted) or E (no longer
justified).** Every one of the 11 certified events maps to a real,
currently-relevant funnel role.

## 5. Funnel A — Parent/Student Acquisition

**Public discovery → Find Tutor intent → Search started → Signup started**

- **Entry event(s)**: `futuretutor_page_view` (`page_type: "homepage"` or
  `"find_tutors"`).
- **Intermediate event(s)**: `find_tutor_cta_clicked` (any `cta_location`)
  → `search_started`.
- **Terminal public conversion event**: `signup_started` (public-surface
  intent to create an account — this mission does **not** track account
  creation success, which happens on the analytics-excluded `/signup`
  route, nor anything after it).
- **Dimensions allowed**: `locale`, `page_type`, `cta_location`, `level`,
  `mode`, `user_intent`.
- **What it DOES measure**: how many consented public visitors reach a
  discovery surface, click toward tutor search, actually submit a search,
  and click through to begin signup.
- **What it explicitly does NOT measure**: whether the visitor completes
  signup, verifies email, creates a student profile, submits a booking
  request, or pays for anything — all private/authenticated/financial and
  explicitly out of DATA-2's scope by this mission's own instruction (no
  "booking completed" event was invented).
- **Known attribution limitations**: a visitor can enter this funnel from
  many different `cta_location`s across a session; GA4 attributes each
  step independently, not as a single guaranteed linear session path. A
  visitor who searches directly from the Hero's embedded `TutorSearch`
  without first clicking a separate "Find a Tutor" CTA skips the
  intermediate `find_tutor_cta_clicked` step entirely (the Hero's search
  form is itself the entry surface in that case) — this is real behavior,
  not a tracking gap.
- **Consent limitation**: only consented, analytics-eligible-route traffic
  is represented (§3).

## 6. Funnel B — Content → Tutor Search

**Resource / Subject / Local landing → Find Tutor CTA → Search started →
Signup started**

- **Entry event(s)**: `resource_article_viewed` (`resource_slug`),
  `subject_page_viewed` (`subject_slug`), or `local_landing_viewed`
  (`city_slug`).
- **Intermediate event(s)**: `resource_primary_cta_clicked` or
  `find_tutor_cta_clicked` → `search_started`.
- **Terminal public conversion event**: `signup_started`.
- **Dimensions allowed**: `locale`, `resource_slug`, `subject_slug`,
  `city_slug`, `cta_location`, `level`, `mode`, `user_intent`.
- **What it DOES measure**: which specific piece of content (which
  article, which subject, the Edmonton page) leads a consented visitor
  toward an actual search and signup intent.
- **What it explicitly does NOT measure**: content engagement depth (scroll
  position, read time), which GA4 Enhanced Measurement feature is
  deliberately OFF for this reason (DATA-1 §9-10); whether the visitor read
  the content or bounced immediately after the view event fired.
- **Known attribution limitations**: `resource_slug`/`subject_slug`/
  `city_slug` are registry-validated but the funnel cannot distinguish
  "this content caused the search" from "this visitor would have searched
  anyway and happened to view this content in the same session" — this is
  a standard GA4 funnel-exploration limitation (correlation within a
  session, not causal attribution), not specific to this implementation.
- **Consent limitation**: §3.

## 7. Funnel C — Tutor Acquisition

**Public tutor-recruitment discovery → Become Tutor CTA → Signup started
with tutor intent**

- **Entry event(s)**: `futuretutor_page_view`
  (`page_type: "become_tutor"`), or any page carrying a
  `become_tutor_cta_clicked`-capable CTA (homepage, how-it-works, Edmonton
  page, resources index).
- **Intermediate event(s)**: `become_tutor_cta_clicked`
  (`cta_location`: `header`/`header_mobile`/`hero`/`content`).
- **Terminal public conversion event**: `signup_started` with
  `user_intent: "become_tutor"` — set explicitly on `/become-a-tutor`'s own
  closing CTA (the one call site this mission could confidently tag,
  since that entire page is unambiguously tutor-facing). CTAs reached via
  `MarketingPageHero`'s generic href-map (e.g. `/how-it-works`'s secondary
  `/signup` link) fire `signup_started` **without** `user_intent` set,
  since that page serves both audiences and guessing would be worse than
  omitting.
- **Dimensions allowed**: `locale`, `page_type`, `cta_location`,
  `user_intent`.
- **What it DOES measure**: how many consented visitors show tutor-side
  intent (clicking Become a Tutor, or reaching `/become-a-tutor` itself)
  and how many of those reach signup with tutor intent explicitly tagged.
- **What it explicitly does NOT measure**: the real, much longer tutor
  validation pipeline (`TutorApplicationStatus`:
  `DRAFT → SUBMITTED → UNDER_REVIEW → INTERVIEW_REQUIRED → … → APPROVED`)
  — entirely private/authenticated and out of scope. This funnel only
  covers the public-surface *intent* to start that pipeline, never its
  completion.
- **Known attribution limitations**: `signup_started` events without
  `user_intent` set (from `/how-it-works`, `/tutor-resources`,
  `/contact`'s indirect paths) cannot be cleanly separated from
  parent/student signups in the same GA4 report without also segmenting
  by the referring page — a real, disclosed limitation, not a defect.
- **Consent limitation**: §3.

## 8. Funnel D — How It Works Assist

**How It Works → How-It-Works CTA → Find Tutor or Become Tutor intent →
Signup started where applicable**

- **Entry event(s)**: `futuretutor_page_view`
  (`page_type: "how_it_works"`), or `how_it_works_cta_clicked` from any
  other page (homepage Hero/HomeStory, about, subjects).
- **Intermediate event(s)**: from `/how-it-works` itself, either
  `find_tutor_cta_clicked` (hero) or `signup_started` (hero secondary, no
  `user_intent`) — this page's own hero offers both paths.
- **Terminal public conversion event**: `signup_started`
  (parent/student path) — this funnel does not have its own distinct
  terminal event; it feeds into Funnel A's or Funnel C's terminal step
  depending on which path the visitor takes from `/how-it-works` onward.
- **Dimensions allowed**: `locale`, `page_type`, `cta_location`.
- **What it DOES measure**: how much process-transparency content
  (How It Works) contributes to onward intent, from any entry page.
- **What it explicitly does NOT measure**: which specific FAQ item or
  process step a visitor read before clicking through — the page's journey
  steps and FAQ section are not individually instrumented (no scroll/
  section-view tracking exists or is recommended here).
- **Known attribution limitations**: this is explicitly an *assist*
  funnel, not a standalone conversion path — its terminal signal is
  whichever of Funnel A/C's terminal events follows, so it will always be
  reported as a contributing step in GA4's own path/attribution reports,
  not as an independent funnel with its own unique conversion count.
- **Consent limitation**: §3.

## 9. Event → funnel matrix

| Event | Funnel A | Funnel B | Funnel C | Funnel D | Not in any funnel |
|---|---|---|---|---|---|
| `futuretutor_page_view` | Entry (homepage/find_tutors) | — | Entry (become_tutor) | Entry (how_it_works) | — |
| `find_tutor_cta_clicked` | Intermediate | Intermediate | — | Feeds into A | — |
| `become_tutor_cta_clicked` | — | — | Intermediate | Feeds into C | — |
| `how_it_works_cta_clicked` | — | — | — | Entry/intermediate | — |
| `resource_article_viewed` | — | Entry | — | — | — |
| `resource_primary_cta_clicked` | — | Intermediate | — | — | — |
| `subject_page_viewed` | — | Entry | — | — | — |
| `local_landing_viewed` | — | Entry | — | — | — |
| `signup_started` | Terminal | Terminal | Terminal | Feeds A/C's terminal | — |
| `login_started` | — | — | — | — | **Yes — returning-user diagnostic, not acquisition** |
| `search_started` | Intermediate | Intermediate | — | — | — |

## 10. Event → property matrix

| Event | `locale` | `page_type` | `cta_location` | `resource_slug` | `subject_slug` | `city_slug` | `user_intent` | `level` | `mode` |
|---|---|---|---|---|---|---|---|---|---|
| `futuretutor_page_view` | ✓ required | ✓ required | | | | | | | |
| `find_tutor_cta_clicked` | optional | | ✓ required | | | | | | |
| `become_tutor_cta_clicked` | optional | | ✓ required | | | | | | |
| `how_it_works_cta_clicked` | optional | | ✓ required | | | | | | |
| `resource_article_viewed` | ✓ required | | | ✓ required | | | | | |
| `resource_primary_cta_clicked` | optional | | optional | ✓ required | | | | | |
| `subject_page_viewed` | ✓ required | | | | ✓ required | | | | |
| `local_landing_viewed` | ✓ required | | | | | ✓ required | | | |
| `signup_started` | optional | | | | | | optional | | |
| `login_started` | optional | | | | | | | | |
| `search_started` | optional | | | | | | | optional | optional |

No property outside this certified 9-property allowlist is used anywhere
in this mission's changes.

## 11. CTA location vocabulary

`CtaLocation` (`src/lib/analytics/types.ts`) is a closed enum:
`"hero" | "content" | "header" | "header_mobile" | "footer_section" |
"nav"`. This mission used only existing values — **none were invented**.
Real current usage after this mission:

| Value | Meaning | Where it's actually used |
|---|---|---|
| `header` | The primary desktop site header's CTA row | `Header.tsx` desktop Find/Become-a-Tutor buttons |
| `header_mobile` | The mobile slide-out nav's CTA row | `Header.tsx` mobile Find/Become-a-Tutor buttons |
| `hero` | A page's own top hero section | Homepage `Hero.tsx`; every `MarketingPageHero`-rendered CTA (8 pages) |
| `content` | An in-body section CTA, below the hero | `HomeStory.tsx`, `TutorCTA.tsx`, `FeaturedTutors.tsx`, `FinalCTA.tsx` |
| `footer_section` | *(defined, not yet used)* | No footer CTA is currently tracked — the footer's own links were not in this mission's scope |
| `nav` | *(defined, not yet used)* | Main navigation links (Subjects, Resources, About, How It Works) are plain navigation, not conversion CTAs, and were not wired to fire CTA events — a deliberate distinction, not a gap: instrumenting every nav click as a "CTA" would blur the difference between browsing and converting |

`locale` is confirmed `"en" | "fr"` only, enforced by TypeScript
(`Locale = "en" | "fr"`) — no other value can compile.
`resource_slug`/`subject_slug`/`city_slug` continue to pass through
`slugGuards.ts`'s runtime registry validation
(`isKnownResourceSlug`/`isKnownSubjectSlug`/`isKnownCitySlug`), confirmed
unchanged by this mission (not touched). `level`/`mode` remain fixed-choice
values by construction — `TutorSearch.tsx`'s `<select>` elements only ever
offer `""` plus the 6 real `gradeLevelKeys` for level, and `""`/`"online"`/
`"in-person"` for mode; the TypeScript property type itself is `string`
(not a closed union) but no call site can pass anything else since there is
exactly one call site and its values are DOM-`<option>`-constrained.

## 12. GA4 automatic vs. FutureTutor custom page views

**GA4's automatic `page_view`** (Enhanced Measurement, already ON per
DATA-1) fires on every real page load/SPA navigation, on every public page
GTM ever loads on (never on private routes, since GTM itself never loads
there — the privacy boundary is inherited for free). It carries
`page_location`, `page_title`, `page_referrer` generically, but **no**
FutureTutor-specific semantic dimension.

**`futuretutor_page_view`** (our custom event) fires from
`<TrackPageView>`, confirmed via source to run exactly once per real mount
(`useEffect` with an empty dependency array) — never twice, never on
re-render. It exists specifically to carry a compile-time-safe `page_type`
dimension GA4's automatic event cannot provide, and is deliberately scoped
to only the four page types that need it as a generic dimension
(`homepage`, `find_tutors`, `how_it_works`, `become_tutor`). The other
three page-view-shaped surfaces (`local_landing_viewed`,
`subject_page_viewed`, `resource_article_viewed`) intentionally use their
**own** distinct event names instead of the generic one with a parameter —
a deliberate DATA-1 architecture decision, not an inconsistency: a
distinct event name is easier and more reliable to build a GA4 Explore
funnel step from than a parameter-filtered generic event.

**No duplicate-counting risk exists**: GA4's automatic `page_view` and
every FutureTutor custom event are structurally different event *names* —
enforced by a permanent regression test
(`src/lib/analytics/types.test.ts`) asserting no FutureTutor event name
ever collides with GA4's reserved/automatically-collected event names.
Both firing on the same pageview is expected and desired, not a bug: GA4
simply counts each once, under its own name.

**How DATA-2 reporting should use each**: use GA4's automatic `page_view`
(segmented by `page_location`/`page_title`) for raw reach/traffic-by-URL
reporting across the *entire* public site, including pages this mission
did not specially instrument. Use the FutureTutor custom events for
anything requiring the semantic dimension (`page_type`, `resource_slug`,
`subject_slug`, `city_slug`) or for building any of Funnels A–D's GA4
Explore funnel steps, since those are most reliable when built from
distinct, purpose-built event names.

## 13. Recommended GA4 Key Events

Conservative model — page views and content views are **not** recommended
as Key Events (no strong reason exists to treat a view as a conversion).

| Event | Classification | Recommend as Key Event? | Why |
|---|---|---|---|
| `find_tutor_cta_clicked` | Primary conversion intent | **Yes** | Explicit, high-intent action toward the parent/student acquisition path |
| `become_tutor_cta_clicked` | Primary conversion intent | **Yes** | Explicit, high-intent action toward the tutor acquisition path |
| `search_started` | Primary conversion intent | **Yes** | A real, closed-value search submission — the clearest mid-funnel commercial-intent signal FutureTutor has |
| `signup_started` | Primary conversion intent | **Yes** | The terminal public-surface event for both Funnel A and Funnel C — the closest thing to a "conversion" this mission's public-analytics scope can measure |
| `how_it_works_cta_clicked` | Secondary engagement | No | Process-transparency engagement, not itself a commercial commitment |
| `resource_primary_cta_clicked` | Secondary engagement | No | Content-to-commercial handoff — valuable, but one step upstream of the actual intent signals above |
| `login_started` | Diagnostic event | No | A returning-user action, not new acquisition — marking it a Key Event would conflate retention with acquisition in GA4's own conversion reporting |
| `futuretutor_page_view` | Diagnostic event | No | Page views should not be conversions |
| `resource_article_viewed` | Diagnostic event | No | Content view, not conversion |
| `subject_page_viewed` | Diagnostic event | No | Content view, not conversion |
| `local_landing_viewed` | Diagnostic event | No | Content view, not conversion |

## 14. GA4 owner actions

**No GA4 API mutation was made by this mission.** To apply the
recommendation above, in GA4 (Admin → Events, or Admin → Key Events,
depending on the current GA4 UI):

1. Go to **Admin → Data display → Events** (or **Key Events** directly,
   in newer GA4 UIs).
2. Locate each of these four event names in the list (they will only
   appear once real traffic has sent them at least once — see §15 human
   checkpoint):
   - `find_tutor_cta_clicked`
   - `become_tutor_cta_clicked`
   - `search_started`
   - `signup_started`
3. Toggle **"Mark as key event"** (or the equivalent switch) for each of
   the four. Do **not** mark any other event as a Key Event.
4. Do **not** enable Google Signals, advertising personalization, or any
   cross-device/demographics feature as part of this action — out of
   scope for DATA-2.
5. Optional, once enough real events exist: under **Explore → Funnel
   exploration**, build one exploration per funnel (A–D above) using the
   entry/intermediate/terminal events listed in §5–8, segmented by the
   properties listed in each funnel's "dimensions allowed" line.

## 15. PII/privacy guardrails

Unchanged from DATA-1, re-confirmed for every new call site this mission
added: no email, name, phone, address, free text, raw search query, school
name, tutor name, student name, user ID, database ID, booking/session ID,
Stripe/payment ID, auth token, exact location, or IP-derived custom field
appears in any property this mission wired up — confirmed by the existing
compile-time property allowlist (`AnalyticsEventPropertiesMap`), the
runtime PII denylist (`piiDenylist.ts`, unchanged), and a new source-level
regression test asserting every file this mission touched never references
a financial/Stripe/payment symbol
(`src/lib/analytics/instrumentation.test.ts`). No new property was added
to the certified 9-property allowlist — every new call site uses only
existing properties.

## 16. Known attribution limitations

- **First-pageview gap**: GTM (and therefore every custom event) cannot
  fire before a visitor grants consent, and cannot fire at all before
  `gtm.js` finishes loading after consent is granted — a structurally
  unavoidable small gap on a visitor's very first instrumented pageview,
  disclosed here rather than hidden.
- **Session-path attribution**: GA4 attributes each event independently;
  none of Funnels A–D guarantee a single linear visitor path was followed
  in order — a visitor can enter mid-funnel (e.g. searching directly from
  the homepage Hero without a prior `find_tutor_cta_clicked`).
- **`signup_started` without `user_intent`**: several real call sites
  (via `MarketingPageHero`'s generic href-map) fire `signup_started`
  without `user_intent` set, since the referring page serves both
  audiences and guessing would be worse than omitting — reports needing a
  clean parent/student vs. tutor split must also segment by referring
  page or landing page in the same session.
- **Ad/tracking blockers**: any visitor whose browser blocks
  `googletagmanager.com/gtm.js` is invisible to every event in this
  document, by construction — not a defect, a real and disclosed
  limitation of client-side, consent-gated analytics.
- **No cross-tab consent sync**: consent state is per-browser-storage;
  DATA-1's own documented limitation, unchanged here.

## 17. What DATA-2 explicitly does NOT measure

- Booking creation, session scheduling, session completion, payment, or
  any financial event — **no such event was invented**, per this
  mission's own explicit instruction. Booking/payment is private/
  authenticated and structurally excluded by `isAnalyticsEligiblePath()`.
- Account creation success (the actual signup form submission) — that
  happens on the analytics-excluded `/signup` route itself.
- Tutor application pipeline progress (`TutorApplicationStatus` states
  beyond the public-surface intent to start).
- Scroll depth, time-on-page, or section-level content engagement — GA4
  Enhanced Measurement's relevant toggles remain OFF per DATA-1's own
  decision, unchanged here.
- A handful of known, deliberately deferred CTA surfaces (documented
  per-event in §4's "Missing/deferred call sites" column) — most notably
  the public tutor-profile "Request to Book" → signup CTA, deferred due
  to that file's direct proximity to Stripe-key-passing code, and a small
  number of in-body text links (find-tutors page's and the Edmonton
  page's own inline "How It Works" links) left untracked as lower-value
  than the hero-level CTAs this mission prioritized.
- Any non-consented, non-public, or blocked-by-extension traffic (§3).

## 18. Inputs for DATA-3 dashboard

For whoever builds DATA-3 (explicitly not this mission):

- The 4 funnels (§5–8), each with its own entry/intermediate/terminal
  event set and allowed dimensions — ready to become GA4 Explore funnel
  explorations directly.
- The event→funnel and event→property matrices (§9–10) as the canonical
  cross-reference.
- The 4 recommended Key Events (§13) as the natural "headline conversion"
  tiles for any dashboard.
- The known limitations (§16) and explicit non-measurements (§17) as the
  disclaimer language any dashboard should carry alongside its numbers —
  DATA-3 should not present a "conversion rate" without this context.
- The CTA location vocabulary (§11) as the dimension for any
  "which CTA placement performs best" dashboard view.

## 19. Deferred work

- `DATA-1-GTM-LOADER-HARDENING1` (P2, carried over from DATA-1's own
  closeout — evaluate enforcing route eligibility inside the GTM loader
  itself). **Not absorbed into this mission**, per this mission's own
  explicit instruction.
- Wiring the remaining documented-but-deferred CTA/pageview gaps (§4, §17)
  — about page's standalone Find-a-Tutor button, find-tutors/Edmonton
  pages' inline How-It-Works text links, Edmonton page's second
  Become-a-Tutor button, and the tutor-profile "Request to Book" →
  signup CTA (deferred specifically for its Stripe-key-file proximity) —
  each a small, well-scoped follow-up, not urgent to any of the 4 funnels
  defined here.
- `footer_section`/`nav` CTA-location values remain defined but unused —
  revisit only if a real footer or nav conversion surface is identified.
- DATA-3 (funnel/conversion dashboards) — explicitly out of this
  mission's scope.

---
*Generated by mission DATA-2. Update this document, don't duplicate it,
when a later analytics mission changes the funnel model, adds a certified
event/property, or closes one of the deferred items above.*
