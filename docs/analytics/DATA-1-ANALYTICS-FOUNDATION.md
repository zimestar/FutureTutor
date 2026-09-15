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

**GTM activation checkpoint — completed by the owner.** The GTM container
now has a published version ("DATA-1 - FutureTutor GA4 Foundation")
containing: a Google Tag `GA4 - FutureTutor Production` (Measurement ID
`G-3BQQXRZHY2`, trigger "Initialization - All Pages"); a GA4 Event tag
`GA4 - FutureTutor Events` (Event Name `{{Event}}`) firing on a Custom
Event trigger `CE - FutureTutor Events` matching exactly the 11
`AnalyticsEventName` values; 9 Data Layer Variables (one per allowlisted
property) mapped 1:1 to 9 GA4 Event Parameters. See **DATA-1 — CONSENT
ACTIVATION** below for what changed in this codebase once that was
confirmed: `ConsentBanner` is now mounted, revocation is implemented, and
the Cookie Policy has been updated to truthfully describe this
configuration.

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

`ConsentBanner.tsx` — built, fully tested, **now mounted** in the root
locale layout (`src/app/[locale]/layout.tsx`). EN/FR copy (natural, not a
literal translation — "Accepter les données analytiques" / "Refuser les
éléments non essentiels"), two equally-weighted buttons (no dark pattern —
Accept and Reject are the same size/prominence), a "Learn more" link to
the live `/cookies` page. It self-excludes on any analytics-ineligible
route via the same certified `isAnalyticsEligiblePath()` `trackEvent()`
uses, so mounting it once at the root is safe regardless of which shell a
given page uses (see **DATA-1 — CONSENT ACTIVATION** below).

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

**Updated in the Consent Activation phase** — see **DATA-1 — CONSENT
ACTIVATION** below for the exact sections changed and the
OWNER-LEGAL-REVIEW-REQUIRED flag on that text.

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

**This mission's foundation code was deployed to production in two
stages.** The inert foundation (types, denylist, route policy, consent
module, environment gate, vendor loader, `TrackPageView`) shipped first,
provably inert while `NEXT_PUBLIC_GTM_ID` was unset. Once the owner set
that variable and published the GTM/GA4 configuration (see "Activation
status" above), the Consent Activation phase shipped `ConsentBanner`
mounted in the root layout, consent revocation, and the matching Cookie
Policy update — see **DATA-1 — CONSENT ACTIVATION** below for that
deployment's own certification record.

## Deferred / follow-up work

- A CSP covering the GTM/GA4 origins (Phase 19) — deferred as a separate
  security initiative.
- PostHog / Microsoft Clarity — deferred (Phases 12-13), revisit only with
  an explicit scoped follow-up mission and a real identified need.
- DATA-2 (funnel dashboards) / DATA-3 (SEO dashboard) — explicitly out of
  this mission's scope.

---

## DATA-1 — CONSENT ACTIVATION

The GTM activation human checkpoint (formerly documented in full below
this line) was completed by the owner — GTM container `GTM-KCNP43TK` has
a published version ("DATA-1 - FutureTutor GA4 Foundation") matching the
configuration this document specified. This phase mounted the consent
mechanism and updated the Cookie Policy to match.

### What changed

- **`ConsentBanner` is now mounted** in `src/app/[locale]/layout.tsx`,
  inside `NextIntlClientProvider`, once, covering every real page
  (including the homepage and `/tutors/[slug]`, neither of which uses the
  shared `MarketingShell`). It self-excludes on any analytics-ineligible
  route via `isAnalyticsEligiblePath()` — the same function `trackEvent()`
  itself uses — so one mount point is sufficient and cannot regress if a
  future page adopts a different shell.
- **Consent management/revocation**: `CookiePreferencesControl.tsx`, a
  small client component on the `/cookies` page showing the visitor's
  current analytics decision (granted/denied/undecided) and a "Manage
  cookie preferences" button. Clicking it calls `revokeAnalyticsConsent()`
  (resets to `"undecided"`), `unloadGtm()` (removes the injected GTM
  script element and empties `window.dataLayer`'s contents — see that
  function's own doc comment in `vendors.ts` for the honest, limited scope
  of what "unload" can mean once a vendor script has already executed),
  then reloads the page so `ConsentBanner` reappears from a clean state.
- **A real gap was found and fixed in `trackEvent()`**: it checked the PII
  denylist and route eligibility but never re-checked consent on each
  call. This meant a visitor who granted consent, then revoked it later in
  the same page session (no reload), would keep having application events
  pushed into the still-present `dataLayer` until the next navigation.
  Fixed: `trackEvent()` now calls `hasAnalyticsConsent()` on every
  invocation and drops the event if consent is not `"granted"` — this is
  what makes "revoke → future analytics collection stops" true at the
  application level. It cannot retroactively undo anything GTM/GA4 already
  did before the revoke.
- **Cookie Policy updated** (`cookieContent.en.ts` / `.fr.ts`, both
  locales, same sections in each): §13 ("Current Analytics Position") and
  §14 ("Future Analytics Services") now truthfully state that Google
  Analytics 4, delivered through Google Tag Manager, is in use — only on
  public marketing/content pages, only with the visitor's consent, and
  that no PII (name/email/phone/address/message content/payment info) is
  collected through it; §28 ("Cookie Banner") now describes the live
  banner mechanism instead of a hypothetical future one; §45's summary
  table row changed from *"Routine third-party behavioural analytics: Not
  currently represented as used"* to a row naming GA4/GTM as in use
  (consent-gated, public-pages-only) and a new row confirming PostHog and
  Microsoft Clarity remain not in use. No retention period, IP-
  anonymization claim, or other unverified legal conclusion was invented —
  consistent with this Policy's own existing discipline (§34). **The
  Effective Date / `COOKIE_POLICY_VERSION` (`2026-08-30`) was
  deliberately NOT bumped** — declaring a new effective date is a legal/
  business decision, not a technical one; this is flagged in the final
  report for the owner's decision alongside the legal-review flag itself.
- **OWNER LEGAL REVIEW REQUIRED** on the above Cookie Policy text changes,
  per this Policy's own standing "subject to final external Canadian
  legal review" status — this session drafted only verifiable technical
  facts, no legal conclusions.
- **Tests added**: consent-gating coverage in `track.test.ts` (undecided/
  denied/granted/revoked-mid-session/storage-throws — 5 new cases),
  `unloadGtm()` coverage in `vendors.test.ts` (4 new cases), a
  denied→revoke→granted round trip in `consent.test.ts` (2 new cases), a
  new `consentBannerMessages.test.ts` locking the `consentBanner` i18n
  namespace's key parity and real (non-placeholder, non-duplicate) EN/FR
  text, and new Cookie Policy content assertions in `cookieContent.test.ts`
  (GA4/GTM named truthfully, consent-dependence stated, no PostHog/Clarity
  claim, no invented retention/anonymization language). Full non-DB-
  integration suite: all passing, zero regressions (pre-existing DB-
  integration tests that require a live Postgres connection are unrelated
  and were not run/affected).

### Known, honest limitation: browser-level live certification

This session has no browser-automation tool available (no Playwright/
Puppeteer/equivalent — only static HTTP fetch tools). That means the
following checks could **not** be performed by literally clicking through
a live browser session against production, and are certified only at the
logic/unit level (which is what the tests above verify) plus static
production-HTML inspection (curl), not by observing real rendered
behavior or real outbound network requests to Google's servers:

- Visually confirming the banner renders/is absent at the right moments.
- Simulating a real Accept/Reject/Manage click and observing the resulting
  DOM and `localStorage` state in a real browser.
- Capturing and inspecting the actual network request GA4 sends after
  consent, to visually confirm its payload contains no PII.

Everything that does not require simulating a real click or reading a
real browser's network tab was certified directly: production HTTP
responses (curl), the full automated test suite (which exercises the
exact same consent/route/PII logic paths a live click would trigger), and
static analysis of every code path that can reach `window.dataLayer`.

---
*Generated by mission DATA-1. This document now reflects the fully
consent-activated, certified-inert-by-default state as of the Consent
Activation phase.*
