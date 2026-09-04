import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { resolveBookingEmailBaseUrl } from "@/lib/email/resolveBookingEmailBaseUrl";
import type { BookingEmailContext } from "@/lib/email/bookingConfirmationEmailContent";

/**
 * PROD-BOOKING-NOTIFICATIONS1 — booking-confirmation email delivery.
 *
 * Two-phase design, matching the mission's explicit requirement that email
 * delivery sit OUTSIDE the financial DB transaction / Stripe capture
 * atomicity:
 *
 *  1. createPendingBookingEmailNotifications — called from INSIDE
 *     convergeToCaptured's existing Serializable transaction, guarded by
 *     the same "!existingEarning" one-time check that already protects the
 *     in-app Notification writes there. Cheap DB rows only, no network
 *     I/O, so it can never make that transaction slower/riskier to retry.
 *     This is what makes the feature idempotent: BookingEmailNotification
 *     has a hard @@unique([bookingId, recipientRole]) constraint, so this
 *     can run again (a Serializable retry, a webhook replay reaching an
 *     already-CONFIRMED booking) and never produce a second row.
 *
 *  2. dispatchBookingConfirmationEmails — called AFTER that transaction
 *     commits (never inside it), reads whatever PENDING/FAILED rows exist
 *     for the booking, and actually calls the email provider. Safe to
 *     call repeatedly for the same booking (a real retry mechanism, not
 *     just accidental idempotency) — SENT rows are always skipped, so
 *     re-invoking it (e.g. after a transient Resend outage) only touches
 *     what still needs sending. A failure here is caught per-recipient and
 *     recorded on that row; it is NEVER rethrown to the caller (Payment/
 *     Booking state is already durably committed by the time this runs).
 */

export interface SendBookingConfirmationEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}
export type SendBookingConfirmationEmail = (params: SendBookingConfirmationEmailParams) => Promise<void>;

/** Dev-only fallback — mirrors consoleDevSendPasswordResetEmail's exact
 * "print instead of send" convention. Never prints the HTML body (could
 * contain the payer's amount/booking details) — subject + recipient only,
 * the functional equivalent of "an email was sent" for local development. */
export const consoleDevSendBookingConfirmationEmail: SendBookingConfirmationEmail = async ({ to, subject }) => {
  console.log(`[bookingNotifications] DEV ONLY — no email provider configured. Would send "${subject}" to ${to}`);
};

/** Sanitized error text only — never a raw stack trace or exception
 * object, mirrors resendSendPasswordResetEmail's own logging discipline. */
function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

export interface CreatePendingBookingEmailNotificationsParams {
  bookingId: string;
  tutorUserId: string;
  payerUserId: string;
}

/**
 * Called from inside convergeToCaptured's transaction — see the module
 * doc comment above. `skipDuplicates: true` is defense-in-depth on top of
 * the caller's own one-time guard: even a direct, unguarded call can never
 * produce a second row for a (booking, role) pair already recorded.
 */
export async function createPendingBookingEmailNotifications(
  tx: Prisma.TransactionClient,
  params: CreatePendingBookingEmailNotificationsParams
): Promise<void> {
  await tx.bookingEmailNotification.createMany({
    data: [
      { bookingId: params.bookingId, recipientRole: "TUTOR", recipientUserId: params.tutorUserId },
      { bookingId: params.bookingId, recipientRole: "PAYER", recipientUserId: params.payerUserId },
    ],
    skipDuplicates: true,
  });
}

/**
 * Re-resolves every fact needed to render both templates fresh from the
 * database at send time — never from anything cached on the
 * BookingEmailNotification row itself, so the email always reflects the
 * booking's real, current, committed state.
 *
 * Locale resolution: no `locale`/`preferredLanguage` field exists on User
 * itself in this schema. The payer's locale is resolved from whichever
 * profile actually owns that login — ParentProfile.preferredLanguage if
 * the payer is a parent, otherwise StudentProfile.preferredLanguage if the
 * payer is the learner themselves — falling back to "en" only if neither
 * resolves (documented gap, not invented: there is currently no durable
 * locale preference for a tutor's own account at all, so the tutor email
 * always uses "en" until one exists).
 */
async function loadBookingEmailContext(bookingId: string): Promise<{
  tutorUserId: string;
  tutorEmail: string;
  tutorLocale: string;
  payerUserId: string;
  payerEmail: string;
  payerLocale: string;
  context: Omit<BookingEmailContext, "locale">;
} | null> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      mode: true,
      startAt: true,
      endAt: true,
      timezone: true,
      totalCents: true,
      currency: true,
      subjectId: true,
      academicLevelId: true,
      studentProfileId: true,
      tutorProfileId: true,
    },
  });
  if (!booking || (booking.mode !== "ONLINE" && booking.mode !== "IN_PERSON")) return null;

  const payment = await db.payment.findUnique({
    where: { bookingId: booking.id },
    select: { payerUserId: true, amountCents: true, currency: true },
  });
  if (!payment) return null;

  const [subject, academicLevel, tutorProfile, studentProfile, payerUser] = await Promise.all([
    db.subject.findUnique({ where: { id: booking.subjectId }, select: { slug: true } }),
    booking.academicLevelId ? db.academicLevel.findUnique({ where: { id: booking.academicLevelId }, select: { slug: true } }) : Promise.resolve(null),
    db.tutorProfile.findUnique({ where: { id: booking.tutorProfileId }, select: { userId: true, user: { select: { name: true, email: true } } } }),
    db.studentProfile.findUnique({ where: { id: booking.studentProfileId }, select: { firstName: true, userId: true, preferredLanguage: true } }),
    db.user.findUnique({ where: { id: payment.payerUserId }, select: { name: true, email: true } }),
  ]);
  if (!subject || !tutorProfile || !studentProfile || !payerUser) return null;

  const tutorFirstName = tutorProfile.user.name?.split(" ")[0] ?? "";
  const payerFirstName = payerUser.name?.split(" ")[0] ?? "";
  const payerIsLearner = studentProfile.userId != null && studentProfile.userId === payment.payerUserId;

  // Payer locale: prefer a ParentProfile match (a parent paid), then a
  // matching StudentProfile (the learner paid for themselves), else "en".
  const payerParentProfile = await db.parentProfile.findUnique({
    where: { userId: payment.payerUserId },
    select: { preferredLanguage: true },
  });
  const payerLocale = payerParentProfile?.preferredLanguage ?? (payerIsLearner ? studentProfile.preferredLanguage : "en");

  return {
    tutorUserId: tutorProfile.userId,
    tutorEmail: tutorProfile.user.email,
    tutorLocale: "en", // documented gap — see this function's doc comment
    payerUserId: payment.payerUserId,
    payerEmail: payerUser.email,
    payerLocale,
    context: {
      tutorFirstName,
      learnerFirstName: studentProfile.firstName,
      payerFirstName,
      payerIsLearner,
      subjectSlug: subject.slug,
      academicLevelSlug: academicLevel?.slug ?? null,
      mode: booking.mode,
      startAt: booking.startAt,
      endAt: booking.endAt,
      timezone: booking.timezone,
      amountCents: payment.amountCents,
      currency: payment.currency,
      bookingUrl: "", // filled in per-recipient below (role-specific path)
    },
  };
}

export async function dispatchBookingConfirmationEmails(
  bookingId: string,
  deps: { sendEmail?: SendBookingConfirmationEmail; baseUrl?: string } = {}
): Promise<void> {
  const pending = await db.bookingEmailNotification.findMany({
    where: { bookingId, status: { in: ["PENDING", "FAILED"] } },
  });
  if (pending.length === 0) return;

  // Request-independent by design (PROD-BOOKING-NOTIFICATIONS1-BASEURLFIX1)
  // — never derived from next/headers. `deps.baseUrl` is for a controlled,
  // reviewed one-off invocation; the default is the existing trusted
  // canonical site.url. Either way, resolveBookingEmailBaseUrl validates
  // HTTPS/non-localhost and fails closed (null) rather than guessing — a
  // rejection here means the rows simply stay PENDING/FAILED for a later,
  // correctly-configured retry, exactly like the old "no request context"
  // case did, but now unreachable via the normal default path.
  const resolvedBaseUrl = resolveBookingEmailBaseUrl(deps.baseUrl);
  if (!resolvedBaseUrl) return;

  const loaded = await loadBookingEmailContext(bookingId);
  if (!loaded) return; // nothing safe to send yet/anymore — rows stay PENDING/FAILED for a later retry

  // Dynamic imports, not top-level — src/lib/email/bookingConfirmationEmailContent.ts
  // pulls in next-intl/server (transitively next/headers), which cannot
  // resolve outside a real Next.js server runtime. payments.ts imports
  // this module unconditionally (createPendingBookingEmailNotifications is
  // used inside convergeToCaptured's transaction), so a top-level import
  // here would drag next-intl/server into every test that merely imports
  // payments.ts — including ones with nothing to do with email and no
  // reason to mock it. Deferring the import to here means it's only ever
  // loaded on an actual dispatch attempt.
  const [{ resolveSendBookingConfirmationEmail }, { buildTutorBookingEmailContent, buildPayerBookingEmailContent }] = await Promise.all([
    import("@/lib/email/sendBookingConfirmationEmail"),
    import("@/lib/email/bookingConfirmationEmailContent"),
  ]);
  const sendEmail = deps.sendEmail ?? resolveSendBookingConfirmationEmail();

  for (const row of pending) {
    try {
      if (row.recipientRole === "TUTOR") {
        const content = await buildTutorBookingEmailContent({
          ...loaded.context,
          locale: loaded.tutorLocale,
          bookingUrl: `${resolvedBaseUrl}/${loaded.tutorLocale}/tutor/bookings`,
        });
        await sendEmail({ to: loaded.tutorEmail, ...content });
      } else {
        const content = await buildPayerBookingEmailContent({
          ...loaded.context,
          locale: loaded.payerLocale,
          bookingUrl: `${resolvedBaseUrl}/${loaded.payerLocale}/dashboard/bookings`,
        });
        await sendEmail({ to: loaded.payerEmail, ...content });
      }

      await db.bookingEmailNotification.updateMany({
        where: { id: row.id, status: { in: ["PENDING", "FAILED"] } },
        data: { status: "SENT", sentAt: new Date(), error: null },
      });
    } catch (error) {
      await db.bookingEmailNotification.updateMany({
        where: { id: row.id },
        data: { status: "FAILED", attemptCount: { increment: 1 }, lastAttemptAt: new Date(), error: sanitizeError(error) },
      });
    }
  }
}
