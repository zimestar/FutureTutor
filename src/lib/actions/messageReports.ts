"use server";

import { auth } from "@/lib/auth";
import { createMessageReport, updateMessageReportStatus } from "@/services/messageReports";
import { hasAdminPermission } from "@/lib/adminPermission";
import type { MessageReportStatus } from "@/generated/prisma/enums";

/**
 * MESSAGING-MVP1C — reporterUserId/adminUserId are always resolved from
 * auth() server-side; neither is ever accepted as a parameter from the
 * caller.
 */

export type ReportMessageActionResult =
  | { ok: true; alreadyReported: boolean }
  | { ok: false; reason: "VALIDATION" | "NOT_FOUND" | "NOT_AUTHORIZED" | "SELF_REPORT" | "UNAUTHENTICATED" };

export async function reportMessageAction(messageId: string, reason: string, detail?: string): Promise<ReportMessageActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, reason: "UNAUTHENTICATED" };

  const result = await createMessageReport(userId, { messageId, reason, detail });
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, alreadyReported: result.alreadyReported };
}

export type UpdateReportStatusActionResult = { ok: true } | { ok: false; reason: "NOT_AUTHORIZED" | "NOT_FOUND" | "ILLEGAL_TRANSITION" };

export async function updateMessageReportStatusAction(reportId: string, newStatus: MessageReportStatus): Promise<UpdateReportStatusActionResult> {
  const session = await auth();
  const user = session?.user;
  if (!user) return { ok: false, reason: "NOT_AUTHORIZED" };

  const permitted = await hasAdminPermission(user, "ADMIN_MESSAGE_REPORTS_MANAGE");
  if (!permitted) return { ok: false, reason: "NOT_AUTHORIZED" };

  const result = await updateMessageReportStatus(user.id, reportId, newStatus);
  return result;
}
