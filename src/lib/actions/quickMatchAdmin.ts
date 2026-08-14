"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { tutorRankingSettingsSchema } from "@/schemas/quickMatchAdmin";

export type QuickMatchAdminActionState = { error?: string; success?: boolean } | undefined;

async function requireAdmin() {
  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

export async function saveTutorRankingSettingsAction(
  _prevState: QuickMatchAdminActionState,
  formData: FormData
): Promise<QuickMatchAdminActionState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Unauthorized" };

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
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const existing = await db.tutorRankingSettings.findFirst();
  if (!existing) return { error: "TutorRankingSettings is not seeded" };

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
