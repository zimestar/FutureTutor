import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type AuditWriter = { auditLog: { create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown> } };

/**
 * Pass a Prisma interactive-transaction client as `tx` to write the audit
 * row atomically alongside the state change it documents; omit it to write
 * standalone against the global client.
 */
export async function writeAuditLog(
  params: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  tx: AuditWriter = db
) {
  await tx.auditLog.create({
    data: {
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: params.metadata,
    },
  });
}
