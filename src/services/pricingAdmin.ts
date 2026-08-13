import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import type { CustomerBasePriceRuleInput, TutorBasePayoutRuleInput, MarketplacePricingSettingsInput } from "@/schemas/pricingAdmin";

/**
 * CustomerBasePriceRule/TutorBasePayoutRule are effectively immutable once
 * quoted against. "Editing" a never-used rule is a real in-place update;
 * editing a used one closes its effectiveUntil and creates a successor row
 * instead — preserving the exact configuration that produced every
 * historical quote. The admin UI always just says "Edit pricing"; this
 * branch is invisible plumbing, not a second workflow.
 */

export async function createCustomerBasePriceRule(input: CustomerBasePriceRuleInput, actorUserId: string) {
  const rule = await db.customerBasePriceRule.create({
    data: {
      subjectId: input.subjectId ?? null,
      academicLevelId: input.academicLevelId ?? null,
      baseDurationMinutes: input.baseDurationMinutes,
      basePriceCents: input.basePriceCents,
      currency: input.currency,
      pricingVersion: input.pricingVersion,
      effectiveFrom: new Date(),
    },
  });
  await writeAuditLog({
    actorUserId,
    action: "pricing.baseRule.created",
    entityType: "CustomerBasePriceRule",
    entityId: rule.id,
    metadata: { ...input },
  });
  return rule;
}

export async function editCustomerBasePriceRule(ruleId: string, input: CustomerBasePriceRuleInput, actorUserId: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.customerBasePriceRule.findUniqueOrThrow({ where: { id: ruleId } });
    const usageCount = await tx.customerPriceQuote.count({ where: { basePriceRuleId: ruleId } });

    const data = {
      subjectId: input.subjectId ?? null,
      academicLevelId: input.academicLevelId ?? null,
      baseDurationMinutes: input.baseDurationMinutes,
      basePriceCents: input.basePriceCents,
      currency: input.currency,
      pricingVersion: input.pricingVersion,
    };

    if (usageCount === 0) {
      const updated = await tx.customerBasePriceRule.update({ where: { id: ruleId }, data });
      await writeAuditLog(
        {
          actorUserId,
          action: "pricing.baseRule.updated",
          entityType: "CustomerBasePriceRule",
          entityId: ruleId,
          metadata: { previous: existing, next: data },
        },
        tx
      );
      return updated;
    }

    const now = new Date();
    await tx.customerBasePriceRule.update({ where: { id: ruleId }, data: { effectiveUntil: now } });
    const successor = await tx.customerBasePriceRule.create({ data: { ...data, effectiveFrom: now } });
    await writeAuditLog(
      {
        actorUserId,
        action: "pricing.baseRule.superseded",
        entityType: "CustomerBasePriceRule",
        entityId: ruleId,
        metadata: { successorId: successor.id },
      },
      tx
    );
    await writeAuditLog(
      {
        actorUserId,
        action: "pricing.baseRule.created",
        entityType: "CustomerBasePriceRule",
        entityId: successor.id,
        metadata: { supersedes: ruleId, ...data },
      },
      tx
    );
    return successor;
  });
}

export async function setCustomerBasePriceRuleActive(ruleId: string, isActive: boolean, actorUserId: string) {
  const updated = await db.customerBasePriceRule.update({ where: { id: ruleId }, data: { isActive } });
  await writeAuditLog({
    actorUserId,
    action: isActive ? "pricing.baseRule.activated" : "pricing.baseRule.deactivated",
    entityType: "CustomerBasePriceRule",
    entityId: ruleId,
  });
  return updated;
}

export async function createTutorBasePayoutRule(input: TutorBasePayoutRuleInput, actorUserId: string) {
  const rule = await db.tutorBasePayoutRule.create({
    data: {
      tutorTier: input.tutorTier,
      subjectId: input.subjectId ?? null,
      academicLevelId: input.academicLevelId ?? null,
      baseDurationMinutes: input.baseDurationMinutes,
      payoutCents: input.payoutCents,
      currency: input.currency,
      payoutVersion: input.payoutVersion,
      effectiveFrom: new Date(),
    },
  });
  await writeAuditLog({
    actorUserId,
    action: "pricing.payoutRule.created",
    entityType: "TutorBasePayoutRule",
    entityId: rule.id,
    metadata: { ...input },
  });
  return rule;
}

export async function editTutorBasePayoutRule(ruleId: string, input: TutorBasePayoutRuleInput, actorUserId: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.tutorBasePayoutRule.findUniqueOrThrow({ where: { id: ruleId } });
    const usageCount = await tx.tutorPayoutQuote.count({ where: { basePayoutRuleId: ruleId } });

    const data = {
      tutorTier: input.tutorTier,
      subjectId: input.subjectId ?? null,
      academicLevelId: input.academicLevelId ?? null,
      baseDurationMinutes: input.baseDurationMinutes,
      payoutCents: input.payoutCents,
      currency: input.currency,
      payoutVersion: input.payoutVersion,
    };

    if (usageCount === 0) {
      const updated = await tx.tutorBasePayoutRule.update({ where: { id: ruleId }, data });
      await writeAuditLog(
        {
          actorUserId,
          action: "pricing.payoutRule.updated",
          entityType: "TutorBasePayoutRule",
          entityId: ruleId,
          metadata: { previous: existing, next: data },
        },
        tx
      );
      return updated;
    }

    const now = new Date();
    await tx.tutorBasePayoutRule.update({ where: { id: ruleId }, data: { effectiveUntil: now } });
    const successor = await tx.tutorBasePayoutRule.create({ data: { ...data, effectiveFrom: now } });
    await writeAuditLog(
      {
        actorUserId,
        action: "pricing.payoutRule.superseded",
        entityType: "TutorBasePayoutRule",
        entityId: ruleId,
        metadata: { successorId: successor.id },
      },
      tx
    );
    await writeAuditLog(
      {
        actorUserId,
        action: "pricing.payoutRule.created",
        entityType: "TutorBasePayoutRule",
        entityId: successor.id,
        metadata: { supersedes: ruleId, ...data },
      },
      tx
    );
    return successor;
  });
}

export async function setTutorBasePayoutRuleActive(ruleId: string, isActive: boolean, actorUserId: string) {
  const updated = await db.tutorBasePayoutRule.update({ where: { id: ruleId }, data: { isActive } });
  await writeAuditLog({
    actorUserId,
    action: isActive ? "pricing.payoutRule.activated" : "pricing.payoutRule.deactivated",
    entityType: "TutorBasePayoutRule",
    entityId: ruleId,
  });
  return updated;
}

export async function updateMarketplacePricingSettings(input: MarketplacePricingSettingsInput, actorUserId: string) {
  const existing = await db.marketplacePricingSettings.findFirst();
  if (!existing) throw new Error("MarketplacePricingSettings is not seeded — run prisma db seed");

  const updated = await db.marketplacePricingSettings.update({
    where: { id: existing.id },
    data: { ...input, updatedByUserId: actorUserId },
  });
  await writeAuditLog({
    actorUserId,
    action: "pricing.settings.updated",
    entityType: "MarketplacePricingSettings",
    entityId: existing.id,
    metadata: { previous: existing, next: input },
  });
  return updated;
}
