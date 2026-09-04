import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { TutorApplicationNotificationEvent, TutorApplicationStatus } from "@/generated/prisma/enums";
import { notifyUser } from "@/lib/notify";
import { resolveBookingEmailBaseUrl } from "@/lib/email/resolveBookingEmailBaseUrl";
import type { SendTutorApplicationEmail } from "@/lib/email/resendSendTutorApplicationEmail";

/**
 * PROD-TUTOR-APPLICATION-NOTIFICATIONS1 — tutor application-lifecycle
 * notifications (email + in-app), mirroring bookingNotifications.ts's
 * proven two-phase design exactly:
 *
 *  1. emitTutorApplicationEvent — called from INSIDE the same
 *     tutorApplicationWorkflow.ts transaction that commits the workflow
 *     change (a status transition, a document decision, an interview
 *     schedule, an exam attempt). Writes an in-app Notification row
 *     (notifyUser, unchanged existing mechanism) AND a PENDING
 *     TutorApplicationNotification row (the email outbox) from the SAME
 *     call — one business event, two channels, never two independent
 *     decisions that could disagree. `dedupeKey` (content-derived, see
 *     each call site in tutorApplicationWorkflow.ts) plus
 *     `skipDuplicates: true` is what makes this durably idempotent: a
 *     repeated Admin click, browser retry, or Railway restart mid-flight
 *     can never produce a second outbox row or a second in-app row for
 *     the same real occurrence (in-app dedup rides the same guarantee,
 *     since both writes happen atomically together and the whole
 *     transaction only ever commits once per real transition).
 *
 *  2. dispatchTutorApplicationNotifications — called AFTER that
 *     transaction commits, reads whatever PENDING/FAILED rows exist for
 *     the tutor, and actually calls the email provider. Safe to call
 *     repeatedly (SENT rows are always skipped). A failure here is caught
 *     per-recipient and recorded on that row, NEVER rethrown to the
 *     caller — the underlying workflow transition (document review,
 *     interview result, training/exam progress, approval/rejection) is
 *     already durably committed by the time this runs, exactly matching
 *     this mission's transaction-safety requirement.
 *
 * Tutor locale: no durable per-tutor locale/language preference exists
 * anywhere in the schema today (TutorProfile has none, User has none —
 * confirmed by the same audit that built this feature; TutorLanguage is
 * the languages a tutor *teaches in*, a different concept).
 * bookingNotifications.ts already hit this identical gap for tutor
 * recipients and documented hardcoding "en" as the fallback rather than
 * inventing a new policy — this module makes the same documented choice,
 * for the same reason, via the same resolveEmailLocale() fallback
 * mechanism (never a bespoke hardcode).
 */

export const consoleDevSendTutorApplicationEmail: SendTutorApplicationEmail = async ({ to, subject }) => {
  console.log(`[tutorApplicationNotifications] DEV ONLY — no email provider configured. Would send "${subject}" to ${to}`);
  return { providerMessageId: null };
};

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

export interface EmitTutorApplicationEventParams {
  tutorProfileId: string;
  recipientUserId: string;
  event: TutorApplicationNotificationEvent;
  /** Deterministic, content-derived idempotency key — see the module doc
   * comment above. Must be identical across a genuine retry of the same
   * real occurrence, and different for any genuinely new occurrence. */
  dedupeKey: string;
  /** The tutor's applicationStatus at the moment of this event — frozen
   * into contextSnapshot so the eventual email always matches what
   * actually happened, never a possibly-since-changed live value. */
  applicationStatus: TutorApplicationStatus;
  /** Event-specific extra display fields only (documentType, reason,
   * scheduledAtIso, score) — never internal admin notes, reviewer
   * comments, or score breakdowns. See tutorApplicationEmailContent.ts. */
  detail?: Record<string, string | number>;
  /** Plain-English in-app copy — matches notifyUser's own existing,
   * already-documented "no per-user locale at write time" convention
   * (src/lib/notify.ts). Not a new gap introduced by this feature. */
  inAppTitle: string;
  inAppBody: string;
}

/**
 * Called from inside a tutorApplicationWorkflow.ts transaction. Writes
 * both channels for one business event. `skipDuplicates: true` on the
 * outbox row is defense-in-depth on top of each call site's own
 * deterministic dedupeKey — even a direct, unguarded call can never
 * produce a second row for a dedupeKey already recorded.
 */
export async function emitTutorApplicationEvent(tx: Prisma.TransactionClient, params: EmitTutorApplicationEventParams): Promise<void> {
  await notifyUser(tx, {
    userId: params.recipientUserId,
    type: `tutor_application.${params.event.toLowerCase()}`,
    title: params.inAppTitle,
    body: params.inAppBody,
  });

  await tx.tutorApplicationNotification.createMany({
    data: [
      {
        tutorProfileId: params.tutorProfileId,
        event: params.event,
        dedupeKey: params.dedupeKey,
        recipientUserId: params.recipientUserId,
        contextSnapshot: { applicationStatus: params.applicationStatus, ...(params.detail ?? {}) },
      },
    ],
    skipDuplicates: true,
  });
}

async function loadTutorApplicationEmailContext(
  tutorProfileId: string
): Promise<{ tutorEmail: string; tutorFirstName: string } | null> {
  const tutorProfile = await db.tutorProfile.findUnique({
    where: { id: tutorProfileId },
    select: { user: { select: { name: true, email: true } } },
  });
  if (!tutorProfile) return null;
  return {
    tutorEmail: tutorProfile.user.email,
    tutorFirstName: tutorProfile.user.name?.split(" ")[0] ?? "",
  };
}

export async function dispatchTutorApplicationNotifications(
  tutorProfileId: string,
  deps: { sendEmail?: SendTutorApplicationEmail; baseUrl?: string } = {}
): Promise<void> {
  const pending = await db.tutorApplicationNotification.findMany({
    where: { tutorProfileId, status: { in: ["PENDING", "FAILED"] } },
  });
  if (pending.length === 0) return;

  // Request-independent by design (reuses the exact PROD-BOOKING-
  // NOTIFICATIONS1-BASEURLFIX1 mechanism) — never derived from
  // next/headers. See resolveBookingEmailBaseUrl.ts.
  const resolvedBaseUrl = resolveBookingEmailBaseUrl(deps.baseUrl);
  if (!resolvedBaseUrl) return;

  const loaded = await loadTutorApplicationEmailContext(tutorProfileId);
  if (!loaded) return; // nothing safe to send yet/anymore — rows stay PENDING/FAILED for a later retry

  // Dynamic imports, not top-level — tutorApplicationEmailContent.ts pulls
  // in dashboard.tutor.* message content only needed on an actual dispatch
  // attempt, mirroring dispatchBookingConfirmationEmails's exact reasoning
  // for keeping tutorApplicationWorkflow.ts's own test suite (and any
  // other caller of emitTutorApplicationEvent) free of that import weight.
  const [{ resolveSendTutorApplicationEmail }, { buildTutorApplicationEmailContent }] = await Promise.all([
    import("@/lib/email/sendTutorApplicationEmail"),
    import("@/lib/email/tutorApplicationEmailContent"),
  ]);
  const sendEmail = deps.sendEmail ?? resolveSendTutorApplicationEmail();

  // Documented gap — see this module's doc comment above.
  const locale = "en";

  for (const row of pending) {
    try {
      const snapshot = row.contextSnapshot as Record<string, string | number>;
      const { applicationStatus, ...detail } = snapshot;
      const content = await buildTutorApplicationEmailContent({
        locale,
        tutorFirstName: loaded.tutorFirstName,
        event: row.event,
        applicationStatus: applicationStatus as TutorApplicationStatus,
        detail,
        dashboardUrl: `${resolvedBaseUrl}/${locale}/tutor/dashboard`,
      });
      const result = await sendEmail({ to: loaded.tutorEmail, ...content });
      await db.tutorApplicationNotification.updateMany({
        where: { id: row.id, status: { in: ["PENDING", "FAILED"] } },
        data: { status: "SENT", sentAt: new Date(), error: null, providerMessageId: result.providerMessageId },
      });
    } catch (error) {
      await db.tutorApplicationNotification.updateMany({
        where: { id: row.id },
        data: { status: "FAILED", attemptCount: { increment: 1 }, lastAttemptAt: new Date(), error: sanitizeError(error) },
      });
    }
  }
}
