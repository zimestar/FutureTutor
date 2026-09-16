# LIFECYCLE-1B — Onboarding Reminder Engine (Design + Schema-Independent Implementation)

Status: **Schema-independent parts implemented and tested. Persistence-dependent parts are DESIGN ONLY — schema approval required before further implementation.** No production emails sent. No cron created or scheduled.

## 1. Problem

LIFECYCLE-1A (`docs/lifecycle/LIFECYCLE-1A-ONBOARDING-STATE.md`) proved FutureTutor has a real activation/recovery need — a fresh production dry-run for this mission found 9 subjects currently `USER_ACTION_REQUIRED` (2 Tutor, 4 Parent, 3 Student), all of them already inactive for 7+ days. LIFECYCLE-1A can only tell you the *current* state; it has no memory of what was already communicated. LIFECYCLE-1B is the layer that turns "this subject is reminder-eligible" into "send exactly the right reminder, exactly once, to exactly the right person."

## 2. LIFECYCLE-1A dependency

Every reminder decision is derived from a fresh `LifecycleJourneyState` (`src/lib/lifecycle/*Lifecycle.ts`) — LIFECYCLE-1B never re-derives stage/status/progress itself. `reminderCandidate.ts`'s `assessReminderCandidate` takes a `LifecycleJourneyState` (or the subset of fields it needs) as its only input.

## 3. Reminder cadence

`src/lib/lifecycle/reminders/cadence.ts`. R1 ≥24h, R2 ≥72h, R3 ≥7d, all measured from `lastMeaningfulProgressAt` (LIFECYCLE-1A's own anchor), **never** chained off a prior send time — confirmed by the mission's own worked example and enforced by `assessCadenceStep` taking only `inactiveDurationMs`, never a "time since last reminder" value. `nextDueReminderNumber(cadenceStep, alreadySentNumbers)` additionally enforces strict monotonic sequencing (R2 can never precede R1, R3 can never precede R2) — implemented and tested (`reminders.test.ts` §1-6).

## 4. Actionable episodes

`src/lib/lifecycle/reminders/episode.ts`. `episodeKey = journey:subjectId:stage:lastMeaningfulProgressAt`. A change in either `stage` (a genuinely new actionable stage) or `lastMeaningfulProgressAt` (real progress within the same stage, which also legitimately resets the inactivity clock per §3) produces a new key, automatically retiring whatever reminder sequence was counting from the old anchor. `status`/suppression state is deliberately **not** part of the key — see §5.

## 5. Stop-on-progress

Obsolescence is detected by re-comparing the CURRENT `episodeKey` against what a stored candidate/row was computed for (`isEpisodeStillCurrent`), not by baking every possible obsolescence trigger into the key itself. This single mechanism naturally covers every trigger the mission lists: progress and stage changes change the key directly; suspension/rejection/completion/admin-becoming-blocker all remove the subject from `USER_ACTION_REQUIRED` in LIFECYCLE-1A, at which point `assessReminderCandidate` returns `null` and no new candidate (and no re-affirmation of an old one) is ever produced for them again. Tested: `reminders.test.ts` §9, §10, §28.

## 6. Recipient resolution

`src/lib/lifecycle/reminders/recipient.ts` — implemented, DB-backed (existing tables only), tested. TUTOR and PARENT always resolve to the subject's own user (`resolveSelfReminderRecipient`). STUDENT (`resolveStudentReminderRecipients`) returns an **array**: if the StudentProfile has its own login, that student is the SELF recipient; if not (`GUARDIAN_MANAGED`, no login), every currently-`ACTIVE` `ParentStudentRelationship` resolves to an independent GUARDIAN recipient — never an arbitrarily-picked single guardian when more than one exists, and `NO_SAFE_RECIPIENT` (never a guessed address) when none exist. `NotificationPreference.emailEnabled` is checked and honored — see §19 for why this is a deliberate strengthening beyond existing precedent, not a rediscovery of it.

## 7. Guardian handling

Directly reuses LIFECYCLE-1A's own subject/recipient split (`LifecycleJourneyState.recipientUserId === null` for a guardian-managed child with no login). A student in `WAITING_ON_GUARDIAN` (the `STUDENT_LOGIN_LINKING` claim-pending sub-journey) is never reminder-eligible in LIFECYCLE-1A at all, so it never reaches recipient resolution in the first place — the guardian-approval case and the guardian-recipient case are structurally distinct and neither can leak into the other.

## 8. Locale

No durable per-Tutor locale exists anywhere in the schema (`TutorProfile` has no such field; `TutorLanguage` is languages *taught*, a different concept) — this is the exact same documented gap `tutorApplicationNotifications.ts` already hit, so LIFECYCLE-1B makes the identical documented choice (hardcode `"en""`), not a new policy. `ParentProfile.preferredLanguage` / `StudentProfile.preferredLanguage` are the authoritative sources for Parent and self-contactable Student recipients; a guardian-routed reminder uses the **guardian's own** `preferredLanguage`, never the child's. Every candidate locale is passed through `resolveEmailLocale` (`src/lib/email/emailTranslation.ts`, already proven, reused unchanged) — an unsupported/missing value deterministically falls back to `"en"`, never inferred from name/email/geography.

## 9. Content strategy

`src/lib/lifecycle/reminders/content.ts` + `messages/{en,fr}.json`'s new `lifecycleReminderEmail` namespace. Mirrors `tutorApplicationEmailContent.ts`'s exact shape (`createEmailTranslator` + `renderEmailShell`, pure function over an already-resolved context) — every string is translated, none hardcoded. Six content keys cover the six real `(role, stage, relationship)` combinations LIFECYCLE-1A can ever produce as `USER_ACTION_REQUIRED` (`TUTOR_DRAFT`, `TUTOR_TRAINING_REQUIRED`, `TUTOR_EXAM_REQUIRED`, `PARENT_STUDENT_SETUP`, `STUDENT_PROFILE_SELF`, `STUDENT_PROFILE_GUARDIAN`), each with genuinely distinct R1/R2/R3 copy (never "last chance," no fabricated deadline) plus a `whyItMatters` line answering the mission's 5th required question. `resolveContentKey` returns `null` — never a guessed template — for any other combination. Content is built but never dispatched in this mission.

## 10. Deep links

`src/lib/lifecycle/reminders/deepLink.ts` reuses LIFECYCLE-1A's own `nextAction` (an existing canonical, session-scoped route) and the already-proven `resolveBookingEmailBaseUrl` (HTTPS-only, never localhost). No query parameters, no database id, no email — every target route already resolves the viewer's own profile from their session server-side. **Known, honest, pre-existing limitation**: no protected page's auth redirect preserves a `callbackUrl` today (confirmed by inspecting every dashboard/tutor page), so a reminder clicked after the session expired lands on a bare `/login`, not back at the deep-linked page. Fixing that is a separate, multi-file change, explicitly out of scope here — building a bespoke bypass "solely for email" was explicitly forbidden by the mission.

## 11. Idempotency

**Design only, pending schema approval.** At-most-once delivery per `(subjectId, journey, episodeKey, reminderNumber)` — exactly the same proven shape as `TutorApplicationNotification`/`SessionNotification`'s `dedupeKey` + `@@unique([dedupeKey])`. `computeReminderDedupeKey(episodeKey, reminderNumber)` is already implemented and tested (`episode.ts`) so its exact string shape is locked in before the table exists. See the Schema Proposal's IDEMPOTENCY section.

## 12. Persistence

**Not implemented — schema gate triggered.** Audited whether an existing table could safely provide reminder-history tracking: `TutorApplicationNotification` is Tutor-only and has no `episodeKey`/`reminderNumber` concept; `SessionNotification` is Booking-scoped, a different subject entirely; `Notification` (in-app) has no delivery-state machine or cadence concept. Overloading any of them would violate the mission's own explicit instruction ("Do NOT overload unrelated Notification tables merely to avoid a migration"). See the Schema Proposal below.

## 13. Concurrency

**Design only.** A DB-level `@@unique` constraint (not "check then insert") is the only safe idempotency primitive — proven pattern already used identically by both existing outbox tables. See Schema Proposal.

## 14. Decision engine

The schema-independent half is real and implemented: `assessReminderCandidate` (`reminderCandidate.ts`) computes `{ episodeKey, dedupeKey, reminderNumber }` from a `LifecycleJourneyState` plus an (optional, currently-always-empty) `alreadySentNumbersForEpisode` array. The history-aware half (loading `alreadySentNumbersForEpisode` from the DB for a given `episodeKey`, and atomically claiming a row before send) is design-only pending the schema.

## 15. Delivery separation

Strictly maintained: `content.ts` builds content, `recipient.ts` resolves who, `deepLink.ts` builds where — none of them import `getResendClient`, `.emails.send`, or any dispatch mechanism (structurally enforced by `reminders.test.ts`'s financial/boundary-style tests). No send path exists anywhere in this module.

## 16. Pre-send recheck

**Design only.** The future dispatcher must reload the authoritative `LifecycleJourneyState` for the subject immediately before calling Resend and re-verify `isEpisodeStillCurrent(claimedEpisodeKey, freshState)` — if false, mark the claimed intent obsolete and do not send. This mission proves the underlying primitive (`isEpisodeStillCurrent`) is already correct and tested (`reminders.test.ts` §28); wiring it into an actual claim/send loop requires the persistence layer.

## 17. Failure/retry

**Design only.** Mirrors `TutorApplicationNotification`'s proven per-row try/catch (one failure never aborts the batch) and `PENDING → SENT | FAILED` status shape, with an added bound (see Schema Proposal's proposed `FAILED_RETRYABLE` vs `FAILED_FINAL` split) so a permanently-invalid recipient doesn't retry forever. LIFECYCLE-1C owns provider webhook truth (`DELIVERED`/`BOUNCED`/etc.) — 1B only needs to know "did the send call itself succeed."

## 18. Cron architecture

**Designed, not built.** Future route: `/api/cron/lifecycle-reminders-tick`, reusing the exact shared-secret pattern every existing cron route already uses (`x-cron-secret` header checked against a dedicated `LIFECYCLE_REMINDERS_CRON_SECRET` env var, fail-closed if unset) — see `src/app/api/cron/session-notifications-tick/route.ts` for the proven template. Per that same route's own established convention, a new cron route is deployed **unscheduled** by default; nothing in this mission creates the route file itself, since it would need the not-yet-approved persistence layer to do anything real. Worker steps: bounded candidate scan → evaluate lifecycle state → resolve recipient(s) → compute episode/candidate → atomically claim (INSERT with the unique dedupeKey, `skipDuplicates`-equivalent) → **pre-send recheck** → send → persist outcome → continue, one subject's failure never aborting the batch.

## 19. Communication preferences

Audited: `NotificationPreference.emailEnabled` exists in the schema (`@default(true)`) but **is not read by any application code today** — grep-confirmed zero call sites across booking confirmation, tutor application, password reset, and session notification emails, every one of which currently sends regardless of this flag. This is an existing gap, not something LIFECYCLE-1B introduces. **Product/legal classification is not invented here**: an onboarding-completion reminder, sent only to a user who voluntarily started a specific multi-step process, containing content strictly about completing that one process (no upsell, no third-party offer), is *conventionally* treated as transactional/service communication under frameworks like Canada's CASL — but this is the owner's classification to confirm, not a conclusion this audit is authorized to make. Pending that confirmation, LIFECYCLE-1B's recipient resolver is **deliberately more conservative than existing precedent**: it already checks and honors `emailEnabled` (implemented, tested) even though nothing else in the codebase does — a real behavior improvement, not a rediscovery.

## 20. Resend boundary

Audited `src/lib/email/resendClient.ts` / `emailDeliveryConfig.ts` — the established `getEmailDeliveryMode()` ("console_dev" | "resend") gate, fail-closed to requiring real credentials in `NODE_ENV=production`. LIFECYCLE-1B's future dispatcher must resolve delivery mode through this exact existing mechanism, never a new one. **No Resend call was made or prepared for invocation in this mission** — `content.ts`/`recipient.ts`/`deepLink.ts` produce everything a send call would need, but nothing calls `getResendClient()` or `.emails.send`. Open/click tracking is explicitly LIFECYCLE-1C's, not enabled or touched here.

## 21. Tracking boundary

No tracking pixel, redirect-tracking endpoint, or token was created. Deep links carry zero PII (§10, tested). The link shape (`{baseUrl}/{locale}{canonicalRoute}`) is stable and simple enough for LIFECYCLE-1C/1D to later add attribution via a server-side redirect layer without needing to change what this mission already built.

## 22. Admin observability

**Design only.** `LifecycleSummaryCard` (LIFECYCLE-1A) should eventually gain an optional "Reminders" sub-section showing: current episode's R1/R2/R3 status (not sent / sent \<timestamp\> / obsolete), last reminder sent, next reminder due — all read-only, sourced from the future `LifecycleReminder` table once it exists. **No "Send Reminder"/"Retry"/bulk-send control is designed or authorized** — the mission is explicit that any such control needs separate authorization.

## 23. Production dry run

Executed via the established disposable-script convention (`railway run`, then deleted, cleanup confirmed) against live production, 2026-09-16:

| | Count |
|---|---|
| USER_ACTION_REQUIRED (all roles) | 9 |
| — TUTOR:DRAFT | 2 |
| — PARENT:STUDENT_SETUP | 4 |
| — STUDENT:PROFILE | 3 |
| WAITING_ON_ADMIN | 1 |
| COMPLETED | 3 |
| WAITING_ON_FUTURETUTOR / WAITING_ON_GUARDIAN / REJECTED / SUSPENDED / INELIGIBLE / UNKNOWN | 0 each |

Cadence step reached by elapsed inactivity alone: all 9 have already reached the R3 threshold (≥7 days inactive). **Would-send estimate if activated today: 9 subjects would receive R1 on the first tick, 0 would receive R2 or R3** — because no send history exists yet anywhere, and R2/R3 can never precede R1 regardless of how long a subject has already been inactive (§3). No email was sent. No name/email/id was printed.

## 24. Test plan

`src/lib/lifecycle/reminders/reminders.test.ts` — 34 deterministic unit tests covering cadence (§1-6), episode identity/stop-on-progress (§9-10 + extras), candidate suppression (§11-18, §28), deep links (§26-27), and content selection/rendering (§23-25), plus financial/Resend/cron-absence boundary tests. `recipient.integration.test.ts` — 7 DB-backed tests (§19-22, multi-guardian, revoked-relationship) written but **could not execute** in this session (`DATABASE_URL_TEST` unreachable — `ECONNREFUSED`, identical to LIFECYCLE-1A's own honestly-reported gap; not fabricated as passing). Full non-DB suite: **2657/2657 passed, 195/195 files**, zero regressions. Items requiring the persistence layer (§7, §8, duplicate prevention §31-34, concurrency, cron auth §35-36, batch bounding) are specified as design only — see the Schema Proposal below for what they'll need.

## 25. Deployment/activation gates

This mission's schema-independent code (cadence/episode/recipient/locale/deepLink/content) is safe to deploy as-is — it has no send path, no cron, no schema dependency, and is inert until called by code that does not yet exist. **Activation gates that remain, in order**: (1) owner approval of the Schema Proposal below; (2) migration created and applied; (3) the history-aware decision engine, persistence-writing candidate-claim logic, and cron route built against the approved schema; (4) the cron route deployed **unscheduled**; (5) a further explicit, separate owner authorization before the cron is actually scheduled or any reminder is sent to a real recipient — none of which happens in this mission.

## 26. LIFECYCLE-1C handoff

Needs: `DELIVERED`/`OPENED`/`CLICKED`/`BOUNCED`/`COMPLAINED` state, provider webhook attribution, and a secure (non-PII) tracking-link layer built on top of §21's already-stable deep-link shape. `OPENED` must never be relabeled "read."

## 27. LIFECYCLE-1D handoff

Needs: `RESUMED`/`STEP_COMPLETED`/`JOURNEY_COMPLETED` events (derivable by comparing a subject's `LifecycleJourneyState` across two points in time — the exact same episode-identity primitives built here), an admin activation dashboard, and funnel analytics — all built on LIFECYCLE-1A/1B's existing evaluators, not a new source of truth.
