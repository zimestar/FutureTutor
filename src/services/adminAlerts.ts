import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AdminAlertEvent, AdminPermission } from "@/generated/prisma/enums";
import { notifyUser } from "@/lib/notify";
import { resolveBookingEmailBaseUrl } from "@/lib/email/resolveBookingEmailBaseUrl";
import type { SendTutorApplicationEmail } from "@/lib/email/resendSendTutorApplicationEmail";

/**
 * TUTOR-PIPELINE1 — alerts to the admin team about tutor applications.
 *
 * Same two-phase design as tutorApplicationNotifications.ts:
 *
 *  1. emitAdminAlert runs INSIDE the business transaction (application
 *     submitted, document uploaded, training/exam completed). For every
 *     current recipient it writes an in-app Notification and a PENDING
 *     AdminAlertNotification row (the email outbox), so the alert commits
 *     atomically with the event it describes. The unique
 *     (dedupeKey, recipientKey) pair makes a retried request a no-op.
 *
 *  2. dispatchAdminAlerts runs AFTER the commit and sends the emails. A
 *     provider failure is recorded on the row and retried later by the
 *     daily digest cron; it never rolls back or blocks the candidate's
 *     action.
 *
 * Recipients: every active SUPER_ADMIN, plus every active ADMIN holding the
 * permission needed to act on the alert (ADMIN_TUTORS_REVIEW for tutor
 * applications, ADMIN_SAFETY_REPORTS for safety concerns), plus the
 * optional shared team mailbox ADMIN_ALERTS_TEAM_EMAIL.
 */

const MAX_SEND_ATTEMPTS = 5;
const TEAM_RECIPIENT_KEY = "team";

export interface AdminAlertRecipient {
  recipientKey: string;
  userId: string | null;
}

export function getAdminAlertTeamEmail(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.ADMIN_ALERTS_TEAM_EMAIL?.trim();
  return raw && raw.includes("@") ? raw : null;
}

/** Language of the team mailbox's emails; admins use their own preferredLocale. */
export function getAdminAlertTeamLocale(env: Record<string, string | undefined> = process.env): string {
  return env.ADMIN_ALERTS_TEAM_LOCALE === "en" ? "en" : "fr";
}

export async function resolveAlertRecipients(
  tx: Prisma.TransactionClient,
  permission: AdminPermission
): Promise<AdminAlertRecipient[]> {
  const admins = await tx.user.findMany({
    where: {
      deactivatedAt: null,
      OR: [{ role: "SUPER_ADMIN" }, { role: "ADMIN", adminPermissions: { some: { permission } } }],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const recipients: AdminAlertRecipient[] = admins.map((admin) => ({ recipientKey: `user:${admin.id}`, userId: admin.id }));
  if (getAdminAlertTeamEmail()) recipients.push({ recipientKey: TEAM_RECIPIENT_KEY, userId: null });
  return recipients;
}

export function resolveTutorReviewAlertRecipients(tx: Prisma.TransactionClient): Promise<AdminAlertRecipient[]> {
  return resolveAlertRecipients(tx, "ADMIN_TUTORS_REVIEW");
}

export interface EmitAdminAlertParams {
  event: AdminAlertEvent;
  /** Identifies the real occurrence; identical across retries of it. */
  dedupeKey: string;
  tutorProfileId: string | null;
  /** Who may act on it. Defaults to ADMIN_TUTORS_REVIEW (tutor applications). */
  recipientPermission?: AdminPermission;
  /** Admin page the alert links to, when it isn't a tutor application. */
  adminPath?: string;
  /** Frozen display data for the email (names, document type, digest items). */
  detail: Prisma.InputJsonObject;
  inAppTitle: string;
  inAppBody: string;
}

export async function emitAdminAlert(tx: Prisma.TransactionClient, params: EmitAdminAlertParams): Promise<void> {
  const recipients = await resolveAlertRecipients(tx, params.recipientPermission ?? "ADMIN_TUTORS_REVIEW");
  if (recipients.length === 0) return;
  const metadata = {
    ...(params.tutorProfileId ? { tutorProfileId: params.tutorProfileId } : {}),
    ...(params.adminPath ? { adminPath: params.adminPath } : {}),
  };

  for (const recipient of recipients) {
    if (!recipient.userId) continue;
    await notifyUser(tx, {
      userId: recipient.userId,
      type: `admin_alert.${params.event.toLowerCase()}`,
      title: params.inAppTitle,
      body: params.inAppBody,
      metadata,
      dedupeKey: `admin_alert:${params.dedupeKey}:${recipient.recipientKey}`,
    });
  }

  await tx.adminAlertNotification.createMany({
    data: recipients.map((recipient) => ({
      event: params.event,
      dedupeKey: params.dedupeKey,
      recipientKey: recipient.recipientKey,
      recipientUserId: recipient.userId,
      tutorProfileId: params.tutorProfileId,
      contextSnapshot: params.adminPath ? { ...params.detail, adminPath: params.adminPath } : params.detail,
    })),
    skipDuplicates: true,
  });
}

function sanitizeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

/**
 * Sends every PENDING/FAILED alert (optionally limited to some ids) that has
 * not exhausted its retry budget. Safe to call repeatedly and concurrently:
 * a row is only marked SENT if it is still unsent.
 */
export async function dispatchAdminAlerts(
  options: { ids?: string[]; sendEmail?: SendTutorApplicationEmail; baseUrl?: string } = {}
): Promise<{ sent: number; failed: number }> {
  const rows = await db.adminAlertNotification.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attemptCount: { lt: MAX_SEND_ATTEMPTS },
      ...(options.ids ? { id: { in: options.ids } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const baseUrl = resolveBookingEmailBaseUrl(options.baseUrl);
  if (!baseUrl) return { sent: 0, failed: 0 };

  const [{ resolveSendAdminAlertEmail }, { buildAdminAlertEmailContent }] = await Promise.all([
    import("@/lib/email/sendAdminAlertEmail"),
    import("@/lib/email/adminAlertEmailContent"),
  ]);
  const sendEmail = options.sendEmail ?? resolveSendAdminAlertEmail();
  const teamEmail = getAdminAlertTeamEmail();

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      let to: string | null = null;
      let locale = getAdminAlertTeamLocale();
      if (row.recipientUserId) {
        // Re-resolved at send time: a deactivated or demoted admin no longer
        // receives alerts that were queued before the change.
        const admin = await db.user.findUnique({
          where: { id: row.recipientUserId },
          select: { email: true, preferredLocale: true, role: true, deactivatedAt: true },
        });
        if (admin && !admin.deactivatedAt && (admin.role === "ADMIN" || admin.role === "SUPER_ADMIN")) {
          to = admin.email;
          locale = admin.preferredLocale ?? "en";
        }
      } else {
        to = teamEmail;
      }
      if (!to) {
        // Nobody to deliver to any more — close the row instead of retrying forever.
        await db.adminAlertNotification.update({
          where: { id: row.id },
          data: { status: "FAILED", attemptCount: MAX_SEND_ATTEMPTS, error: "Recipient no longer eligible" },
        });
        continue;
      }

      const content = buildAdminAlertEmailContent({
        locale,
        event: row.event,
        detail: row.contextSnapshot as Record<string, unknown>,
        baseUrl,
        tutorProfileId: row.tutorProfileId,
      });
      const result = await sendEmail({ to, ...content });
      const updated = await db.adminAlertNotification.updateMany({
        where: { id: row.id, status: { in: ["PENDING", "FAILED"] } },
        data: { status: "SENT", sentAt: new Date(), error: null, providerMessageId: result.providerMessageId },
      });
      sent += updated.count;
    } catch (error) {
      failed += 1;
      await db.adminAlertNotification.update({
        where: { id: row.id },
        data: { status: "FAILED", attemptCount: { increment: 1 }, lastAttemptAt: new Date(), error: sanitizeError(error) },
      });
    }
  }
  return { sent, failed };
}

/** Post-commit, fire-and-forget form used by business code. Never throws. */
export async function dispatchAdminAlertsAfterCommit(): Promise<void> {
  try {
    await dispatchAdminAlerts();
  } catch (error) {
    console.error("[adminAlerts] dispatch failed", error instanceof Error ? error.message : String(error));
  }
}
