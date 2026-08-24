"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import {
  customerBasePriceRuleSchema,
  tutorBasePayoutRuleSchema,
  marketplacePricingSettingsSchema,
} from "@/schemas/pricingAdmin";
import {
  createCustomerBasePriceRule,
  editCustomerBasePriceRule,
  setCustomerBasePriceRuleActive,
  createTutorBasePayoutRule,
  editTutorBasePayoutRule,
  setTutorBasePayoutRuleActive,
  updateMarketplacePricingSettings,
} from "@/services/pricingAdmin";

export type PricingAdminActionState = { error?: string; success?: boolean } | undefined;

async function requireAdmin() {
  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

function readRuleFormData(formData: FormData) {
  const subjectId = formData.get("subjectId");
  const academicLevelId = formData.get("academicLevelId");
  return {
    subjectId: typeof subjectId === "string" && subjectId ? subjectId : undefined,
    academicLevelId: typeof academicLevelId === "string" && academicLevelId ? academicLevelId : undefined,
    baseDurationMinutes: formData.get("baseDurationMinutes"),
    currency: formData.get("currency") || "CAD",
  };
}

export async function saveCustomerBasePriceRuleAction(
  ruleId: string | null,
  _prevState: PricingAdminActionState,
  formData: FormData
): Promise<PricingAdminActionState> {
  const t = await getTranslations("admin.shared");
  const admin = await requireAdmin();
  if (!admin) return { error: t("errorDescription") };

  const parsed = customerBasePriceRuleSchema.safeParse({
    ...readRuleFormData(formData),
    basePriceCents: formData.get("basePriceCents"),
    pricingVersion: formData.get("pricingVersion") || "CUSTOMER_PRICING_V1",
  });
  if (!parsed.success) return { error: t("errorDescription") };

  try {
    if (ruleId) {
      await editCustomerBasePriceRule(ruleId, parsed.data, admin.id);
    } else {
      await createCustomerBasePriceRule(parsed.data, admin.id);
    }
  } catch {
    return { error: t("errorDescription") };
  }

  revalidatePath("/admin/pricing");
  return { success: true };
}

export async function setCustomerBasePriceRuleActiveAction(ruleId: string, isActive: boolean) {
  const admin = await requireAdmin();
  if (!admin) return;
  await setCustomerBasePriceRuleActive(ruleId, isActive, admin.id);
  revalidatePath("/admin/pricing");
}

export async function saveTutorBasePayoutRuleAction(
  ruleId: string | null,
  _prevState: PricingAdminActionState,
  formData: FormData
): Promise<PricingAdminActionState> {
  const t = await getTranslations("admin.shared");
  const admin = await requireAdmin();
  if (!admin) return { error: t("errorDescription") };

  const parsed = tutorBasePayoutRuleSchema.safeParse({
    ...readRuleFormData(formData),
    tutorTier: formData.get("tutorTier"),
    payoutCents: formData.get("payoutCents"),
    payoutVersion: formData.get("payoutVersion") || "TUTOR_PAYOUT_V1",
  });
  if (!parsed.success) return { error: t("errorDescription") };

  try {
    if (ruleId) {
      await editTutorBasePayoutRule(ruleId, parsed.data, admin.id);
    } else {
      await createTutorBasePayoutRule(parsed.data, admin.id);
    }
  } catch {
    return { error: t("errorDescription") };
  }

  revalidatePath("/admin/pricing");
  return { success: true };
}

export async function setTutorBasePayoutRuleActiveAction(ruleId: string, isActive: boolean) {
  const admin = await requireAdmin();
  if (!admin) return;
  await setTutorBasePayoutRuleActive(ruleId, isActive, admin.id);
  revalidatePath("/admin/pricing");
}

export async function saveMarketplacePricingSettingsAction(
  _prevState: PricingAdminActionState,
  formData: FormData
): Promise<PricingAdminActionState> {
  const t = await getTranslations("admin.shared");
  const admin = await requireAdmin();
  if (!admin) return { error: t("errorDescription") };

  const parsed = marketplacePricingSettingsSchema.safeParse({
    quoteTtlMinutes: formData.get("quoteTtlMinutes"),
    urgencyShortNoticeThresholdHours: formData.get("urgencyShortNoticeThresholdHours"),
    urgencyShortNoticeAmountCents: formData.get("urgencyShortNoticeAmountCents"),
    urgencyUrgentThresholdHours: formData.get("urgencyUrgentThresholdHours"),
    urgencyUrgentAmountCents: formData.get("urgencyUrgentAmountCents"),
    lowSupplyThresholdCount: formData.get("lowSupplyThresholdCount"),
    lowSupplyAmountCents: formData.get("lowSupplyAmountCents"),
    tutorUrgencyBonusCents: formData.get("tutorUrgencyBonusCents"),
    minimumGrossSpreadCents: formData.get("minimumGrossSpreadCents"),
    configVersion: formData.get("configVersion") || "MARKETPLACE_SETTINGS_V1",
  });
  if (!parsed.success) return { error: t("errorDescription") };

  try {
    await updateMarketplacePricingSettings(parsed.data, admin.id);
  } catch {
    return { error: t("errorDescription") };
  }

  revalidatePath("/admin/pricing");
  return { success: true };
}

export async function setTutorPayoutTierAction(tutorProfileId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const tier = formData.get("payoutTier");
  if (typeof tier !== "string" || !["NEW", "VERIFIED", "SENIOR", "ELITE"].includes(tier)) return;

  await db.tutorProfile.update({
    where: { id: tutorProfileId },
    data: { payoutTier: tier as "NEW" | "VERIFIED" | "SENIOR" | "ELITE" },
  });
  await writeAuditLog({
    actorUserId: admin.id,
    action: "tutor.payoutTier.changed",
    entityType: "TutorProfile",
    entityId: tutorProfileId,
    metadata: { payoutTier: tier },
  });
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
}
