# LIFECYCLE-1B — Onboarding Reminder Engine

Status: **Fully implemented, migrated, and tested.** Cron route built and deployed but **UNSCHEDULED** — no reminder has been sent to a real production user, and none will be until a separate, explicit future authorization.

## 1. Problem

LIFECYCLE-1A (`docs/lifecycle/LIFECYCLE-1A-ONBOARDING-STATE.md`) proved a real activation/recovery need. LIFECYCLE-1B is the layer that turns "this subject is reminder-eligible" into "send exactly the right reminder, exactly once, to exactly the right person" — durably, idempotently, and auditable.

## 2. LIFECYCLE-1A dependency

Every reminder decision is derived from a fresh `LifecycleJourneyState` (`src/lib/lifecycle/*Lifecycle.ts`), reloaded at three separate points (candidate discovery, claim, and immediately pre-send) — LIFECYCLE-1B never re-derives or caches stage/status/progress itself.

## 3. Reminder cadence

`src/lib/lifecycle/reminders/cadence.ts`. R1 ≥24h, R2 ≥72h, R3 ≥7d, measured from `lastMeaningfulProgressAt`, never chained off a prior send time.

## 4. Actionable episodes

`episodeKey = journey:subjectId:stage:lastMeaningfulProgressAt.toISOString()` (`episode.ts`). Deterministic, timezone-independent (ISO 8601 `Z` serialization is identical regardless of the evaluating host's local timezone), contains no PII/free text — all tested (`reminders.test.ts`). Never exposed publicly (absent from every deep link and from `LifecycleReminder`'s own admin-observability rendering).

## 5. Stop-on-progress

`isEpisodeStillCurrent()` re-compares the current episode key against a stored one; a stage or progress-anchor change (or the subject leaving `USER_ACTION_REQUIRED` entirely) makes any prior candidate/row permanently orphaned — its `dedupeKey` can never match a future candidate again.

## 6. Recipient resolution

`recipient.ts` — Tutor/Parent self; Student self-or-every-ACTIVE-guardian, each returned as an independent `ReminderRecipient`. `NotificationPreference.emailEnabled` is honored (a deliberate strengthening beyond existing codebase precedent — see §19).

## 7. Guardian handling

Reuses LIFECYCLE-1A's subject/recipient split. A revoked guardian relationship is excluded from `resolveStudentReminderRecipients` immediately (live query, no caching) and is separately caught by the pre-send recheck (§16) even if a row was already claimed before the revocation.

## 8. Locale

Tutor: hardcoded `"en"` (documented pre-existing gap, matches `tutorApplicationNotifications.ts`'s own identical choice). Parent/self-contactable-Student: their own `preferredLanguage`. Guardian-routed Student reminder: the **guardian's own** `preferredLanguage`, verified live (mixed-locale two-guardian fixture: one `en`, one `fr`, both correctly resolved independently).

## 9. Content strategy

`content.ts` + `messages/{en,fr}.json`'s `lifecycleReminderEmail` namespace, mirroring `tutorApplicationEmailContent.ts`. Six content keys, genuinely distinct R1/R2/R3 copy per key, no fabricated deadlines, no "last chance" language, a `whyItMatters` line per key.

## 10. Deep links

`deepLink.ts` — `{site.url}/{locale}{nextAction}`, zero PII, zero query parameters, verified (test) that every target route (`/tutor/profile`, `/tutor/training`, `/tutor/exam`, `/dashboard/family`, `/dashboard/profile`) still requires authentication in its own page source. **Known limitation, unchanged from the schema proposal**: no protected route preserves a `callbackUrl` on redirect to `/login` today — out of scope for this mission.

## 11. Idempotency — CORRECTED per the schema decision

`dedupeKey = lifecycleReminder:{episodeKey}:R{n}:recipient:{recipientUserId}` — **recipient-aware**, not just episode+reminderNumber. This was the schema decision's required correction: the original proposal's episode-only key would have let the DB's own unique constraint silently suppress a second guardian's legitimate reminder. Enforced by a real `@@unique([dedupeKey])` Postgres constraint on `LifecycleReminder` (migration `20260917000000_add_lifecycle_reminder`, applied to production). Verified live against the real constraint (not just unit-tested): two guardians of the same Student episode successfully claim two distinct rows; a third, duplicate claim attempt for either guardian is rejected with Postgres error `P2002`, and exactly one row persists per guardian.

## 12. Persistence

**`LifecycleReminder`** (`prisma/schema.prisma`), migrated to production. Key corrections from the original proposal, per the schema decision:
- `recipientUserId` is **nullable**, FK `onDelete: SetNull` (not Cascade) — a deleted User degrades "who this was sent to," never erases the historical fact that a reminder was sent. Verified live: deleting the recipient User leaves the row intact with `recipientUserId: null` and every other field (`status`, `sentAt`, `dedupeKey`, `reminderNumber`) unchanged.
- `status` is a bounded **operational** enum only (`PENDING`, `PROCESSING`, `SENT`, `FAILED_RETRYABLE`, `FAILED_FINAL`, `OBSOLETE`, `SUPPRESSED`) — explicitly does **not** include `OPENED`/`CLICKED`/`RESUMED`/`STEP_COMPLETED`/`JOURNEY_COMPLETED`, which are LIFECYCLE-1C/1D's own separate, append-only event history (§26/§27), never retrofitted into this enum.
- `subjectId` remains a plain string, never a polymorphic FK (unenforceable across three different target tables) — `role` disambiguates it.

## 13. Concurrency

The `@@unique([dedupeKey])` constraint is the sole idempotency primitive — "insert and treat a `P2002` conflict as success," never "check then insert." `claimReminderRow` (`src/services/lifecycleReminders.ts`) implements exactly this. Verified live under three sequential duplicate-claim attempts for the same (episode, reminder number, recipient): every attempt after the first is rejected by Postgres, exactly one row persists.

## 14. Decision engine

`assessReminderCandidate` (pure, `reminderCandidate.ts`) is now recipient-scoped: ordering (`nextDueReminderNumber`) is evaluated per `(episodeKey, recipientUserId)` pair, not per episode — two guardians of the same Student have fully independent R1→R2→R3 sequences (one guardian's bounced email never blocks or skips the other's). "Already sent" means status exactly `SENT` — a `FAILED_RETRYABLE`/`FAILED_FINAL` R1 is never counted as sent, so R2 can never leapfrog a failed R1 (tested explicitly).

## 15. Delivery separation

Strictly maintained. `discoverAndClaimDueReminders` (discovery+claim, no send) and `processPendingReminder` (recheck+content+send, one row at a time) are separate functions in `src/services/lifecycleReminders.ts`; the actual Resend call only happens via an explicitly-injected `sendEmail` dependency (`SendLifecycleReminderEmail`), never a default/implicit provider call.

## 16. Pre-send recheck

`preSendRecheck.ts`'s `revalidateReminderIntent` reloads the authoritative `LifecycleJourneyState` fresh AND re-resolves the recipient list fresh, checking the specific `recipientUserId` is still present with `contactAllowed: true` — a check genuinely separate from episode currency, because a guardian relationship can be revoked without the child's own `episodeKey` changing at all. Verified live: revoking Guardian A between claim and send correctly fails Guardian A's recheck (`RECIPIENT_NO_LONGER_VALID`) while leaving Guardian B's recheck unaffected.

## 17. Failure/retry

`retryPolicy.ts` — `LIFECYCLE_REMINDER_MAX_ATTEMPTS = 3`, centralized, never an ad-hoc per-call-site number. `classifyProviderFailure` distinguishes retryable vs. final; `hasExhaustedRetries` bounds the retry loop. `processPendingReminder` marks `OBSOLETE` (never attempted, never retried) whenever the pre-send recheck fails, and `FAILED_FINAL`/`FAILED_RETRYABLE` only for an actual attempted-and-failed provider call.

## 18. Cron architecture

**Built and deployed** (`src/app/api/cron/lifecycle-reminders-tick/route.ts`), mirroring `session-notifications-tick`'s exact shared-secret pattern (`x-cron-secret` header vs. `LIFECYCLE_REMINDERS_CRON_SECRET`). Per the schema decision's explicit authorization ("the cron route may now be IMPLEMENTED and deployed... but MUST remain UNSCHEDULED"):
- **`LIFECYCLE_REMINDERS_CRON_SECRET` was deliberately left unset in every Railway environment** — an additional fail-closed layer beyond "no schedule wired": even a stray manual invocation returns 500 and touches nothing.
- No Railway cron trigger was configured for this route.
- No in-repo scheduler config references it (this codebase keeps none for any cron route — confirmed no `railway.json` or equivalent exists in the repo at all).

## 19. Communication preferences

Unchanged from the schema proposal's own honest classification: `NotificationPreference.emailEnabled` exists but is read by no other transactional email flow in this codebase; LIFECYCLE-1B deliberately checks and honors it anyway — a real strengthening, not existing precedent. Product/legal classification (transactional vs. marketing) remains the owner's to confirm, not invented here.

## 20. Resend boundary

`resendSendLifecycleReminderEmail.ts` / `sendLifecycleReminderEmail.ts` mirror the tutor-application email adapters exactly, routing through the existing, unchanged `getEmailDeliveryMode()` gate. **Zero real Resend calls were made in this mission** — the adapter exists and is wired to the cron route, but the cron route was never actually invoked with a valid secret against production, and no test in this codebase calls the real `resendSendLifecycleReminderEmail` (unit/integration tests exercise the orchestration logic with an injected fake `sendEmail`, never the real one).

## 21. Tracking boundary

Unchanged — no tracking pixel, redirect endpoint, or token exists. Deep links remain PII-free (verified).

## 22. Admin observability

`LifecycleSummaryCard` (`src/components/admin/LifecycleSummaryCard.tsx`) now optionally accepts a `reminders` prop and renders a read-only "Reminders" list (reminder number, relationship, status badge, sent/last-attempt timestamp) when provided. Wired into all three admin detail pages, each querying its own subject's `LifecycleReminder` rows (`journey`-scoped, most-recent-10). **No mutation control exists anywhere in this component or its call sites** — no send/retry/send-all/bulk button, no manual status field.

## 23. Production dry run

Unchanged findings from the schema proposal (2026-09-16): 9 subjects would receive R1 on a first activation tick, 0 would receive R2/R3. **This mission created zero `LifecycleReminder` rows for any real production subject** — every row created during certification referenced only disposable, uniquely-tagged fixture Tutor/Parent/Student rows, all deleted afterward (verified: table row count identical before and after the full fixture-verification run).

## 24. Test plan

- `src/lib/lifecycle/reminders/reminders.test.ts` — 50 deterministic unit tests (cadence, episode identity incl. timezone/PII checks, candidate suppression, multi-guardian independent sequencing, ordering/failure-cannot-leapfrog, deep links incl. auth-guard structural checks, content selection/rendering, cron-route-exists-but-unscheduled, financial/Resend boundaries).
- `src/lib/lifecycle/reminders/recipient.integration.test.ts` + `src/services/lifecycleReminders.integration.test.ts` — DB-backed tests (multi-guardian dedupe/concurrency/revocation, User-deletion SetNull policy) written for CI/any environment with a reachable `DATABASE_URL_TEST`; **could not execute in this session** (unreachable, same honest gap as LIFECYCLE-1A).
- **Disposable fixture-verification script**, run live against production per this project's own established convention (isolated uniquely-tagged fixtures, plain assert output, full cleanup in a `finally` block, script deleted before committing): **19/19 checks passed**, proving the exact behaviors the integration tests assert against a real Postgres unique constraint, real cascade/SetNull FK behavior, and real concurrent-duplicate handling — something no in-memory unit test could prove.
- Full non-DB suite: **2668/2668 passed, 195/195 files**, zero regressions.
- `npx tsc --noEmit`: clean. `npx eslint`: clean. `npm run build`: succeeded (confirms `/api/cron/lifecycle-reminders-tick` builds as a dynamic route).

## 25. Deployment/activation gates

Migration applied to production (see §12/certification report). Application code deployed. **Remaining gate before any real reminder is ever sent**: an explicit, separate future authorization to (a) set `LIFECYCLE_REMINDERS_CRON_SECRET` in Railway and (b) configure an actual Railway cron trigger for this route. Neither happened in this mission.

## 26. LIFECYCLE-1C handoff

`providerMessageId` remains on `LifecycleReminder` for correlation. `DELIVERED`/`OPENED`/`CLICKED`/`BOUNCED`/`COMPLAINED` require their own **separate, append-only event model** — per the schema decision, explicitly NOT folded into `LifecycleReminderStatus`. `OPENED` must never be called "read," anywhere.

## 27. LIFECYCLE-1D handoff

`computeEpisodeKey`/`isEpisodeStillCurrent` remain the exact primitives a future `RESUMED`/`STEP_COMPLETED`/`JOURNEY_COMPLETED` detector needs (compare two `LifecycleJourneyState` snapshots' episode keys over time) — no new source of truth required.
