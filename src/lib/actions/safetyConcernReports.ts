"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { checkActionRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import { requireAdminPermission } from "@/services/adminPermissions";
import { createSafetyConcernReport, updateSafetyConcernReport } from "@/services/safetyConcernReports";

export type SafetyConcernActionState = { error?: string; reportId?: string } | undefined;

/** SAFETY-REPORTS1 — any signed-in user files a safety concern. */
export async function submitSafetyConcernAction(
  _prevState: SafetyConcernActionState,
  formData: FormData
): Promise<SafetyConcernActionState> {
  const t = await getTranslations("safetyReport.errors");
  const session = await auth();
  if (!session?.user?.id) return { error: t("signedOut") };

  const rateLimit = await checkActionRateLimit({
    action: "safetyConcernReport",
    identifier: session.user.id,
    ip: getClientIp(await headers()),
    identifierLimit: RATE_LIMITS.safetyConcernByUser,
    ipLimit: RATE_LIMITS.safetyConcernByIp,
  });
  if (!rateLimit.allowed) return { error: t("tooManyReports") };

  const result = await createSafetyConcernReport(session.user.id, {
    category: String(formData.get("category") ?? "") as never,
    immediateDanger: formData.get("immediateDanger") === "on",
    concerning: String(formData.get("concerning") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (!result.ok) return { error: result.reason === "VALIDATION" ? t("invalidInput") : t("accountInactive") };
  return { reportId: result.reportId };
}

/** SAFETY-REPORTS1 — status change from the admin detail page. */
export async function updateSafetyConcernStatusAction(reportId: string, formData: FormData) {
  const admin = await requireAdminPermission(await auth(), "ADMIN_SAFETY_REPORTS");
  await updateSafetyConcernReport(admin.id, reportId, {
    status: String(formData.get("status") ?? ""),
    resolutionNote: String(formData.get("resolutionNote") ?? ""),
  });
  revalidatePath(`/admin/safety-reports/${reportId}`);
  revalidatePath("/admin/safety-reports");
}
