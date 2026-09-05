import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionNotificationEvent, SessionNotificationRecipientRole, TutoringMode } from "@/generated/prisma/enums";
import { notifyUser } from "@/lib/notify";
import { resolveBookingEmailBaseUrl } from "@/lib/email/resolveBookingEmailBaseUrl";
import type { SendSessionNotificationEmail } from "@/lib/email/resendSendSessionNotificationEmail";

/**
 * PROD-SESSION-NOTIFICATIONS1 — session-lifecycle notifications (reminders,
 * cancellation, no-show), mirroring bookingNotifications.ts /
 * tutorApplicationNotifications.ts's proven two-phase design exactly:
 *
 *  1. emitSessionNotificationEvent — called from INSIDE the same
 *     transaction that commits the underlying session/booking change (a
 *     cancellation, a no-show convergence) or, for reminders (which have
 *     no natural "workflow transaction" — a cron tick IS the trigger), a
 *     small dedicated transaction wrapping exactly this write. Writes an
 *     in-app Notification row (notifyUser, unchanged existing mechanism)
 *     AND a PENDING SessionNotification row (the email outbox) from the
 *     SAME call. `dedupeKey` (content-derived: `session:<bookingId>:
 *     <event>:<role>`) plus `skipDuplicates: true` makes this durably
 *     idempotent — a repeated cron tick, Railway restart, or duplicate
 *     server action can never produce a second row for the same real
 *     occurrence.
 *
 *  2. dispatchSessionNotifications — called AFTER that transaction
 *     commits, reads whatever PENDING/FAILED rows exist for the booking,
 *     and actually calls the email provider. Safe to call repeatedly
 *     (SENT rows always skipped). A failure here is caught per-recipient
 *     and recorded on that row, NEVER rethrown — the underlying session
 *     state (cancellation, no-show resolution) is already durably
 *     committed by the time this runs, and this layer never writes
 *     Payment/Refund/TutorEarning/TutorTransfer at all.
 *
 * Session display fields (subject/level/mode/startAt/endAt/timezone) are
 * read fresh from Booking at dispatch time rather than frozen in
 * contextSnapshot — safe because no reschedule capability exists in this
 * codebase (confirmed by audit), so those fields are effectively
 * immutable for a Booking's lifetime. contextSnapshot carries only the
 * one genuinely event-specific fact cancellation needs
 * (cancelledByRelation).
 *
 * Recipient locale: PAYER resolves via ParentProfile/StudentProfile
 * .preferredLanguage exactly like bookingNotifications.ts already does;
 * TUTOR has the same pre-existing, doubly-confirmed gap (no durable
 * locale anywhere in the schema) and falls back to "en" via the same
 * resolveEmailLocale mechanism — documented, not re-invented (TUTOR-LOCALE1
 * backlog).
 */

export const consoleDevSendSessionNotificationEmail: SendSessionNotificationEmail = async ({ to, subject }) => {
  console.log(`[sessionNotifications] DEV ONLY — no email provider configured. Would send "${subject}" to ${to}`);
  return { providerMessageId: null };
};

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

export interface EmitSessionNotificationEventParams {
  bookingId: string;
  recipientUserId: string;
  recipientRole: SessionNotificationRecipientRole;
  event: SessionNotificationEvent;
  /** Deterministic, content-derived idempotency key — must be identical
   * across a genuine retry of the same real occurrence, different for any
   * genuinely new occurrence. See the module doc comment above. */
  dedupeKey: string;
  /** Event-specific extra display fields only (currently just
   * cancelledByRelation) — never internal notes, never financial figures,
   * never refund status. */
  detail?: Record<string, string>;
  /** Plain-English in-app copy — matches notifyUser's own existing,
   * already-documented "no per-user locale at write time" convention. */
  inAppTitle: string;
  inAppBody: string;
}

/**
 * Called from inside a transaction (cancellationPolicy.ts,
 * sessionLifecycle.ts's no-show convergence, or a dedicated
 * per-booking transaction in sweepDueSessionReminders below). Writes both
 * channels for one business event. `skipDuplicates: true` on the outbox
 * row is defense-in-depth on top of each call site's own deterministic
 * dedupeKey.
 */
export async function emitSessionNotificationEvent(tx: Prisma.TransactionClient, params: EmitSessionNotificationEventParams): Promise<void> {
  await notifyUser(tx, {
    userId: params.recipientUserId,
    type: `session.${params.event.toLowerCase()}`,
    title: params.inAppTitle,
    body: params.inAppBody,
  });

  await tx.sessionNotification.createMany({
    data: [
      {
        bookingId: params.bookingId,
        event: params.event,
        recipientRole: params.recipientRole,
        dedupeKey: params.dedupeKey,
        recipientUserId: params.recipientUserId,
        contextSnapshot: params.detail ?? {},
      },
    ],
    skipDuplicates: true,
  });
}

interface SessionNotificationEmailContext {
  mode: TutoringMode;
  startAt: Date;
  endAt: Date;
  timezone: string;
  subjectSlug: string;
  academicLevelSlug: string | null;
  tutorEmail: string;
  tutorFirstName: string;
  learnerFirstName: string;
  payerEmail: string | null;
  payerFirstName: string;
  payerLocale: string;
}

async function loadSessionNotificationEmailContext(bookingId: string): Promise<SessionNotificationEmailContext | null> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      mode: true,
      startAt: true,
      endAt: true,
      timezone: true,
      subjectId: true,
      academicLevelId: true,
      tutorProfileId: true,
      studentProfileId: true,
    },
  });
  if (!booking) return null;

  const payment = await db.payment.findUnique({ where: { bookingId }, select: { payerUserId: true } });

  const [subject, academicLevel, tutorProfile, studentProfile, payerUser] = await Promise.all([
    db.subject.findUnique({ where: { id: booking.subjectId }, select: { slug: true } }),
    booking.academicLevelId ? db.academicLevel.findUnique({ where: { id: booking.academicLevelId }, select: { slug: true } }) : Promise.resolve(null),
    db.tutorProfile.findUnique({ where: { id: booking.tutorProfileId }, select: { userId: true, user: { select: { name: true, email: true } } } }),
    db.studentProfile.findUnique({ where: { id: booking.studentProfileId }, select: { firstName: true, userId: true, preferredLanguage: true } }),
    payment ? db.user.findUnique({ where: { id: payment.payerUserId }, select: { name: true, email: true } }) : Promise.resolve(null),
  ]);
  if (!subject || !tutorProfile || !studentProfile) return null;

  let payerLocale = "en";
  if (payment) {
    const payerIsLearner = studentProfile.userId != null && studentProfile.userId === payment.payerUserId;
    const payerParentProfile = await db.parentProfile.findUnique({
      where: { userId: payment.payerUserId },
      select: { preferredLanguage: true },
    });
    payerLocale = payerParentProfile?.preferredLanguage ?? (payerIsLearner ? studentProfile.preferredLanguage : "en");
  }

  return {
    mode: booking.mode,
    startAt: booking.startAt,
    endAt: booking.endAt,
    timezone: booking.timezone,
    subjectSlug: subject.slug,
    academicLevelSlug: academicLevel?.slug ?? null,
    tutorEmail: tutorProfile.user.email,
    tutorFirstName: tutorProfile.user.name?.split(" ")[0] ?? "",
    learnerFirstName: studentProfile.firstName,
    payerEmail: payerUser?.email ?? null,
    payerFirstName: payerUser?.name?.split(" ")[0] ?? "",
    payerLocale,
  };
}

export async function dispatchSessionNotifications(
  bookingId: string,
  deps: { sendEmail?: SendSessionNotificationEmail; baseUrl?: string } = {}
): Promise<void> {
  const pending = await db.sessionNotification.findMany({
    where: { bookingId, status: { in: ["PENDING", "FAILED"] } },
  });
  if (pending.length === 0) return;

  const resolvedBaseUrl = resolveBookingEmailBaseUrl(deps.baseUrl);
  if (!resolvedBaseUrl) return;

  const loaded = await loadSessionNotificationEmailContext(bookingId);
  if (!loaded) return;

  const [{ resolveSendSessionNotificationEmail }, { buildSessionNotificationEmailContent }] = await Promise.all([
    import("@/lib/email/sendSessionNotificationEmail"),
    import("@/lib/email/sessionNotificationEmailContent"),
  ]);
  const sendEmail = deps.sendEmail ?? resolveSendSessionNotificationEmail();

  for (const row of pending) {
    try {
      const to = row.recipientRole === "TUTOR" ? loaded.tutorEmail : loaded.payerEmail;
      if (!to) throw new Error("No resolvable email address for this recipient role");

      const locale = row.recipientRole === "TUTOR" ? "en" : loaded.payerLocale;
      const snapshot = row.contextSnapshot as Record<string, string>;
      const content = await buildSessionNotificationEmailContent({
        locale,
        recipientRole: row.recipientRole,
        recipientFirstName: row.recipientRole === "TUTOR" ? loaded.tutorFirstName : loaded.payerFirstName,
        otherPartyFirstName: row.recipientRole === "TUTOR" ? loaded.learnerFirstName : loaded.tutorFirstName,
        event: row.event,
        subjectSlug: loaded.subjectSlug,
        academicLevelSlug: loaded.academicLevelSlug,
        mode: loaded.mode === "BOTH" ? "ONLINE" : loaded.mode,
        startAt: loaded.startAt,
        endAt: loaded.endAt,
        timezone: loaded.timezone,
        cancelledByRelation: snapshot.cancelledByRelation as "RECIPIENT" | "OTHER_PARTY" | "PLATFORM" | undefined,
        dashboardUrl:
          row.recipientRole === "TUTOR" ? `${resolvedBaseUrl}/${locale}/tutor/bookings` : `${resolvedBaseUrl}/${locale}/dashboard/bookings`,
      });
      const result = await sendEmail({ to, ...content });
      await db.sessionNotification.updateMany({
        where: { id: row.id, status: { in: ["PENDING", "FAILED"] } },
        data: { status: "SENT", sentAt: new Date(), error: null, providerMessageId: result.providerMessageId },
      });
    } catch (error) {
      await db.sessionNotification.updateMany({
        where: { id: row.id },
        data: { status: "FAILED", attemptCount: { increment: 1 }, lastAttemptAt: new Date(), error: sanitizeError(error) },
      });
    }
  }
}

export function dispatchSessionNotificationsAfterCommit(bookingId: string): Promise<void> {
  return dispatchSessionNotifications(bookingId).catch((error) => {
    console.error("[sessionNotifications] dispatch failed", error instanceof Error ? error.message : String(error));
  });
}

const REMINDER_24H_MS = 24 * 60 * 60 * 1000;
const REMINDER_2H_MS = 2 * 60 * 60 * 1000;

const REMINDER_IN_APP_COPY: Record<"SESSION_REMINDER_24H" | "SESSION_REMINDER_2H", { title: string; body: string }> = {
  SESSION_REMINDER_24H: { title: "Upcoming session tomorrow", body: "You have a tutoring session scheduled in about 24 hours." },
  SESSION_REMINDER_2H: { title: "Upcoming session soon", body: "You have a tutoring session starting in about 2 hours." },
};

export interface SweepDueSessionRemindersResult {
  bookingIds: string[];
}

/**
 * Reminder windows are defined directly against `now`, not against an
 * assumed exact cron cadence (this repo's cron schedule is configured
 * outside the repository — see /api/cron/session-notifications-tick's own
 * doc comment): a booking is due for the 24h reminder any time `now`
 * falls in [startAt-24h, startAt-2h), and due for the 2h reminder any
 * time `now` falls in [startAt-2h, startAt). Both windows have a hard
 * upper bound so a cron outage spanning an entire window causes that
 * booking's reminder for that window to be skipped, never sent stale/late
 * with wrong-sounding copy ("tomorrow" when it's actually in 20 minutes) —
 * matching the mission's explicit "do not send reminders for already-
 * passed windows" requirement. `skipDuplicates` (via emitSessionNotification
 * Event) makes a duplicate/overlapping tick safe regardless of cadence.
 */
export async function sweepDueSessionReminders(limit = 100): Promise<SweepDueSessionRemindersResult> {
  const now = new Date();
  const windows: Array<{ event: "SESSION_REMINDER_24H" | "SESSION_REMINDER_2H"; from: Date; to: Date }> = [
    { event: "SESSION_REMINDER_24H", from: new Date(now.getTime() + REMINDER_2H_MS), to: new Date(now.getTime() + REMINDER_24H_MS) },
    { event: "SESSION_REMINDER_2H", from: now, to: new Date(now.getTime() + REMINDER_2H_MS) },
  ];

  const touched = new Set<string>();
  for (const window of windows) {
    const candidates = await db.booking.findMany({
      where: { status: "CONFIRMED", startAt: { gt: window.from, lte: window.to } },
      select: {
        id: true,
        tutorProfile: { select: { userId: true } },
        payment: { select: { payerUserId: true } },
      },
      take: limit,
    });

    for (const booking of candidates) {
      if (!booking.payment) continue; // no resolvable payer — should not happen for a CONFIRMED booking; skip defensively, never guess
      const copy = REMINDER_IN_APP_COPY[window.event];
      await db.$transaction(async (tx) => {
        await emitSessionNotificationEvent(tx, {
          bookingId: booking.id,
          recipientUserId: booking.tutorProfile.userId,
          recipientRole: "TUTOR",
          event: window.event,
          dedupeKey: `session:${booking.id}:${window.event}:TUTOR`,
          inAppTitle: copy.title,
          inAppBody: copy.body,
        });
        await emitSessionNotificationEvent(tx, {
          bookingId: booking.id,
          recipientUserId: booking.payment!.payerUserId,
          recipientRole: "PAYER",
          event: window.event,
          dedupeKey: `session:${booking.id}:${window.event}:PAYER`,
          inAppTitle: copy.title,
          inAppBody: copy.body,
        });
      });
      touched.add(booking.id);
    }
  }

  return { bookingIds: [...touched] };
}
