import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { LifecycleReminderStatus } from "@/generated/prisma/enums";
import { getTutorLifecycle } from "@/lib/lifecycle/tutorLifecycle";
import { getParentLifecycle } from "@/lib/lifecycle/parentLifecycle";
import { getStudentProfileLifecycle } from "@/lib/lifecycle/studentLifecycle";
import { assessReminderCandidate, type ReminderCandidate } from "@/lib/lifecycle/reminders/reminderCandidate";
import { computeEpisodeKey } from "@/lib/lifecycle/reminders/episode";
import { resolveSelfReminderRecipient, resolveStudentReminderRecipients } from "@/lib/lifecycle/reminders/recipient";
import { revalidateReminderIntent } from "@/lib/lifecycle/reminders/preSendRecheck";
import { buildReminderDeepLink } from "@/lib/lifecycle/reminders/deepLink";
import { buildReminderEmailContent } from "@/lib/lifecycle/reminders/content";
import {
  classifyProviderFailure,
  hasExhaustedRetries,
  LIFECYCLE_REMINDER_MAX_ATTEMPTS,
  LIFECYCLE_REMINDER_RETRY_BACKOFF_MINUTES,
} from "@/lib/lifecycle/reminders/retryPolicy";
import type { ReminderActivationPolicy } from "@/lib/lifecycle/reminders/activationMode";
import type { ReminderNumber, ReminderRecipient } from "@/lib/lifecycle/reminders/types";
import type { LifecycleJourneyState, LifecycleRole } from "@/lib/lifecycle/types";

/**
 * LIFECYCLE-1B — the history-aware decision engine + dispatcher, now that
 * the LifecycleReminder table has been approved and migrated (see the
 * schema decision). Mirrors src/services/tutorApplicationNotifications.ts's
 * proven two-phase shape exactly:
 *
 *  1. discoverAndClaimDueReminders — bounded scan of the small existing
 *     Tutor/Parent/Student population, fresh LIFECYCLE-1A evaluation per
 *     subject, fresh recipient resolution per subject, and an atomic
 *     claim (INSERT with the unique dedupeKey; a P2002 conflict means
 *     another concurrent run already claimed the identical
 *     episode+reminderNumber+recipient — treated as success, not an
 *     error, per the schema decision's CONCURRENCY requirement).
 *  2. processPendingReminder — takes ONE already-claimed PENDING row,
 *     immediately re-validates everything fresh (the mandatory pre-send
 *     recheck — episode currency AND the specific recipient's continued
 *     validity, e.g. a guardian relationship revoked after claiming but
 *     before sending), builds content, and — ONLY via the injected
 *     `sendEmail` dependency — sends. A missing/undefined `sendEmail` is a
 *     programming error (never silently falls back to a real provider),
 *     enforced by requiring callers to pass one explicitly; the real
 *     Resend-backed implementation lives in
 *     src/lib/email/sendLifecycleReminderEmail.ts and is wired only by the
 *     (still-unscheduled) cron route — never called from this service
 *     directly, and never called anywhere during LIFECYCLE-1B's own
 *     certification.
 *
 * Every write here is scoped to ONE row at a time (never one giant
 * transaction across the whole batch) — a single subject's failure can
 * never abort the rest of the batch.
 */

export type SendLifecycleReminderEmail = (params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<{ providerMessageId: string | null }>;

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

async function loadFreshState(role: LifecycleRole, subjectId: string, now: Date): Promise<LifecycleJourneyState | null> {
  if (role === "TUTOR") return getTutorLifecycle(db, subjectId, now);
  if (role === "PARENT") return getParentLifecycle(db, subjectId, now);
  return getStudentProfileLifecycle(db, subjectId, now);
}

async function resolveRecipients(role: LifecycleRole, state: LifecycleJourneyState): Promise<ReminderRecipient[]> {
  return role === "STUDENT" ? resolveStudentReminderRecipients(db, state) : resolveSelfReminderRecipient(db, state, null);
}

/** SENT-only numbers for this exact (episodeKey, recipientUserId) pair —
 * the ordering contract cadence.ts's nextDueReminderNumber requires. */
async function loadAlreadySentNumbers(episodeKey: string, recipientUserId: string): Promise<ReminderNumber[]> {
  const rows = await db.lifecycleReminder.findMany({
    where: { episodeKey, recipientUserId, status: "SENT" },
    select: { reminderNumber: true },
  });
  return rows.map((r) => r.reminderNumber as ReminderNumber);
}

export interface ClaimedReminder {
  id: string;
  role: LifecycleRole;
  subjectId: string;
  candidate: ReminderCandidate;
}

/**
 * Phase 1 of the worker — bounded discovery + atomic claim. Never sends
 * anything itself. `limit` bounds each role's own candidate scan (never an
 * unbounded table scan) — see schema decision §10/§16 "bounded candidate
 * processing".
 */
export async function discoverAndClaimDueReminders(options: {
  policy: ReminderActivationPolicy;
  limit?: number;
  now?: Date;
}): Promise<ClaimedReminder[]> {
  const { policy, limit = 50, now = new Date() } = options;
  const claimed: ClaimedReminder[] = [];
  // Disabled mode never even scans — zero queries, zero rows.
  if (policy.mode === "disabled") return claimed;

  const [tutorIds, parentIds, studentIds] = await Promise.all([
    db.tutorProfile.findMany({ where: { applicationStatus: { notIn: ["APPROVED", "REJECTED"] } }, select: { id: true }, take: limit }),
    db.parentProfile.findMany({ select: { id: true }, take: limit }),
    db.studentProfile.findMany({ select: { id: true }, take: limit }),
  ]);

  const subjects: { role: LifecycleRole; subjectId: string }[] = [
    ...tutorIds.map((t) => ({ role: "TUTOR" as const, subjectId: t.id })),
    ...parentIds.map((p) => ({ role: "PARENT" as const, subjectId: p.id })),
    ...studentIds.map((s) => ({ role: "STUDENT" as const, subjectId: s.id })),
  ];

  for (const { role, subjectId } of subjects) {
    try {
      const state = await loadFreshState(role, subjectId, now);
      if (!state || state.status !== "USER_ACTION_REQUIRED") continue;

      const recipients = await resolveRecipients(role, state);
      for (const recipient of recipients) {
        if (!recipient.contactAllowed) continue;
        // Checked BEFORE the claim, so in canary mode no LifecycleReminder
        // row is ever created for a non-allowlisted (real) recipient.
        if (!policy.isRecipientPermitted(recipient.recipientEmail)) continue;

        const freshEpisodeKey = computeEpisodeKey(state);
        if (!freshEpisodeKey) continue;
        const alreadySent = await loadAlreadySentNumbers(freshEpisodeKey, recipient.recipientUserId);
        const candidate = assessReminderCandidate(state, recipient.recipientUserId, alreadySent);
        if (!candidate) continue;

        const claimedRow = await claimReminderRow(role, state, recipient, candidate, now);
        if (claimedRow) claimed.push({ id: claimedRow.id, role, subjectId, candidate });
      }
    } catch (error) {
      // One subject's failure (a query error, a malformed row) must never
      // abort the rest of the bounded batch.
      console.error("[lifecycleReminders] discovery failed for one subject", role, subjectId, sanitizeError(error));
    }
  }

  return claimed;
}

async function claimReminderRow(
  role: LifecycleRole,
  state: LifecycleJourneyState,
  recipient: ReminderRecipient,
  candidate: ReminderCandidate,
  now: Date
): Promise<{ id: string } | null> {
  try {
    return await db.lifecycleReminder.create({
      data: {
        role,
        journey: state.journey,
        subjectId: state.subjectId,
        stage: state.stage,
        episodeKey: candidate.episodeKey,
        reminderNumber: candidate.reminderNumber,
        recipientUserId: recipient.recipientUserId,
        relationship: recipient.relationship,
        locale: recipient.locale,
        dedupeKey: candidate.dedupeKey,
        status: "PENDING",
        scheduledFor: now,
      },
      select: { id: true },
    });
  } catch (error) {
    // P2002 (unique constraint violation on dedupeKey) means a concurrent
    // discovery run already claimed this exact episode+reminderNumber+
    // recipient — the CORRECT, idempotent outcome, not an error.
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      return null;
    }
    throw error;
  }
}

/** SKIPPED = nothing was sent and the row was left untouched (not
 * permitted by the current activation mode, or another worker owns it). */
export type ProcessOutcome = "SENT" | "OBSOLETE" | "FAILED_RETRYABLE" | "FAILED_FINAL" | "SKIPPED";

/**
 * Phase 2 of the worker — takes ONE PENDING/FAILED_RETRYABLE row and either
 * sends it or marks it obsolete/failed. `sendEmail` must be explicitly
 * provided by the caller (never defaults to a real provider) — see this
 * module's own doc comment.
 */
export async function processPendingReminder(
  reminderId: string,
  sendEmail: SendLifecycleReminderEmail,
  policy: ReminderActivationPolicy,
  now: Date = new Date()
): Promise<ProcessOutcome> {
  const row = await db.lifecycleReminder.findUniqueOrThrow({ where: { id: reminderId } });

  if (row.status !== "PENDING" && row.status !== "FAILED_RETRYABLE") {
    // Already terminal (SENT/OBSOLETE/FAILED_FINAL/SUPPRESSED) or mid-flight
    // (PROCESSING, claimed by a concurrent worker) — nothing to do.
    return row.status === "SENT" ? "SENT" : "SKIPPED";
  }

  if (!row.recipientUserId) {
    await markRow(row.id, { status: "OBSOLETE", obsoleteAt: now });
    return "OBSOLETE";
  }

  // Activation mode re-checked at send time, not just at claim time — an
  // operator switching back to disabled (or removing an address from the
  // canary list) takes effect immediately. The row is left untouched so it
  // can be sent later if re-permitted (the pre-send recheck below still
  // obsoletes it then if the episode moved on in the meantime).
  const permissionCheckUser = await db.user.findUnique({ where: { id: row.recipientUserId }, select: { email: true } });
  if (!permissionCheckUser?.email || !policy.isRecipientPermitted(permissionCheckUser.email)) {
    return "SKIPPED";
  }

  // Atomic claim: only the worker whose conditional update actually moved
  // the row out of PENDING/FAILED_RETRYABLE may send. A concurrent worker
  // (e.g. a fresh tick overlapping a retry sweep) gets count 0 and stops
  // here — this is what makes "no duplicate provider send after claim"
  // hold even when the same row is handed to two workers at once.
  const claim = await db.lifecycleReminder.updateMany({
    where: { id: row.id, status: { in: ["PENDING", "FAILED_RETRYABLE"] } },
    data: { status: "PROCESSING" },
  });
  if (claim.count === 0) return "SKIPPED";

  const recheck = await revalidateReminderIntent(db, { role: row.role, subjectId: row.subjectId, episodeKey: row.episodeKey, recipientUserId: row.recipientUserId }, now);
  if (!recheck.safe) {
    await markRow(row.id, { status: "OBSOLETE", obsoleteAt: now });
    return "OBSOLETE";
  }

  const deepLinkUrl = buildReminderDeepLink(recheck.freshState.nextAction, row.locale === "fr" ? "fr" : "en");
  if (!deepLinkUrl) {
    await markRow(row.id, { status: "FAILED_FINAL", attemptCount: { increment: 1 }, lastAttemptAt: now, error: "NO_DEEP_LINK_AVAILABLE" });
    return "FAILED_FINAL";
  }

  const [recipientUser, subjectFirstName] = await Promise.all([
    db.user.findUnique({ where: { id: row.recipientUserId }, select: { name: true, email: true } }),
    row.role === "STUDENT" && row.relationship === "GUARDIAN"
      ? db.studentProfile.findUnique({ where: { id: row.subjectId }, select: { firstName: true } })
      : Promise.resolve(null),
  ]);
  if (!recipientUser || !recipientUser.email) {
    await markRow(row.id, { status: "FAILED_FINAL", attemptCount: { increment: 1 }, lastAttemptAt: now, error: "MISSING_RECIPIENT_EMAIL" });
    return "FAILED_FINAL";
  }

  const content = buildReminderEmailContent({
    locale: row.locale === "fr" ? "fr" : "en",
    recipientFirstName: recipientUser.name?.split(" ")[0] ?? "",
    relationship: row.relationship,
    role: row.role,
    stage: row.stage as LifecycleJourneyState["stage"],
    reminderNumber: row.reminderNumber as ReminderNumber,
    deepLinkUrl,
    recipientChildFirstName: subjectFirstName?.firstName,
  });
  if (!content) {
    await markRow(row.id, { status: "FAILED_FINAL", attemptCount: { increment: 1 }, lastAttemptAt: now, error: "NO_CONTENT_FOR_STAGE" });
    return "FAILED_FINAL";
  }

  try {
    const result = await sendEmail({ to: recipientUser.email, ...content });
    await markRow(row.id, { status: "SENT", sentAt: now, lastAttemptAt: now, attemptCount: { increment: 1 }, providerMessageId: result.providerMessageId, error: null });
    return "SENT";
  } catch (error) {
    const classification = classifyProviderFailure({ permanent: false }); // real provider-error classification wired at the sendEmail boundary
    const nextAttemptCount = row.attemptCount + 1;
    const final = classification === "FINAL" || hasExhaustedRetries(nextAttemptCount);
    await markRow(row.id, {
      status: final ? "FAILED_FINAL" : "FAILED_RETRYABLE",
      attemptCount: { increment: 1 },
      lastAttemptAt: now,
      error: sanitizeError(error),
    });
    return final ? "FAILED_FINAL" : "FAILED_RETRYABLE";
  }
}

/**
 * Retry sweep — before this existed, a FAILED_RETRYABLE row (or a PENDING
 * row left behind by a crash between claim and send) was never picked up
 * again by anything, AND it permanently blocked that recipient's sequence:
 * the next tick re-proposed the same R-number (only SENT counts as sent),
 * whose dedupeKey then collided with the stuck row. Bounded, oldest first,
 * and only after LIFECYCLE_REMINDER_RETRY_BACKOFF_MINUTES — so rows claimed
 * in the current tick (scheduledFor = now) are never re-picked by the same
 * tick, and a provider outage isn't hammered every minute.
 *
 * PROCESSING rows are deliberately NOT recovered: a crash mid-send leaves
 * it unknowable whether the provider already accepted the email, and
 * re-sending would risk a duplicate. They stay visible in admin
 * observability for a human to judge.
 */
export async function findResumableReminderIds(limit = 50, now: Date = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - LIFECYCLE_REMINDER_RETRY_BACKOFF_MINUTES * 60_000);
  const rows = await db.lifecycleReminder.findMany({
    where: {
      OR: [
        { status: "PENDING", scheduledFor: { lte: cutoff } },
        { status: "FAILED_RETRYABLE", attemptCount: { lt: LIFECYCLE_REMINDER_MAX_ATTEMPTS }, lastAttemptAt: { lte: cutoff } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function markRow(
  id: string,
  data: {
    status: LifecycleReminderStatus;
    obsoleteAt?: Date;
    sentAt?: Date;
    lastAttemptAt?: Date;
    attemptCount?: { increment: number };
    providerMessageId?: string | null;
    error?: string | null;
  }
) {
  await db.lifecycleReminder.update({ where: { id }, data: data as Prisma.LifecycleReminderUpdateInput });
}
