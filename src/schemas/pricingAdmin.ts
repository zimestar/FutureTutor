import { z } from "zod";

const scopeRefinement = <T extends { subjectId?: string; academicLevelId?: string }>(data: T) =>
  !(data.subjectId === undefined && data.academicLevelId !== undefined);

const scopeRefinementMessage = {
  message: "A level-only rule (no subject) isn't supported — choose a subject, or leave both blank for a platform-wide fallback.",
  path: ["academicLevelId"],
};

export const customerBasePriceRuleSchema = z
  .object({
    subjectId: z.string().min(1).optional(),
    academicLevelId: z.string().min(1).optional(),
    baseDurationMinutes: z.coerce.number().int().positive(),
    basePriceCents: z.coerce.number().int().positive(),
    currency: z.string().length(3).default("CAD"),
    pricingVersion: z.string().min(1),
  })
  .refine(scopeRefinement, scopeRefinementMessage);

export type CustomerBasePriceRuleInput = z.infer<typeof customerBasePriceRuleSchema>;

const tutorTierValues = ["NEW", "VERIFIED", "SENIOR", "ELITE"] as const;

export const tutorBasePayoutRuleSchema = z
  .object({
    tutorTier: z.enum(tutorTierValues),
    subjectId: z.string().min(1).optional(),
    academicLevelId: z.string().min(1).optional(),
    baseDurationMinutes: z.coerce.number().int().positive(),
    payoutCents: z.coerce.number().int().positive(),
    currency: z.string().length(3).default("CAD"),
    payoutVersion: z.string().min(1),
  })
  .refine(scopeRefinement, scopeRefinementMessage);

export type TutorBasePayoutRuleInput = z.infer<typeof tutorBasePayoutRuleSchema>;

export const marketplacePricingSettingsSchema = z.object({
  quoteTtlMinutes: z.coerce.number().int().positive(),
  urgencyShortNoticeThresholdHours: z.coerce.number().int().nonnegative(),
  urgencyShortNoticeAmountCents: z.coerce.number().int().nonnegative(),
  urgencyUrgentThresholdHours: z.coerce.number().int().nonnegative(),
  urgencyUrgentAmountCents: z.coerce.number().int().nonnegative(),
  lowSupplyThresholdCount: z.coerce.number().int().nonnegative(),
  lowSupplyAmountCents: z.coerce.number().int().nonnegative(),
  tutorUrgencyBonusCents: z.coerce.number().int().nonnegative(),
  minimumGrossSpreadCents: z.coerce.number().int(),
  configVersion: z.string().min(1),
});

export type MarketplacePricingSettingsInput = z.infer<typeof marketplacePricingSettingsSchema>;
