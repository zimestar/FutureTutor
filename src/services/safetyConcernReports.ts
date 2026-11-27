import "server-only";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { emitAdminAlert, dispatchAdminAlertsAfterCommit } from "@/services/adminAlerts";
import {
  createSafetyConcernReportSchema,
  updateSafetyConcernReportSchema,
  type CreateSafetyConcernReportInput,
} from "@/schemas/safetyConcernReports";
import type { SafetyConcernStatus } from "@/generated/prisma/enums";

/**
 * SAFETY-REPORTS1 — the official channel for reporting a safety concern
 * (Tutor Agreement §49; taught in tutor training module 2).
 *
 * Any signed-in user may report. The report is stored, the reporter gets an
 * in-app acknowledgement, and every admin allowed to handle safety reports
 * (SUPER_ADMIN, ADMIN with ADMIN_SAFETY_REPORTS, team mailbox) is alerted
 * at once — marked urgent when the reporter says someone is in immediate
 * danger. The reporter's free-text description never leaves this table: no
 * email, notification or audit entry contains it.
 */

export type CreateSafetyConcernReportResult =
  | { ok: true; reportId: string }
  | { ok: false; reason: "VALIDATION" | "ACCOUNT_INACTIVE" };

export async function createSafetyConcernReport(
  actorUserId: string,
  input: CreateSafetyConcernReportInput
): Promise<CreateSafetyConcernReportResult> {
  const parsed = createSafetyConcernReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "VALIDATION" };

  const reporter = await db.user.findUnique({ where: { id: actorUserId }, select: { role: true, deactivatedAt: true } });
  if (!reporter || reporter.deactivatedAt) return { ok: false, reason: "ACCOUNT_INACTIVE" };

  const report = await db.$transaction(async (tx) => {
    const created = await tx.safetyConcernReport.create({
      data: {
        reporterUserId: actorUserId,
        reporterRole: reporter.role,
        category: parsed.data.category,
        immediateDanger: parsed.data.immediateDanger,
        concerning: parsed.data.concerning,
        description: parsed.data.description,
      },
      select: { id: true },
    });
    await writeAuditLog(
      {
        actorUserId,
        action: "safety_concern.reported",
        entityType: "SafetyConcernReport",
        entityId: created.id,
        metadata: { category: parsed.data.category, immediateDanger: parsed.data.immediateDanger },
      },
      tx
    );
    await notifyUser(tx, {
      userId: actorUserId,
      type: "safety_concern.received",
      title: "Report received",
      body: "Thank you. Our team has been alerted and will follow up. If someone is in immediate danger, call 911.",
      metadata: { reportId: created.id },
      dedupeKey: `safety_concern:${created.id}:received`,
    });
    await emitAdminAlert(tx, {
      event: "SAFETY_CONCERN_REPORTED",
      dedupeKey: `safetyConcern:${created.id}`,
      tutorProfileId: null,
      recipientPermission: "ADMIN_SAFETY_REPORTS",
      adminPath: `/admin/safety-reports/${created.id}`,
      detail: { category: parsed.data.category, immediateDanger: parsed.data.immediateDanger, reporterRole: reporter.role },
      inAppTitle: parsed.data.immediateDanger ? "URGENT safety concern reported" : "Safety concern reported",
      inAppBody: parsed.data.immediateDanger
        ? "A user reports that someone may be in immediate danger. Review it now."
        : "A user filed a safety concern report. Review it promptly.",
    });
    return created;
  });

  await dispatchAdminAlertsAfterCommit();
  return { ok: true, reportId: report.id };
}

export async function listSafetyConcernReports(status?: SafetyConcernStatus) {
  return db.safetyConcernReport.findMany({
    where: status ? { status } : {},
    orderBy: [{ immediateDanger: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      category: true,
      immediateDanger: true,
      status: true,
      reporterRole: true,
      createdAt: true,
      reporter: { select: { name: true, email: true } },
    },
  });
}

export async function getSafetyConcernReport(id: string) {
  return db.safetyConcernReport.findUnique({
    where: { id },
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      resolvedByUser: { select: { name: true, email: true } },
    },
  });
}

export type UpdateSafetyConcernReportResult = { ok: true } | { ok: false; reason: "VALIDATION" | "NOT_FOUND" };

/** Status change by an admin already authorized for ADMIN_SAFETY_REPORTS. */
export async function updateSafetyConcernReport(
  adminUserId: string,
  reportId: string,
  input: { status: string; resolutionNote?: string }
): Promise<UpdateSafetyConcernReportResult> {
  const parsed = updateSafetyConcernReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "VALIDATION" };

  return db.$transaction(async (tx) => {
    const existing = await tx.safetyConcernReport.findUnique({ where: { id: reportId }, select: { status: true } });
    if (!existing) return { ok: false, reason: "NOT_FOUND" } as const;
    const resolved = parsed.data.status === "RESOLVED";
    await tx.safetyConcernReport.update({
      where: { id: reportId },
      data: {
        status: parsed.data.status,
        ...(parsed.data.resolutionNote !== undefined ? { resolutionNote: parsed.data.resolutionNote } : {}),
        resolvedAt: resolved ? new Date() : null,
        resolvedByUserId: resolved ? adminUserId : null,
      },
    });
    await writeAuditLog(
      {
        actorUserId: adminUserId,
        action: "safety_concern.status_changed",
        entityType: "SafetyConcernReport",
        entityId: reportId,
        metadata: { from: existing.status, to: parsed.data.status },
      },
      tx
    );
    return { ok: true } as const;
  });
}
