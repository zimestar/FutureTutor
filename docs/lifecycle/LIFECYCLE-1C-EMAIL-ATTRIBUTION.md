# LIFECYCLE-1C — Email Delivery & Attribution

Status: **Fully implemented, migrated, and tested.** Webhook route deployed but requires manual Resend + Railway configuration (below) before it will ever receive real events. No production reminder email sent. No reminder cron scheduled.

## 1. Objective

Turn a single mutable `LifecycleReminder.status` into three separate, honest truths: **operational** (did the send attempt itself succeed — LIFECYCLE-1B), **provider** (what actually happened to the email after Resend accepted it — this mission), and **product** (did the person actually resume onboarding — LIFECYCLE-1D, not built here).

## 2. 1A/1B dependency

Every `LifecycleEmailEvent` row is anchored to a `LifecycleReminder` row (LIFECYCLE-1B), which is itself anchored to a `LifecycleJourneyState` (LIFECYCLE-1A). This mission adds no new subject/recipient concept — it only records what happened to an email LIFECYCLE-1B already decided to send.

## 3. Existing email architecture (audited)

`RESEND_API_KEY`/`EMAIL_FROM` + `getEmailDeliveryMode()` (unchanged). Existing webhook precedent: `stripe/route.ts` (SDK-native verification, `StripeWebhookEvent` idempotency table — the exact pattern `LifecycleEmailEvent` mirrors for idempotency), `daily/route.ts` (header-presence-before-body-read discipline, typed fail-closed errors). `NotificationPreference.emailEnabled` — read by LIFECYCLE-1B already, unchanged here. No prior tracking/pixel/redirect infrastructure existed anywhere in this codebase.

## 4. Resend capabilities (audited from the installed SDK, not assumed)

`resend@6.20.0` bundles real TypeScript types confirming: a `WebhookEvent` union of 18 event names (6 relevant: `email.sent`/`delivered`/`opened`/`clicked`/`bounced`/`complained`); every `email.*` payload carries `data.email_id` — the same id already captured as `LifecycleReminder.providerMessageId` at send time; and a first-class `resend.webhooks.verify({ payload, headers, webhookSecret })` method (official, Standard-Webhooks-spec-based, already-installed — no new dependency). **Open/click tracking is a domain-level account setting** (`Domain.openTracking`/`clickTracking`, not a per-send option) — confirmed via the SDK's `Domain`/`UpdateDomainsOptions` types, not assumed. The production `RESEND_API_KEY` is a **send-only restricted key** (confirmed live: a read-only `resend.domains.list()` call was rejected with `restricted_api_key`) — this codebase cannot read or write that domain setting at all today; see §27.

## 5. Operational vs. provider vs. conversion truth

`LifecycleReminder.status` (LIFECYCLE-1B, unchanged) = operational. `LifecycleEmailEvent` (this mission) = provider delivery/engagement facts, append-only. LIFECYCLE-1D's `RESUMED`/`STEP_COMPLETED`/`JOURNEY_COMPLETED` = product conversion — explicitly not implemented here, not folded into `LifecycleEmailEventType`.

## 6. Provider event taxonomy

```prisma
enum LifecycleEmailEventType { SENT DELIVERED OPENED CLICKED BOUNCED COMPLAINED }
```
Mapped 1:1 from Resend's `email.sent`/`delivered`/`opened`/`clicked`/`bounced`/`complained`. Every other Resend event (`email.scheduled`, `email.delivery_delayed`, `email.received`, `email.failed`, `email.suppressed`, all `contact.*`/`domain.*`/`suppression.*`) is recognized-but-out-of-scope: HTTP 200, zero rows, zero side effects.

## 7. Persistence

`LifecycleEmailEvent` (migration `20260917120000_add_lifecycle_email_event`, applied to production) + an additive `@@index([providerMessageId])` on `LifecycleReminder`. See the schema decision for the full field-by-field rationale. `onDelete: Cascade` from `LifecycleEmailEvent` to `LifecycleReminder` — deliberately different from `LifecycleReminder`'s own `User` relation (`SetNull`): an event has no independent meaning without the specific reminder it describes.

## 8. Webhook architecture

`POST /api/webhooks/resend` (`src/app/api/webhooks/resend/route.ts`). Thin route: check secret configured → check required headers present → bound body size (1MB) → verify signature → map event type → correlate → build metadata → insert (idempotent). Mirrors `stripe/route.ts`/`daily/route.ts`'s exact shape.

## 9. Webhook security

`resend.webhooks.verify()` (Standard Webhooks spec: `webhook-id`/`webhook-timestamp`/`webhook-signature` headers, HMAC-SHA256, built-in replay-timestamp tolerance). Fails closed on missing secret (500), missing/invalid signature (400), malformed body (400). Live-verified: **21/21 fixture checks passed** against production including full signature round-trips (see §24). Offline unit tests additionally cover valid, invalid, missing, and tampered-payload signatures — no network call needed since verification is pure local HMAC.

## 10. Idempotency

`@@unique([providerEventId])` — Resend's own `webhook-id` header value, reused identically by a provider retry of the same underlying event. Insert-then-catch-`P2002`-as-already-handled, mirroring the already-proven `StripeWebhookEvent` pattern. Live-verified: three delivery attempts of the identical `providerEventId` produced exactly one row.

## 11. Provider correlation

`event.data.email_id` → `LifecycleReminder.providerMessageId`, via `findMany` (never `findFirst`) so more than one match is detectable. **Zero matches** (the email belongs to an unrelated FutureTutor send — booking confirmation, password reset, tutor-application email, all sharing the same Resend account) → safe no-op, nothing persisted. **More than one match** → also a safe no-op — fails closed rather than guessing, per the schema decision's explicit "never arbitrarily choose the first row." No unique constraint was added to `providerMessageId` itself (no evidence it's ever guaranteed globally unique — only an index, supporting the lookup without asserting a guarantee the correlation code doesn't independently verify). Live-verified for all three cases (matched, no-match, ambiguous).

## 12. Event ordering

Never trusted. `occurredAt` is stored exactly as Resend reports it; nothing reconciles or requires `SENT < DELIVERED < OPENED < CLICKED`. Live-verified: an `OPENED` event was ingested and persisted with no `DELIVERED` row present at all.

## 13. Open semantics

**Permanent product rule, enforced in code and copy**: `OPENED` is stored and labelled `Opened` — never `Read`/`Read by user`/`Email read`, anywhere (admin UI, translation strings, code comments). No "reading time" is computed. Known limitations (documented for the owner, not hidden): image-blocking can prevent an open from ever firing; some privacy systems (e.g. Apple Mail Privacy Protection, corporate link-scanners) pre-fetch tracking pixels automatically, producing an `OPENED` event the human never actually saw; multiple `OPENED` events for one email are normal and expected, not a bug.

## 14. Click architecture

**Decision: Option A — Resend-native click/open tracking**, not a FutureTutor-owned `/r/{token}` redirect layer. Reasoning (per the mission's own comparison criteria): `email.clicked`'s `data.email_id` already gives deterministic, reminder-level correlation — exactly what LIFECYCLE-1C and a future LIFECYCLE-1D need; each reminder email has exactly one CTA link, so no sub-link disambiguation is ever required; a redirect layer would introduce genuine open-redirect risk and a second tracking system running in parallel for zero additional correlation benefit. `/r/{token}` was **not built** — not merely deferred, actively rejected as unnecessary for this mission's requirements. If a future mission's requirement (e.g. a lifecycle email that legitimately contains more than one distinct link) proves native tracking insufficient, this decision should be revisited then, not preemptively.

## 15. Guardian attribution

A Student episode's two `LifecycleReminder` rows (Guardian A, Guardian B) each carry their own distinct `providerMessageId`, so every webhook event correlates to exactly one specific guardian's row — never the other's, never the shared `subjectId`. Live-verified: Guardian A opening produces zero events on Guardian B's row, and vice versa for a click; each engagement is independently and correctly attributed.

## 16. Email delivery flow

Unchanged from LIFECYCLE-1B (candidate → claim → reload → episode revalidate → recipient revalidate → preference revalidate → render → send → persist `providerMessageId` → operational status `SENT`). This mission adds step 11 (LIFECYCLE-1B's own §11): later provider events append here, entirely separately, never retroactively reinterpreted as `DELIVERED` just because the provider *accepted* the send.

## 17. Bounce handling

`BOUNCED` events are recorded with narrow metadata (`bounceType`, `bounceSubType` only — never the free-text `message`, which can echo the recipient's own email address in SMTP diagnostic text). **No account deactivation, login change, onboarding-state mutation, or guardian-relationship change occurs** — verified structurally (this module has zero import of any suspension/onboarding-mutation code path) and by design (the event table is purely additive history).

## 18. Complaint handling

Same as bounce: `COMPLAINED` recorded, zero side effects elsewhere. Audited existing suppression infrastructure: `NotificationPreference.emailEnabled` is a manual, user-driven toggle — there is **no automatic bounce/complaint-driven suppression mechanism anywhere in this codebase today**. Building one (e.g., auto-setting `emailEnabled = false` after a hard bounce) would need its own schema/policy decision and is **explicitly flagged as an open gap**, not invented here, per the schema decision's Phase 14 instruction to stop and report rather than silently expand scope.

## 19. Preference handling

Unchanged LIFECYCLE-1B behavior: `NotificationPreference.emailEnabled` is re-checked immediately before every send attempt. A webhook event for an email that was legitimately sent before a preference change is still recorded as historical fact — never reinterpreted or discarded.

## 20. Privacy

`LifecycleEmailEvent` never stores: recipient email, recipient name, IP address, user agent, subject line, from address, or a raw payload dump — confirmed by both unit tests (assert the metadata object's exact key set) and the live fixture run (`CLICKED` metadata contains exactly `{ link }`, nothing else; `BOUNCED` contains exactly `{ bounceType, bounceSubType }`).

## 21. Retention

No table in this codebase (including the pre-existing `StripeWebhookEvent`, `TutorApplicationNotification`, `SessionNotification`, `AuditLog`) has an enforced retention/deletion policy. `LifecycleEmailEvent` follows the same as-yet-undecided posture — not invented here, flagged as an explicit open future product decision.

## 22. Admin observability

`LifecycleSummaryCard` renders, per reminder row (when event data was loaded): `Delivered`, `Opened` (last-seen timestamp), `Clicked` (last-seen timestamp), and — only when present — `Bounced`/`Complained` in an error-toned callout. Derived via the pure `summarizeEmailEvents()` (first/last per type) from the full, untouched append-only history — the database itself never merges or discards repeat events. No send/retry/resend/manual-mutation control exists anywhere in this component.

## 23. Production safety

Preserved exactly: `LIFECYCLE_REMINDERS_CRON_SECRET` remains unset, the reminder cron remains unscheduled, zero `LifecycleReminder` rows exist for any real subject, zero lifecycle emails have been sent. This mission adds `RESEND_WEBHOOK_SECRET` to the same "must be manually configured before anything can happen" category (§27) — it too was never set by this session.

## 24. Tests

- **59 pure unit tests** (`clickLinkValidation.test.ts`, `emailEventSummary.test.ts`, `emailEventCorrelation.test.ts`, `resendWebhookSignature.test.ts`, `route.test.ts`) — link-allowlist exact-match security (subdomain confusion, userinfo confusion, protocol rejection), event-type mapping, metadata allowlist, offline HMAC signature round-trips (valid/invalid/missing/tampered), route-level security (mirrors the proven `stripe/route.test.ts` pattern with `processResendWebhookEvent` mocked).
- `emailEventCorrelation.integration.test.ts` — DB-backed correlation/idempotency/cascade tests, written for CI/reachable-`DATABASE_URL_TEST`; could not execute in this session (unreachable).
- **Disposable fixture-verification script**, run live against production (established convention: isolated fixtures, full cleanup in a `finally` block, script deleted before committing): **21/21 checks passed** — correlation (matched/no-match/ambiguous), idempotency under 3 duplicate deliveries, repeated-engagement append-only behavior, click-link validation end-to-end (valid link stored, unsafe link's CLICKED fact still recorded but the link itself withheld), full guardian-independence proof (A's engagement never touches B's row and vice versa), and cascade-delete. Zero net rows left behind.
- Full non-DB suite: **2708/2708 passed, 200/200 files**, zero regressions (includes LIFECYCLE-1A, LIFECYCLE-1B, auth, admin, notification, email, consent, DATA-2, and SEO-private-route tests, all re-run as part of the same suite).
- `npx tsc --noEmit`: clean. `npx eslint`: clean. `npm run build`: succeeded (confirms `/api/webhooks/resend` builds as a dynamic route).

## 25. Deployment

Migration applied to production; application code deployed. See the final certification report for exact commit/deployment identifiers.

## 26. Resend dashboard configuration — REQUIRED HUMAN STEPS

The webhook route is deployed but Resend does not know it exists yet, and the production API key cannot create or inspect webhooks (confirmed: it is a send-only restricted key). **None of the following was done by this session — do this yourself, in the Resend dashboard:**

1. Go to **resend.com → Webhooks → Add Webhook**.
2. **Endpoint URL:** `https://futuretutor.ca/api/webhooks/resend`
3. **Events to select:** `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked` only. Do **not** select `contact.*`, `domain.*`, `suppression.*`, or `email.received` — they're harmless if received (safely ignored), but there's no reason to send them.
4. Resend will show you a **signing secret** starting with `whsec_` **once**, at creation time. Copy it yourself.
5. In **Railway → FutureTutor service → production environment → Variables**, create a new variable named exactly **`RESEND_WEBHOOK_SECRET`** and paste that value in. **Do not share this value with anyone, including in chat with Claude** — this session never asked for it and never will.
6. Do **not** enable "click tracking" or "open tracking" toggles anywhere in this step unless you've separately decided you want them (see next point) — creating the webhook subscription is independent of whether those domain-level settings are on.
7. **Separately, only if you want `OPENED`/`CLICKED` events to actually fire**: go to **resend.com → Domains → futuretutor.ca → Settings** and check whether "Open Tracking" / "Click Tracking" are enabled. This session could not check this for you (the API key can't read it) or turn it on for you (this session should not flip an account-wide setting — it affects every email your account sends, not just lifecycle reminders — without you deciding to). `email.sent`/`email.delivered`/`email.bounced`/`email.complained` will work regardless of this setting; only `email.opened`/`email.clicked` depend on it.
8. **How to test safely**: Resend's webhook page has a "Send test event" button that sends a synthetic, clearly-fake event to your endpoint without touching any real email. Use that first. Do **not** send yourself a real lifecycle reminder to test this — no lifecycle reminder send is authorized in this or any prior mission.

## 27. LIFECYCLE-1D handoff

Every `CLICKED` row already carries a resolved `lifecycleReminderId` → `LifecycleReminder.subjectId`/`journey`/`episodeKey`/`recipientUserId` — exactly what a future `RESUMED` detector needs to correlate "this specific person clicked this specific email" to "did the underlying subject's `LifecycleJourneyState` change afterward." No new correlation primitive is required; LIFECYCLE-1D should read `LifecycleEmailEvent` rows, never write to them.
