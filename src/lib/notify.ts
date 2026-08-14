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
 */
export async function notifyUser(
  tx: Prisma.TransactionClient,
  params: { userId: string; type: string; title: string; body: string; metadata?: Prisma.InputJsonValue }
) {
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
