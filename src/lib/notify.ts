import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Notification (Phase A schema) had zero real writers before Phase F —
 * Quick Match is the first real consumer. IN_APP channel only this phase;
 * EMAIL/SMS/PUSH stay unconfigured (same "explicit not-configured state"
 * discipline as Phase E's TaxService). Title/body are plain English strings,
 * not run through next-intl — a known simplification: this is
 * server-generated dynamic text with no per-user locale context available
 * at write time, unlike the app's static UI copy.
 *
 * SESSION-NOTIFICATION-INAPP-DEDUP-FIX1: `dedupeKey` is optional and
 * defaults to the original plain-create behavior for every existing
 * caller (financial notifications, Quick Match, messaging via its own
 * upsertMessageNotification, etc.) — nothing about their behavior changes.
 * A caller that DOES pass one (currently: sessionNotifications.ts's
 * emitSessionNotificationEvent, reusing the exact same
 * `session:<bookingId>:<event>:<role>` value already used for
 * SessionNotification.dedupeKey) gets a durable, DB-level guarantee — via
 * Notification.dedupeKey's own real unique constraint plus
 * `skipDuplicates: true` — that a repeated logical emission (a retried cron
 * tick, a concurrent duplicate invocation, a process restart) can never
 * produce a second in-app row for the same real occurrence. This is
 * Postgres-level atomicity, not an app-level check-then-write race: safe
 * under genuinely concurrent callers, not just repeated sequential ones.
 */
export async function notifyUser(
  tx: Prisma.TransactionClient,
  params: { userId: string; type: string; title: string; body: string; metadata?: Prisma.InputJsonValue; dedupeKey?: string }
) {
  if (params.dedupeKey) {
    await tx.notification.createMany({
      data: [
        {
          userId: params.userId,
          type: params.type,
          title: params.title,
          body: params.body,
          channel: "IN_APP",
          metadata: params.metadata,
          dedupeKey: params.dedupeKey,
        },
      ],
      skipDuplicates: true,
    });
    return;
  }

  await tx.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      channel: "IN_APP",
      metadata: params.metadata,
    },
  });
}
