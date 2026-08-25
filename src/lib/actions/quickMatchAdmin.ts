"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { requireAdminPermission } from "@/services/adminPermissions";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { tutorRankingSettingsSchema } from "@/schemas/quickMatchAdmin";

export type QuickMatchAdminActionState = { error?: string; success?: boolean } | undefined;

async function requireAdmin() {
  const session = await auth();
  try { return await requireAdminPermission(session, "ADMIN_QUICKMATCH_MANAGE"); } catch { return null; }
}

export async function saveTutorRankingSettingsAction(
  _prevState: QuickMatchAdminActionState,
  formData: FormData
): Promise<QuickMatchAdminActionState> {
  const t = await getTranslations("admin.shared");
  const admin = await requireAdmin();
  if (!admin) return { error: t("errorDescription") };

  const parsed = tutorRankingSettingsSchema.safeParse({
    responseWindowMinutes: formData.get("responseWindowMinutes"),
    sequentialInvitationCount: formData.get("sequentialInvitationCount"),
    parallelBatchSize: formData.get("parallelBatchSize"),
    maxDispatchAttempts: formData.get("maxDispatchAttempts"),
    tutorScoreWeight: formData.get("tutorScoreWeight"),
    bookingReliabilityWeight: formData.get("bookingReliabilityWeight"),
    invitationResponsivenessWeight: formData.get("invitationResponsivenessWeight"),
    tutorTierWeight: formData.get("tutorTierWeight"),
    minInvitationsForReliabilityData: formData.get("minInvitationsForReliabilityData"),
    rankingVersion: formData.get("rankingVersion") || "QUICK_MATCH_RANKING_V1",
  });
  if (!parsed.success) return { error: t("errorDescription") };

  const existing = await db.tutorRankingSettings.findFirst();
  if (!existing) return { error: t("errorDescription") };

  await db.tutorRankingSettings.update({
    where: { id: existing.id },
    data: { ...parsed.data, updatedByUserId: admin.id },
  });

  await writeAuditLog({
    actorUserId: admin.id,
    action: "quickmatch.settings.updated",
    entityType: "TutorRankingSettings",
    entityId: existing.id,
    metadata: { previous: existing, next: parsed.data },
  });

  revalidatePath("/admin/quick-match");
  return { success: true };
}
