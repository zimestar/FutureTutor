# LIFECYCLE-1A — Onboarding State & Abandonment Detection

Status: Implemented, tested, production dry-run complete. No emails sent, no schema changes, no financial reachability.

## 1. Executive summary

FutureTutor could create Tutor/Parent/Student accounts but had no centralized, deterministic way to answer "what stage is this user in, and would a reminder be appropriate?" This mission built a pure, read-only, domain-derived **lifecycle evaluator** (`src/lib/lifecycle/`) that observes the existing authoritative state machines already in the codebase — `TutorProfile.applicationStatus` and its workflow (`src/services/tutorApplicationWorkflow.ts` / `src/lib/tutorExperience.ts`), `ParentStudentRelationship`, `StudentProfile`, and `resolveStudentAccountActivationState` (`src/services/familyManagement.ts`) — and normalizes them into one shared shape: `LifecycleJourneyState`. It never writes anything, never sends anything, and never becomes a second source of truth.

## 2. Existing problem

Nothing in the codebase could answer, in one place and for any of the three roles: current stage, whether the next action belongs to the user or to FutureTutor/admin/a guardian, when the user last made real progress, or whether a reminder would currently be appropriate. LIFECYCLE-1B (the reminder engine) cannot be built safely without this layer existing first and being independently verified.

## 3. Authoritative Tutor journey

Derived from `prisma/schema.prisma`'s `TutorApplicationStatus` enum and enforced exclusively by `src/services/tutorApplicationWorkflow.ts` (the only module allowed to write `applicationStatus`):

```
DRAFT → SUBMITTED → UNDER_REVIEW → INTERVIEW_REQUIRED → INTERVIEW_COMPLETED
  → TRAINING_REQUIRED → TRAINING_COMPLETED → EXAM_REQUIRED → EXAM_COMPLETED
  → FINAL_REVIEW → APPROVED
Terminal side-states: REJECTED (from any non-terminal status), SUSPENDED (from APPROVED, reactivatable)
```

`src/lib/tutorExperience.ts` already encodes, per status, which party is responsible next (`tutor` | `futureTutor` | `admin`) and the tutor-facing next-action URL — this is the single source LIFECYCLE-1A's Tutor evaluator reads from, rather than re-deriving it. Confirmed by tracing every Server Action: `startDocumentReview`, `requireInterview`, `sendToFinalReview`, `approveTutor`, `rejectTutor`, `suspendTutor`, `reactivateTutor` (`src/lib/actions/adminTutorReview.ts`), `scheduleInterview`/`recordInterviewEvaluation`/`completeInterview` (`src/lib/actions/tutorInterview.ts`), and `requireTraining`/`requireExam` are **100% admin-only** — a tutor has no action available during `SUBMITTED`, `UNDER_REVIEW`, `INTERVIEW_REQUIRED`, `INTERVIEW_COMPLETED`, `TRAINING_COMPLETED`, `EXAM_COMPLETED`, or `FINAL_REVIEW`. Only `DRAFT` (submit application), `TRAINING_REQUIRED` (acknowledge modules), and `EXAM_REQUIRED` (take the exam) are tutor-actionable.

## 4. Authoritative Parent journey

`ParentProfile` has exactly two required fields (`firstName`, `lastName`), both set atomically at signup (`src/services/signup.ts`) — there is no source-evidenced "incomplete profile" state for a Parent. The one real, product-visible onboarding action is adding at least one child (`src/app/[locale]/dashboard/page.tsx`'s own "learners.emptyDescription" / "addCta" UI). LIFECYCLE-1A therefore models exactly two Parent stages: `STUDENT_SETUP` (zero `ACTIVE` `ParentStudentRelationship` rows) and `READY` (one or more).

## 5. Authoritative Student journey

Two genuinely distinct sub-journeys exist in the product, and LIFECYCLE-1A keeps them as two separate `LifecycleJourney` values rather than merging them:

- **`STUDENT_PROFILE_READINESS`** — applies to every `StudentProfile` row (SELF_MANAGED or GUARDIAN_MANAGED). Readiness reuses `profileFieldsFilled()`'s own existing 3-field definition (`academicLevelId`, `province`, `city`) from `src/app/[locale]/dashboard/page.tsx` — the one place in the product that already treats a StudentProfile as "needing attention" — rather than inventing a second definition.
- **`STUDENT_LOGIN_LINKING`** — applies to a `User` (role `STUDENT`) with **no linked `StudentProfile` yet**: the `FamilyInvitation(type: STUDENT_LOGIN)` claim flow (Phase H.5), where a guardian-managed child claims their own login and a guardian must separately approve it. This directly reuses `resolveStudentAccountActivationState` (`src/services/familyManagement.ts`) rather than re-deriving its precedence rules.

## 6. Lifecycle architecture

```
src/lib/lifecycle/
  types.ts              — LifecycleJourneyState and the bounded taxonomies
  config.ts             — centralized inactivity/reminder-eligibility thresholds
  tutorLifecycle.ts      — assessTutorLifecycle (pure) + loadTutorLifecycleInput/getTutorLifecycle (DB)
  parentLifecycle.ts     — assessParentLifecycle (pure) + loaders
  studentLifecycle.ts    — assessStudentProfileLifecycle + assessStudentLoginLinking (pure) + loaders
  index.ts               — assessLifecycleJourney(...) dispatcher, barrel exports
```

Every `assess*` function is a pure function: `(input, now) -> LifecycleJourneyState`, fully unit-testable with no database. Every `load*`/`get*` function is the thin, DB-touching wrapper that assembles that input from the real tables. This mirrors the mission's own instruction: "the lifecycle layer must not become a second conflicting source of truth" — `assessTutorLifecycle` calls into `getTutorExperience()` (the existing product logic) rather than re-encoding `responsibleParty`, and `loadStudentLoginLinkingInput` calls `resolveStudentAccountActivationState` directly rather than re-deriving its precedence.

## 7. Stage taxonomy

- **Tutor**: the literal existing `TutorApplicationStatus` enum (`DRAFT` … `APPROVED`/`REJECTED`/`SUSPENDED`) — the smallest truthful taxonomy is the one the domain already uses.
- **Parent**: `STUDENT_SETUP` | `READY`.
- **Student (profile readiness)**: `PROFILE` | `READY`.
- **Student (login linking)**: `UNLINKED` | `PENDING_GUARDIAN_APPROVAL` | `REJECTED_OR_REVOKED` | `EXPIRED`.

## 8. Status taxonomy

`USER_ACTION_REQUIRED`, `WAITING_ON_FUTURETUTOR`, `WAITING_ON_ADMIN`, `WAITING_ON_GUARDIAN`, `COMPLETED`, `REJECTED`, `SUSPENDED`, `INELIGIBLE`, `UNKNOWN` — never collapsed into a boolean. `WAITING_ON_ADMIN` is reserved for the two Tutor stages where a single, discrete admin decision is the sole blocker (`INTERVIEW_REQUIRED`, `FINAL_REVIEW`); every other admin-pipeline stage is `WAITING_ON_FUTURETUTOR`. Both are always `reminderEligible: false`, so this split is informational, not behavior-changing.

## 9. Meaningful progress definition

Login/page-view/dashboard-visit activity is never a lifecycle input — no `*LifecycleInput` type accepts a generic "last seen" field (enforced by test §37). Per role:

- **Tutor**: `max(TutorProfile.createdAt, latest TutorApplicationNotification.createdAt, latest TutorDocument.uploadedAt, latest TutorTrainingProgress timestamp, latest TutorExamAttempt timestamp)`. `TutorApplicationNotification` is an existing durable outbox row fired inside the same transaction as every meaningful workflow transition — a faithful signal with zero new schema. **Documented gap**: `TutorSubject`/`TutorLevel`/`TutorEducation`/`TutorCertification` carry no `createdAt` field, so filling those in during `DRAFT` is not independently observable beyond the profile's own `createdAt` floor.
- **Parent**: `max(ParentProfile.createdAt, latest ParentStudentRelationship.createdAt across all relationships, latest "profile.parent.updated" AuditLog row)`.
- **Student (profile readiness)**: `max(StudentProfile.createdAt, latest "profile.student.updated" AuditLog row)`.
- **Student (login linking)**: `max(User.createdAt, the relevant FamilyInvitation.claimedAt)`.

## 10. nextAction semantics

A relative app path (e.g. `/tutor/training`, `/dashboard/family`) when, and only when, `userActionRequired` is true; `null` otherwise (including every waiting/completed/suspended/rejected state) — a subject is never told to "go do something" while the ball is actually in FutureTutor's, an admin's, or a guardian's court.

## 11. Inactivity semantics

`inactiveDurationMs = now - lastMeaningfulProgressAt`. Reminder eligibility requires `USER_ACTION_REQUIRED` **and** `inactiveDurationMs >= REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS` (currently 24h, `src/lib/lifecycle/config.ts`, shared with the same named 24h/72h/7d cadence constants LIFECYCLE-1B is expected to reuse rather than redefine).

## 12. Reminder eligibility

`reminderEligible` is `true` in exactly one case: `status === "USER_ACTION_REQUIRED"` and the inactivity threshold has been met. Every other status (`WAITING_ON_*`, `COMPLETED`, `REJECTED`, `SUSPENDED`, `INELIGIBLE`, `UNKNOWN`) is unconditionally `false`, regardless of how long it has been — proven by test §32 with a 10,000-hour-old waiting state.

## 13. Suppression rules

`suppressionReason` is always populated whenever `reminderEligible` is `false`: `APPLICATION_APPROVED`, `APPLICATION_REJECTED`, `APPLICATION_SUSPENDED`, `ACCOUNT_SUSPENDED`, `WAITING_ON_FUTURETUTOR`, `WAITING_ON_ADMIN`, `WAITING_ON_GUARDIAN`, `ONBOARDING_COMPLETED`, `INACTIVITY_BELOW_THRESHOLD`, `CLAIM_EXPIRED`, `MISSING_STATE_EVIDENCE`. Uncertain/unrecognized states fail closed to `UNKNOWN` / `MISSING_STATE_EVIDENCE`, never to a guessed actionable state (test §29/§30).

## 14. Tutor waiting states

`WAITING_ON_FUTURETUTOR` covers `SUBMITTED`, `UNDER_REVIEW`, `INTERVIEW_COMPLETED`, `TRAINING_COMPLETED`, `EXAM_COMPLETED`. `WAITING_ON_ADMIN` covers `INTERVIEW_REQUIRED` and `FINAL_REVIEW`. A suspended application (`applicationStatus === "SUSPENDED"`) or a deactivated `User.deactivatedAt` overrides every other signal to `SUSPENDED`, even mid-`TRAINING_REQUIRED` (test §14).

## 15. Parent handling

A Parent with children is `COMPLETED` and never reminder-eligible, regardless of any child's own profile completeness — a child's profile gap is that child's own `STUDENT_PROFILE_READINESS` journey, evaluated separately (see §5, §16). This keeps "the parent has no action left" and "one of their children's profiles is incomplete" distinguishable, per the mission's explicit instruction against false-classifying a Parent with nothing left to do.

## 16. Student/guardian safety

`LifecycleJourneyState.recipientUserId` is explicitly **not** the same field as `subjectId`. For a `GUARDIAN_MANAGED` `StudentProfile` with no login of its own, `recipientUserId` is `null` — LIFECYCLE-1A never guesses that the child should be emailed directly, and never resolves the guardian recipient itself (that is explicitly deferred to LIFECYCLE-1B, which must resolve it via `ParentStudentRelationship`). For the `STUDENT_LOGIN_LINKING` `PENDING_GUARDIAN_APPROVAL` state, `status` is `WAITING_ON_GUARDIAN` with `userActionRequired: false` and `reminderEligible: false` unconditionally — the mission's own worked example (a student waiting on a guardian decision must never be nudged as if it were their turn) is a permanent regression test (test suite, "PENDING_GUARDIAN_APPROVAL … never reminder eligible however long it's been pending").

## 17. Data-model decision

**No schema change.** Every evaluator is a pure function over already-existing rows (`TutorProfile`, `TutorApplicationNotification`, `TutorDocument`, `TutorTrainingProgress`, `TutorExamAttempt`, `ParentProfile`, `ParentStudentRelationship`, `StudentProfile`, `FamilyInvitation`, `AuditLog`, `User.deactivatedAt`). `AuditLog` (already indexed on `[entityType, entityId]` and `[createdAt]`) supplies the Parent/Student profile-edit progress signal without any new table. No `LifecycleJourney` persistence table was created — LIFECYCLE-1A recomputes fresh on every call, per the mission's stated preference. Migration: **none proposed, none applied.**

## 18. Admin observability

Read-only `LifecycleSummaryCard` (`src/components/admin/LifecycleSummaryCard.tsx`) added to the existing Tutor/Parent/Student admin detail pages (`src/app/[locale]/admin/{tutors,parents,students}/[id]/page.tsx`), showing stage, status, next action, last meaningful progress, inactivity, reminder eligibility, and suppression reason. No mutation path was added: no send-reminder button, no bulk action (enforced by `lifecycleAdminWiring.test.ts`).

## 19. Production dry-run methodology

A disposable, read-only TypeScript script (following this project's established convention: written to the project root, executed via `railway run -p 129c54bd-9be2-4d39-9c0b-e97b0544836a -s FutureTutor -e production -- node --conditions=react-server --import tsx`, then deleted and its removal confirmed) loaded every `TutorProfile`, `ParentProfile`, and `StudentProfile` row and every bare `STUDENT`-role `User`, ran them through the exact same evaluators as this module, and printed **only aggregate counts by status and by stage** — zero email addresses, names, or other PII were ever printed or persisted anywhere.

## 20. Production aggregate findings

Snapshot taken 2026-09-16 (production, read-only):

| Role | Total | USER_ACTION_REQUIRED | WAITING_ON_FUTURETUTOR | WAITING_ON_ADMIN | COMPLETED | Other |
|---|---|---|---|---|---|---|
| Tutor | 4 | 2 | 0 | 1 | 1 | 0 |
| Parent | 5 | 4 | — | — | 1 | 0 |
| Student (profile readiness) | 4 | 3 | — | — | 1 | 0 |
| Student (login-linking) | 0 | 0 | 0 | 0 | 0 | 0 |

Tutor stage breakdown: `DRAFT: 2`, `INTERVIEW_REQUIRED: 1`, `APPROVED: 1`. Parent stage breakdown: `STUDENT_SETUP: 4`, `READY: 1`. Student stage breakdown: `PROFILE: 3`, `READY: 1`. No `REJECTED`/`SUSPENDED`/`UNKNOWN` rows exist in production today. This is consistent with a small, early Closed Beta population — no anomaly was found.

## 21. Privacy boundary

No PII field exists anywhere on `LifecycleJourneyState` (enforced by test §41) — only ids, enums, booleans, and dates. The Phase 13 diagnostic printed aggregate counts only, never a row-level identifier, email, or name.

## 22. Email tracking future boundary

LIFECYCLE-1A implements none of it. For LIFECYCLE-1C: the distinct states `SENT`, `DELIVERED`, `OPENED`, `CLICKED`, `RESUMED`, `STEP_COMPLETED`, `JOURNEY_COMPLETED`, `BOUNCED`, `COMPLAINED` will need their own persistence — **`OPENED` must never be relabeled or described as "read"** (per the mission's explicit instruction). No tracking pixel, redirect-tracking endpoint, token, or PII-bearing URL was created in this mission.

## 23. Analytics boundary

`src/lib/lifecycle/` has zero imports of GTM/GA4/`dataLayer`/`ConsentBanner`/anything under `src/lib/analytics/` — enforced structurally by `lifecycle.boundary.test.ts`, which greps this module's own source text for those symbols. No `dataLayer` event was added anywhere in this mission. DATA-2's certified 11-event taxonomy is untouched.

## 24. Tests

- `src/lib/lifecycle/lifecycle.test.ts` — 52 deterministic unit tests over the pure evaluators (no DB), covering the mission's Phase 17 §1-§46 checklist.
- `src/lib/lifecycle/lifecycle.boundary.test.ts` — 5 tests structurally enforcing the Resend/cron/analytics/financial/Server-Action boundaries.
- `src/lib/lifecycle/lifecycleAdminWiring.test.ts` — proves the three admin pages are wired read-only, with no reminder-send/bulk action introduced.
- `src/lib/lifecycle/lifecycle.integration.test.ts` — DB-backed tests for every loader function plus the ADMIN-role exclusion guarantee (§28); could not be executed in this session (test database unreachable — `ECONNREFUSED` against `DATABASE_URL_TEST`; not fabricated as passing, per the mission's explicit instruction).
- Full non-DB suite (`npm run test:unit`, `vitest run --exclude "**/*.integration.test.ts"`): **2618/2618 passed, 193/193 files**, covering auth, Tutor onboarding, Parent, Student, admin, training, analytics/consent regression, and SEO private-route tests — zero regressions.
- `npx tsc --noEmit`: clean. `npx eslint`: clean (project-wide and on every touched file). `npm run build`: succeeded.

## 25. Deployment

Deployed to production following the established release workflow after all gates above passed. See the mission's final certification report for the exact commit/deployment identifiers.

## 26. Deferred to LIFECYCLE-1B/1C/1D

- **1B** — the actual reminder engine (24h/72h/7d cadence, idempotency, recipient selection including guardian resolution for `GUARDIAN_MANAGED` students, stop-on-progress, email templates, cron). Must consume `LifecycleJourneyState.reminderEligible`/`recipientUserId`/`suppressionReason` as-is, not re-derive them.
- **1C** — email delivery & attribution (`SENT`/`DELIVERED`/`OPENED`/`CLICKED`/`BOUNCED`/`COMPLAINED`, provider webhooks, secure attribution). `OPENED` is never "read."
- **1D** — resume & conversion (`CLICKED`/`RESUMED`/`STEP_COMPLETED`/`JOURNEY_COMPLETED`, an admin activation dashboard, funnel analytics).

None of this scope was pulled into LIFECYCLE-1A.
