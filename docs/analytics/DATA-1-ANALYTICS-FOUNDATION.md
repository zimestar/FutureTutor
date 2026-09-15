# FutureTutor — Analytics Foundation (DATA-1)

A production-safe, privacy-minimizing analytics foundation.

## Activation status (as of this update)

The owner has completed the external Google-side setup:

- **GA4 property**: `FutureTutor`, web stream `FutureTutor Production`,
  domain `https://futuretutor.ca`, Measurement ID `G-3BQQXRZHY2`. Enhanced
  Measurement: Page views ON, Outbound clicks ON; Scrolls/Site search/Form
  interactions/Video engagement/File downloads all OFF.
- **GTM container**: account `FutureTutor`, container `futuretutor.ca`,
  container ID `GTM-KCNP43TK`. No GA4 tag has been published inside it
  yet — a draft Google Tag was started during setup and discarded.
- **Search Console**: domain property `futuretutor.ca` already existed and
  is already verified (no new DNS action was needed). Sitemap
  `https://futuretutor.ca/sitemap.xml` already submitted.
- **`NEXT_PUBLIC_GTM_ID=GTM-KCNP43TK`** has been set on the production
  Railway environment (a public identifier, not a secret) and deployed —
  confirmed by a successful redeploy.

**GTM still cannot activate anything**: `shouldLoadGtm()` requires the env
var (now set) *and* explicit ANALYTICS consent (`ConsentBanner` is still
not mounted, so consent can never be granted yet) *and* a published GA4
tag inside the GTM container (none exists yet). All three remaining gates
mean the foundation is still fully inert in production today. See **DATA-1
— GTM ACTIVATION HUMAN CHECKPOINT** at the end of this document for the
exact remaining owner-side steps before `ConsentBanner` is mounted and the
Cookie Policy is updated.

**A real defect was found and fixed during this re-audit**: the generic
pageview event was originally named `page_view` — colliding with GA4's
own reserved, automatically-collected event of the same name (Enhanced
Measurement's "Page views," already ON). Firing a custom event under that
exact name would have double-counted every pageview once GA4 was wired
up. Renamed to `futuretutor_page_view` (Phase 4's table and `types.ts`
updated; a new permanent regression test, `types.test.ts`, asserts no
FutureTutor event name ever collides with GA4's reserved event-name list
again).

## Phase 0 — audit findings

**Existing analytics**: `src/lib/analytics.ts` — a small, already-existing
provider-agnostic `trackEvent()` stub with a typed event union, called
from 2 real sites (`Header.tsx` ×2, `TutorSearch.tsx` ×1). It only ever
did `console.debug` outside production — no vendor was ever wired. This
mission extends it (now `src/lib/analytics/`) rather than building a
parallel system.

**A real PII gap was found and fixed in the existing code**:
`TutorSearch.tsx` was calling `trackEvent("search_started", { subject,
level, mode })`, where `subject` is the raw free-text value from the
search box (`search.subjectPlaceholder`: *"Math, English, French,
Chemistry..."* — a text input, not a fixed dropdown). Since `trackEvent`
was a no-op, this never actually shipped anywhere, but it would have the
moment a real vendor was wired. Fixed: `subject` is no longer sent at all
(`{ level, mode }` only — both closed, safe enum-shaped values).

**Existing consent infrastructure — a real but unrelated model**: a
`ConsentRecord` Prisma model exists (`prisma/schema.prisma`, generated
client at `src/generated/prisma/models/ConsentRecord.ts`), created in an
earlier "Phase H.1" mission. Its own header comment states: *"structural
hooks only; no consent-gating logic exists yet and no legal policy is
decided by this model's existence."* Critically, every record requires a
real `actorUserId` (a `User` foreign key) — it is scoped to
authenticated-user consent (its `studentProfileId`/
`guardianRelationshipId` fields point at a guardian/legal-consent concern,
not a cookie banner). **DATA-1 does not touch or reuse this model.**
Anonymous visitors on public marketing pages have no `User` row to attach
a database consent record to — the ANALYTICS-category consent this
mission needs is a plain client-side (localStorage) state machine
instead, documented in Phase 14 below.

**Existing cookies/tracking**: none beyond Auth.js session cookies and the
locale-preference cookie (`NEXT_LOCALE`), both classified as ESSENTIAL by
FutureTutor's own live Cookie Policy — no consent choice required for
either.

**Privacy Policy / Cookie Policy coverage**: FutureTutor has a complete,
detailed, already-live Cookie Policy (`src/content/legal/cookieContent.en.ts`
/ `.fr.ts`, version `2026-08-30`, product-owner-approved, "subject to final
external Canadian legal review" per its own header comment). It already:

- Explicitly anticipates this exact mission (§14, "Future Analytics
  Services"): *"Before introducing analytics technologies that materially
  expand tracking..., FutureTutor will assess: what information is
  collected; why; whether necessary; whether consent is required; whether
  users should be able to refuse it; whether this Cookie Policy or Privacy
  Policy must be updated... Where consent is required, FutureTutor will
  seek the appropriate consent before activating the relevant technology."*
- States, in a literal summary table (§45): *"Routine third-party
  behavioural analytics: Not currently represented as used."* **This
  sentence is the hard constraint DATA-1 must not falsify.** It stays true
  today because nothing this mission built can activate without a human
  configuring a real vendor ID (Phase 2 below) — the moment that changes,
  this table row becomes false and the Policy text must be updated
  first.
- Already explicitly rules out Meta Pixel, TikTok Pixel, advertising
  Google tags, and LinkedIn Insight Tag (§17) — consistent with this
  mission's own out-of-scope list.
- Documents heightened privacy expectations for minors (§23/24) and
  Québec-specific "necessity before consent" / "privacy by default"
  requirements (§37/38) — both directly shaped this mission's
  default-deny consent model and its decision not to recommend session
  replay on any authenticated surface.

**CSP impact**: **no Content-Security-Policy exists anywhere in this
codebase today** (confirmed: no `next.config.ts` `headers()` entry, no
`Content-Security-Policy` string anywhere in `src/`). There is therefore
nothing to weaken, and introducing a sitewide CSP is a separate, larger
security initiative explicitly out of this mission's scope — deferred,
not silently skipped.

**Public/private route boundary**: reused directly from
SEO-PRIVATE-NOINDEX1's own certified classification (`dashboard`, `tutor`,
`messages`, `notifications`, `session`, `admin`, `family` route groups) —
not re-derived, so it can never drift out of sync with that mission's own
noindex boundary. Auth-utility pages (`login`, `signup`, `forgot-password`,
`reset-password`, `verify-email`, `check-email`) are additionally excluded
per this mission's own Phase 6 instruction.

## Phase 1 — external account precheck

| Value | Classification | Notes |
|---|---|---|
| GTM container ID | PUBLIC IDENTIFIER | Ships in every page's HTML once loaded — not a secret. Env var: `NEXT_PUBLIC_GTM_ID`. |
| GA4 Measurement ID | NOT REQUIRED IN APP (yet) | If GTM is adopted as the sole tag-management layer (this mission's design), GA4 is configured *inside* the GTM container via Google Tag Manager's own UI — no separate ID or code in this repository. |
| Search Console verification | HUMAN CONFIGURATION REQUIRED | Domain-property verification via DNS TXT record (Namecheap) — see Phase 11. |
| PostHog project key/host | NOT REQUIRED — DEFERRED | See Phase 12 decision. |
| Microsoft Clarity project ID | NOT REQUIRED — DEFERRED | See Phase 13 decision. |

No ID of any kind was fabricated, guessed, or hardcoded anywhere in this
mission's code. `NEXT_PUBLIC_GTM_ID` is referenced only via
`process.env.NEXT_PUBLIC_GTM_ID`, documented in `.env.example` as an
empty, commented-out example (`# NEXT_PUBLIC_GTM_ID="GTM-XXXXXXX"`,
matching Google's own generic placeholder format — not a real container).

## Phase 2 — human checkpoint

**Status at first checkpoint**: no GTM container, GA4 property, or Search
Console verification existed yet, as far as that session could determine.

**Status now**: the owner has completed the GA4 property, GTM container,
and confirmed Search Console was already verified (see "Activation
status" above). `NEXT_PUBLIC_GTM_ID` is set in production. **One step
remains and requires owner action inside the GTM UI** — publishing a GA4
Configuration tag in the GTM container — see **DATA-1 — GTM ACTIVATION
HUMAN CHECKPOINT** at the end of this document.

## Phase 3 — architecture

`src/lib/analytics/` (evolved from the pre-existing flat
`src/lib/analytics.ts` — same public import path, `@/lib/analytics`, so
the two existing call sites needed no import change):

```
src/lib/analytics/
  types.ts          — the event catalog: AnalyticsEventPropertiesMap
  piiDenylist.ts     — runtime PII denylist (defense-in-depth)
  slugGuards.ts      — validates slug-shaped properties against real registries
  routePolicy.ts     — deterministic analytics-eligible-route classification
  consent.ts         — client-side ANALYTICS-category consent state machine
  environment.ts     — production-hostname gate
  vendors.ts         — the ONLY file allowed to reference a vendor/network call
  track.ts           — trackEvent() — the one call surface every component uses
  index.ts           — public barrel (re-exports the above)
```

Every UI call site uses `trackEvent("event_name", {...})` — never a direct
`gtag()`/`dataLayer.push()`/vendor SDK call outside `vendors.ts`.

## Phase 4 — event naming standard

`lowercase_snake_case`, one user action per event, never a UI-
implementation detail. Every event is declared once in
`AnalyticsEventPropertiesMap` (`types.ts`), which is simultaneously its
documentation and its compile-time property allowlist:

| Event | Business purpose | Trigger | Allowed properties | Destination |
|---|---|---|---|---|
| `futuretutor_page_view` | Measure acquisition/landing-page performance | `<TrackPageView>` mounts on a public page | `locale`, `page_type` | GA4 (via GTM) |
| `find_tutor_cta_clicked` | Measure the primary parent/student conversion path | The "Find a Tutor" CTA is activated | `locale?`, `cta_location` | GA4 |
| `become_tutor_cta_clicked` | Measure tutor-recruitment intent | The "Become a Tutor" CTA is activated | `locale?`, `cta_location` | GA4 |
| `how_it_works_cta_clicked` | Measure process-transparency engagement | A "How It Works" link is activated | `locale?`, `cta_location` | GA4 |
| `resource_article_viewed` | Measure content engagement per Tier-1 topic | A resource article page renders | `locale`, `resource_slug` | GA4 |
| `resource_primary_cta_clicked` | Measure content→conversion handoff | A resource article's own CTA is activated | `locale?`, `resource_slug`, `cta_location?` | GA4 |
| `subject_page_viewed` | Measure subject-level landing performance | A subject page renders | `locale`, `subject_slug` | GA4 |
| `local_landing_viewed` | Measure local-SEO landing performance | The Edmonton page renders | `locale`, `city_slug` | GA4 |
| `signup_started` | Measure top-of-funnel signup intent | The signup flow is entered from a marketing surface | `locale?`, `user_intent?` | GA4 |
| `login_started` | Measure returning-visitor engagement | The login flow is entered from a marketing surface | `locale?` | GA4 |
| `search_started` | Measure tutor-discovery engagement | The `/find-tutors` search form is submitted | `locale?`, `level?`, `mode?` | GA4 |

**Prohibited on every event, without exception**: any property in the PII
denylist (Phase 5), any raw pathname, any database ID, any free-text
value (the search box's `subject` field is the one real example found and
fixed — Phase 0).

## Phase 5 — PII denylist

`piiDenylist.ts` is the runtime, defense-in-depth control (the primary
control is `AnalyticsEventPropertiesMap` itself — a call site cannot pass
an unlisted property and compile). Denylisted keys (case/separator-
insensitive): `email`, `name`, `firstName`/`lastName`/`fullName`, `phone`,
`address`, `postalCode`, `message`/`messageBody`, `notes`/`studentNotes`,
`bookingComment`, `documentUrl`/`documentName`, `paymentIntent`,
`chargeId`, `stripeAccountId`, `authToken`, `sessionToken`, `password`,
and every `*Id` shape (`userId`, `studentId`, `tutorId`, `bookingId`,
bare `id`). `trackEvent()` drops (never throws, never partially sends) any
event whose properties contain a denylisted key.

## Phase 6-7 — route/URL privacy and event taxonomy

Implemented exactly as scoped — see Phase 0's route-boundary reuse and
Phase 4's table. `routePolicy.ts`'s `isAnalyticsEligiblePath()` is the
single deterministic policy: PUBLIC marketing/content pages are eligible;
every private/admin route group and every auth-utility page is excluded,
by real segment-boundary matching (never a naive substring — `/tutor`
never matches the public plural `/tutors/[slug]`, mirroring `proxy.ts`'s
own established precision). `trackEvent()` itself defensively re-checks
the current path before forwarding anything, in case a shared component
is ever reused on a page it wasn't designed for.

## Phase 8 — safe event properties

Implemented as closed TypeScript unions (`PageType`, `CtaLocation`,
`UserIntent`, `Locale`) plus three registry-backed slug guards
(`slugGuards.ts`): `isKnownSubjectSlug`/`isKnownResourceSlug`/
`isKnownCitySlug` validate against the real, live `subjects`/
`resourceArticles`/`localMarkets` registries — the exact same single
sources of truth SEO-3/SEO-4B/SEO-INFRA-WWW1 already use for their own
routes. A slug not in one of these three lists is not free text made
safe by convention; it's structurally impossible for an unknown/
fabricated slug to be sent.

## Phase 9-10 — GTM / GA4 design decisions

**GTM is the sole vendor entry point** (`vendors.ts`). If/when adopted,
GA4 is configured *as a tag inside the GTM container* via Google Tag
Manager's own UI — this codebase never independently injects a
`gtag.js`/GA4 script. `shouldLoadGtm()` requires all three: production
hostname (Phase 21), `NEXT_PUBLIC_GTM_ID` configured, and explicit
ANALYTICS consent granted. `loadGtmIfEligible()` is idempotent (guarded by
a stable script-element id — verified by test, injects the script exactly
once across repeated calls).

**GA4 Enhanced Measurement — recommendation once GA4 is configured**:

| Feature | Recommendation | Why |
|---|---|---|
| Page views | Rely on this mission's own `page_view`/`*_viewed` semantic events instead of GA4's automatic pageview tracking | Automatic pageview tracking has no route-eligibility awareness — it would fire on every route including private ones unless separately configured; this mission's own instrumentation is already route-policy-aware |
| Scroll | Disable | No product value identified yet; adds noise |
| Outbound clicks | Disable initially | Would need its own PII review (destination URLs) before enabling |
| Site search | Disable | `/find-tutors` search is already covered by the semantic `search_started` event, which strips the free-text query |
| Form interactions | Disable | Would risk capturing form field data on authenticated forms if not scoped carefully — no product need identified for public-page forms |
| Video engagement | Disable | Not applicable — no public-page video content |
| File downloads | Disable | Not applicable today |

## Phase 11 — Google Search Console

**Resolved — already existed, no action was needed.** A domain property
for `futuretutor.ca` was already verified before this mission (the owner
confirmed this at the human checkpoint) — no new DNS record was created or
requested. Sitemap `https://futuretutor.ca/sitemap.xml` was already
submitted; live-reconfirmed reachable and current (Phase 25/27 below).
The property's discovered-page count reflects a snapshot from before
SEO-3/SEO-4A/SEO-4B expanded the sitemap — Search Console's own indexing
reports update on Google's crawl schedule, not on demand; this was not
forced and should not be treated as an error.

## Phase 12 — PostHog evaluation

**BENEFIT**: session replay, funnel analysis, feature flags, product
analytics beyond simple pageview/event counting.

**PRIVACY RISK**: session replay records real DOM/interaction content by
default; even with input masking, the risk surface on a platform with
students, parents, and messaging/booking/session content is materially
higher than a simple event-counting tool like GA4.

**PRIVATE APP IMPLICATION**: PostHog's real value is usually *inside* the
authenticated product (funnel analysis across dashboard/booking flows) —
exactly the surface this mission's own Phase 6/17 requires excluding from
behavioral analytics by default.

**SESSION REPLAY**: not recommended for any authenticated student/parent/
tutor surface in this mission.

**DATA-1 DECISION: DEFER.** FutureTutor serves minors (via guardian-
managed accounts) and the product itself has heightened privacy
obligations documented in its own Cookie Policy (§23/24). No current
product need justifies the added privacy surface area for the initial
foundation. Revisit only with an explicit, scoped follow-up mission if a
real product-analytics need (not just "more data") is identified.

## Phase 13 — Microsoft Clarity evaluation

**Same session-replay/heatmap privacy profile as PostHog.** Even
restricted to public marketing pages only, Clarity's default behavior
records real user interactions, and this session found no existing
mechanism in this codebase for the kind of clean, verified public-only
scoping the mission requires before recommending it.

**DATA-1 DECISION: DEFER.** No public-marketing-only isolation was
verified as achievable within this mission's scope; per the mission's
own conservative default ("if clean public-only isolation cannot be
guaranteed: DEFER"), this is deferred rather than partially implemented.

## Phase 14 — consent architecture

`consent.ts` — a plain client-side (localStorage) state machine, **not**
the `ConsentRecord` database model (Phase 0's finding — different
concern, different scope, anonymous visitors have no `User` row to attach
a DB record to). Categories: `ESSENTIAL` (implicit — auth/session/locale
cookies, no choice needed, matches the live Cookie Policy §26 exactly) and
`ANALYTICS` (explicit opt-in, default `"undecided"`, never assumed
granted). A `MARKETING` category is a documented possible future addition
— **not implemented**, since no marketing pixel exists to gate (matches
this mission's own out-of-scope list).

State shape: `{ analytics: "granted" | "denied" | "undecided",
policyVersion: string | null, decidedAt: string | null }`, keyed under
`localStorage["futuretutor_consent_v1"]`. `policyVersion` records the
live Cookie Policy's own `COOKIE_POLICY_VERSION` export
(`cookieContent.en.ts`, currently `"2026-08-30"`) at the moment of
decision — so a future Policy text change can be compared against a
stored decision (the comparison itself is not implemented yet, since
there's no live banner to re-prompt from today).

`acceptAnalyticsConsent()` / `rejectAnalyticsConsent()` /
`revokeAnalyticsConsent()` are all persistent (survive reloads) and
revocable (`revoke` returns to `"undecided"`, ready for a "manage
preferences" control). Fails closed to `"undecided"` if storage is
unavailable or throws (private browsing) — never assumes consent.

`ConsentBanner.tsx` — built, fully tested, **not mounted in the live root
layout**. EN/FR copy (natural, not a literal translation — "Accepter les
données analytiques" / "Refuser les éléments non essentiels"), two
equally-weighted buttons (no dark pattern — Accept and Reject are the same
size/prominence), a "Learn more" link to the live `/cookies` page. Not
mounted because the live Cookie Policy's own text (§14/§28) commits to
providing this mechanism *before* activating the relevant technology —
showing a banner asking users to decide about analytics that doesn't
exist yet would be premature and confusing. **Mounting this component is
the very last step**, after a real GTM container exists and the Cookie
Policy text is updated to match (see the human-checkpoint section).

## Phase 15 — cookie/storage inventory

| Key | Purpose | Category | Duration | Created | Cleared |
|---|---|---|---|---|---|
| `futuretutor_consent_v1` | The visitor's ANALYTICS consent decision | Essential (to the consent mechanism itself, not analytics) | Until manually cleared or `revokeAnalyticsConsent()` is called | On first Accept/Reject click (not created at all until a decision is made) | Browser "clear site data," or the (not-yet-mounted) banner's revoke control |
| GTM's own cookies (`_ga`, `_ga_*`, etc.) | Set by Google's scripts once GTM/GA4 actually loads | Analytics | Per Google's own documented defaults (not independently verified/claimed here) | Only after `shouldLoadGtm()` passes — today, never | Browser controls, or once implemented, a consent-revoke hook that also clears these |

No other storage is introduced by this mission. Duration for Google's own
cookies is intentionally **not** asserted as a specific value here — per
this mission's own Phase 15 instruction not to claim vendor retention
values without verification, and none has been performed (no vendor is
active to verify against).

## Phase 16 — privacy policy / cookie disclosure

**No change made to `cookieContent.en.ts`/`.fr.ts` in this mission.** The
Cookie Policy's current text ("not currently represented as used") stays
literally true, because nothing built in DATA-1 can activate without the
human checkpoint below being completed first. Once a real GTM container
exists and activation is authorized:

**HUMAN LEGAL REVIEW REQUIRED** before that happens — specifically,
§13/§14/§28/§45 of `cookieContent.en.ts` (and the parallel FR sections)
need factual updates: §45's summary table row *"Routine third-party
behavioural analytics: Not currently represented as used"* must change to
reflect the real, active configuration (GTM/GA4, consent-gated,
public-marketing-pages-only), and §28 ("Cookie Banner") should reference
the now-live `ConsentBanner` mechanism. This document records the
technical facts precisely so that update, when authorized, is accurate —
it does not draft the legal text itself.

## Phase 17 — private surface exclusion (reconfirmed)

Tested exhaustively (`routePolicy.test.ts`, 20 cases) against real EN and
FR paths: every private/admin route group and every auth-utility page is
excluded; every real public page (including `/tutors/[slug]`, which a
naive `/tutor` prefix match would wrongly exclude) is eligible.

## Phase 18 — GTM dataLayer policy

`pushToDataLayer()` (`vendors.ts`) is the only function that touches
`window.dataLayer`, and it only ever receives the exact `{ event,
...properties }` shape `trackEvent()` builds from an
`AnalyticsEventPropertiesMap`-typed call — never a user/session/booking/
payment/tutor/student/parent object. There is no code path in this
mission that could push an arbitrary object to the dataLayer.

## Phase 19 — CSP / security

No CSP exists to audit or weaken (Phase 0). No CSP was introduced by this
mission — establishing one is a separate, larger security initiative,
explicitly deferred rather than bolted on narrowly here. When a real GTM
container is configured, the only origin a future CSP would need to
allow is `https://www.googletagmanager.com` (script-src) and
`https://www.google-analytics.com` (connect-src, once GA4 is configured
inside the GTM container) — documented here for whoever eventually adds a
CSP, not implemented now.

## Phase 20 — performance

`loadGtmIfEligible()` injects the GTM script with `async = true` (never
blocking). No SDK is bundled into the app — the only vendor code is a
single dynamically-injected `<script src>` tag, and only once all three
gates (Phase 9) pass. Duplicate-injection is prevented by a stable
element id (tested). GA4 is not independently loaded (Phase 9 — one
ownership path only).

## Phase 21 — environment isolation

`environment.ts`'s `isProductionAnalyticsEnvironment()` checks
`window.location.hostname` against `site.url`'s own hostname (the same
single upstream source SEO-1/SEO-INFRA-WWW1 already treat as
authoritative) — tested against `localhost`, a Railway preview hostname,
`staging.futuretutor.ca`, and (deliberately) `www.futuretutor.ca` (which
308-redirects to the apex per SEO-INFRA-WWW1 and should never itself run
analytics). Only the bare `futuretutor.ca` hostname passes.

## Phase 22 — SEO regression (reconfirmed)

No canonical/hreflang/sitemap/robots/`publicPageMetadata` code was
touched by this mission. Live-reconfirmed in Phase 25 below.

## Phase 23 — tests

134 new tests across 9 files in `src/lib/analytics/` (route eligibility ×20,
PII denylist ×11, slug guards ×6, consent ×7, environment ×5, vendors ×11,
track ×5, source-level instrumentation regression ×16, plus the
pre-existing `cookieContent.test.ts` COOKIE-22 test rewritten — not
deleted — to verify the new module's transmission boundary instead of the
retired flat file). Full suite: **187 files / 2377 tests passing**. `tsc
--noEmit`, `eslint`, `next build` all clean. External identifiers used in
tests are explicitly fake (`GTM-TEST0000`) — no real secret or ID appears
anywhere in a fixture.

## Phase 24 — financial / product safety boundary

No Stripe/Payment/TutorEarning/TutorTransfer/refund/payout/pricing/
Quick-Match code was touched, called, or referenced (confirmed by grep
across every changed file — the only matches are this mission's own
negative test assertions, the PII denylist's forbidden-key names, and one
real route-path string, `/tutor/payouts`, used to test that page's
correct *exclusion* from analytics). **FINANCIAL BUSINESS LOGIC CHANGES =
0.**

## Phase 25 — auth / security boundary

No authentication, authorization, role, permission, or admin-guard code
was touched. `routePolicy.ts` reads the same route classification
SEO-PRIVATE-NOINDEX1 already established rather than re-implementing or
altering any check.

## Phase 26 — deployment gate

**This mission's committed code is deployed to production** (the
foundation itself — types, denylist, route policy, consent module,
environment gate, vendor loader, the two updated call sites, and
`TrackPageView` wired into four real pages). It is provably inert: no
`NEXT_PUBLIC_GTM_ID` is configured anywhere, so `shouldLoadGtm()` is
unconditionally `false` and no vendor script is ever injected, no
dataLayer push ever leaves the browser to a real destination. This is
"prepare the architecture as far as safely possible," not "active
production analytics" — the ConsentBanner is deliberately not mounted,
and no vendor will activate until the human checkpoint below is
completed and a follow-up mission explicitly authorizes activation.

## Deferred / follow-up work

- **GTM-side GA4 tag configuration** — see **DATA-1 — GTM ACTIVATION HUMAN
  CHECKPOINT** immediately below. The one remaining blocker.
- Mounting `ConsentBanner` in the root layout — blocked on the above, and
  on the Cookie Policy text update (Phase 16).
- A CSP covering the GTM/GA4 origins (Phase 19) — deferred as a separate
  security initiative.
- PostHog / Microsoft Clarity — deferred (Phases 12-13), revisit only with
  an explicit scoped follow-up mission and a real identified need.
- DATA-2 (funnel dashboards) / DATA-3 (SEO dashboard) — explicitly out of
  this mission's scope.

---

## DATA-1 — GTM ACTIVATION HUMAN CHECKPOINT

The GTM container (`GTM-KCNP43TK`) exists but has no published GA4
configuration — a draft Google Tag was started during initial setup and
discarded. This cannot be created from code: it requires clicking through
the Google Tag Manager UI. Below is the precise, minimal configuration
this foundation's architecture requires — nothing more.

### What the application already guarantees (do not duplicate in GTM)

- GTM's own script is **never loaded at all** unless the visitor is on
  the real production hostname, `NEXT_PUBLIC_GTM_ID` is configured (now
  true), **and** the visitor has explicitly granted ANALYTICS consent via
  `ConsentBanner`. There is no "load GTM, then check consent inside GTM"
  step — the container is simply absent from the page until consent is
  granted. **Do not configure a GTM Consent Mode / Consent Initialization
  trigger** — it would be redundant with (and could only ever be more
  permissive than) the app-level gate that already fully owns this.
- GTM is **never present at all** on any private/admin/auth-utility route
  (`routePolicy.ts`, tested against 20 real EN/FR paths). **Do not add
  page-path trigger conditions to exclude `/dashboard`, `/admin`,
  `/messages`, etc.** — those pages never even load the container, so
  such a trigger would never fire and adds nothing.
- Every event already excludes PII and free text by construction
  (`AnalyticsEventPropertiesMap` + the runtime denylist). GTM does not
  need its own PII-scrubbing variables or triggers.

### Step-by-step: publish the GA4 configuration

1. Open Google Tag Manager → container **futuretutor.ca**
   (`GTM-KCNP43TK`) → **Workspace: Default Workspace**.
2. **Tags → New**:
   - Name: `GA4 Configuration - FutureTutor`
   - Tag Configuration → **Google Tag** (or "Google Analytics: GA4
     Configuration," depending on the current GTM UI) → Tag ID / Measurement
     ID: `G-3BQQXRZHY2`
   - Leave "Send a page view event when this configuration loads" **ON**
     (default) — this is GA4's own automatic pageview, intentionally kept
     distinct from this app's own `futuretutor_page_view` custom event
     (renamed specifically to avoid colliding with this automatic one —
     see "Activation status" above).
   - Triggering: **Initialization - All Pages** (GTM's built-in trigger
     that fires once per container load). Do not scope this to specific
     paths — see "do not duplicate" above.
3. **Tags → New** (for the FutureTutor semantic events):
   - Name: `GA4 Event - FutureTutor Custom Events`
   - Tag Configuration → **Google Analytics: GA4 Event**
   - Configuration Tag: select the `GA4 Configuration - FutureTutor` tag
     from step 2
   - Event Name: `{{Event}}` (GTM's built-in Event variable — this
     forwards whatever event name this app's `trackEvent()` actually sent,
     e.g. `find_tutor_cta_clicked`, without hardcoding each one)
   - Event Parameters: add one row per property this app may send —
     `locale`, `page_type`, `cta_location`, `resource_slug`,
     `subject_slug`, `city_slug`, `user_intent`, `level`, `mode` — each
     mapped to a GTM Data Layer Variable of the same name (create these
     under **Variables → New → Data Layer Variable** if they don't already
     exist, one per property name above, "Data Layer Variable Name"
     exactly matching).
   - Triggering: **New Trigger** → Custom Event → Event name (use "matches
     RegEx"): `^(futuretutor_page_view|find_tutor_cta_clicked|become_tutor_cta_clicked|how_it_works_cta_clicked|resource_article_viewed|resource_primary_cta_clicked|subject_page_viewed|local_landing_viewed|signup_started|login_started|search_started)$`
     — this exact list is `AnalyticsEventName` in
     `src/lib/analytics/types.ts`; if that list changes, this regex must
     be updated to match.
4. **Submit** → give the version a name (e.g. "GA4 initial configuration")
   → **Publish**.
5. Confirm in GTM's own **Preview** mode (connect to
   `https://futuretutor.ca`) that the container loads and the
   Configuration tag fires — note that Preview mode itself will only see
   the container if you've separately granted ANALYTICS consent in that
   browser session, since the app-level gate applies there too.

### After publishing

Reply to this session (or open a follow-up DATA-1 mission) confirming the
GTM version is published, and this session will: mount `ConsentBanner` in
the root layout, update the Cookie Policy's §45 summary table and §13/§14
sections to reflect the real, active, consent-gated configuration
(flagged for the owner's final legal review before that text change ships,
per Phase 16), and run the full production live-certification checklist
(consent default/accept/reject/revoke, PII absence in real network
payloads, no duplicate GTM/GA4, all route exclusions) end-to-end against
the real, live vendor.

---
*Generated by mission DATA-1. Update this document when the GTM
activation checkpoint above is completed — don't duplicate it.*
