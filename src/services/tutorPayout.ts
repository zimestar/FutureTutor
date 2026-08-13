import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { TutoringMode, TutorTier } from "@/generated/prisma/enums";
import { roundMinorUnits, proRateCents, sumCents } from "@/lib/money";
import { pickHighestPriorityRule } from "@/lib/ruleResolution";
import { getUrgencyBand } from "@/lib/urgency";
import { getDistance } from "@/services/distance";

export const TUTOR_PAYOUT_VERSION = "TUTOR_PAYOUT_V1";

export class TutorPayoutRuleNotFoundError extends Error {}
export class NegativeSpreadError extends Error {}
export class TutorPayoutQuoteNotFoundError extends Error {}
export class TutorPayoutQuoteNotActiveError extends Error {}
export class TutorPayoutQuoteExpiredError extends Error {}
export class CustomerQuoteNotActiveError extends Error {}

export interface TutorPayoutContext {
  tutorProfileId: string;
  subjectId: string;
  academicLevelId?: string | null;
  tutoringMode: TutoringMode;
  durationMinutes: number;
  requestedStartAt: Date;
  distanceKm?: number | null;
}

export interface PayoutAdjustment {
  type: "URGENCY" | "TRAVEL";
  amountCents: number;
  reasonKey: string;
  ruleVersion: string;
  metadata?: Record<string, unknown>;
}

export interface TutorPayoutResult {
  basePayoutCents: number;
  basePayoutRuleId: string;
  basePayoutRuleVersion: string;
  tutorTierAtCalculation: TutorTier;
  adjustments: PayoutAdjustment[];
  adjustmentsTotalCents: number;
  totalPayoutCents: number;
  currency: string;
  payoutVersion: string;
  marketplaceConfigVersion: string;
  calculatedAt: Date;
}

async function loadSettings(tx: Prisma.TransactionClient) {
  const settings = await tx.marketplacePricingSettings.findFirst();
  if (!settings) throw new Error("MarketplacePricingSettings is not seeded — run prisma db seed");
  return settings;
}

/** Same coherent-snapshot pattern as customerPricing.ts — see that file. */
async function calculateWithinSnapshot(tx: Prisma.TransactionClient, context: TutorPayoutContext) {
  const now = new Date();
  const settings = await loadSettings(tx);

  const tutorProfile = await tx.tutorProfile.findUniqueOrThrow({
    where: { id: context.tutorProfileId },
    select: { payoutTier: true },
  });

  const candidates = await tx.tutorBasePayoutRule.findMany({
    where: {
      tutorTier: tutorProfile.payoutTier,
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
      AND: [
        { OR: [{ subjectId: context.subjectId }, { subjectId: null }] },
        { OR: [{ academicLevelId: context.academicLevelId ?? null }, { academicLevelId: null }] },
      ],
    },
  });
  const rule = pickHighestPriorityRule(candidates, context.subjectId, context.academicLevelId ?? null);
  if (!rule) {
    throw new TutorPayoutRuleNotFoundError(
      `No active TutorBasePayoutRule for tier=${tutorProfile.payoutTier} subject=${context.subjectId} level=${context.academicLevelId ?? "any"}`
    );
  }

  const basePayoutCents = proRateCents(rule.payoutCents, rule.baseDurationMinutes, context.durationMinutes);
  const adjustments: PayoutAdjustment[] = [];

  // Independent from the customer-side urgency amount — same band
  // classification, own configured dollar value (section 31's independence
  // rule, enforced structurally rather than by convention).
  const urgencyBand = getUrgencyBand(context.requestedStartAt, now, settings);
  if (urgencyBand === "SHORT_NOTICE" || urgencyBand === "URGENT") {
    adjustments.push({
      type: "URGENCY",
      amountCents: settings.tutorUrgencyBonusCents,
      reasonKey: "tutorUrgencyBonus",
      ruleVersion: settings.configVersion,
    });
  }

  const distance = getDistance({ approximateDistanceKm: context.distanceKm });
  if (context.tutoringMode === "IN_PERSON" && distance.distanceKm != null) {
    const travelCompensationCents = roundMinorUnits(distance.distanceKm * 80);
    adjustments.push({
      type: "TRAVEL",
      amountCents: travelCompensationCents,
      reasonKey: "travelCompensation",
      ruleVersion: settings.configVersion,
      metadata: { distanceKm: distance.distanceKm },
    });
  }

  const adjustmentsTotalCents = sumCents(...adjustments.map((a) => a.amountCents));
  const totalPayoutCents = sumCents(basePayoutCents, adjustmentsTotalCents);

  const result: TutorPayoutResult = {
    basePayoutCents,
    basePayoutRuleId: rule.id,
    basePayoutRuleVersion: rule.payoutVersion,
    tutorTierAtCalculation: tutorProfile.payoutTier,
    adjustments,
    adjustmentsTotalCents,
    totalPayoutCents,
    currency: rule.currency,
    payoutVersion: TUTOR_PAYOUT_VERSION,
    marketplaceConfigVersion: settings.configVersion,
    calculatedAt: now,
  };

  return { result, settings };
}

export async function calculateTutorPayout(context: TutorPayoutContext): Promise<TutorPayoutResult> {
  return db.$transaction(async (tx) => (await calculateWithinSnapshot(tx, context)).result, {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });
}

export async function createTutorPayoutQuote(context: TutorPayoutContext, customerPriceQuoteId: string) {
  return db.$transaction(
    async (tx) => {
      const customerQuote = await tx.customerPriceQuote.findUnique({ where: { id: customerPriceQuoteId } });
      if (!customerQuote || customerQuote.status !== "ACTIVE") {
        throw new CustomerQuoteNotActiveError();
      }

      const { result, settings } = await calculateWithinSnapshot(tx, context);

      // Gross-spread guardrail: never silently create an underwater quote.
      const grossSpreadCents = customerQuote.subtotalCents - result.totalPayoutCents;
      if (grossSpreadCents < settings.minimumGrossSpreadCents) {
        throw new NegativeSpreadError(
          `Payout ${result.totalPayoutCents} would leave a spread of ${grossSpreadCents}, below the configured minimum of ${settings.minimumGrossSpreadCents}`
        );
      }

      const expiresAt = new Date(result.calculatedAt.getTime() + settings.quoteTtlMinutes * 60 * 1000);

      return tx.tutorPayoutQuote.create({
        data: {
          tutorProfileId: context.tutorProfileId,
          customerPriceQuoteId,
          subjectId: context.subjectId,
          academicLevelId: context.academicLevelId ?? null,
          tutoringMode: context.tutoringMode,
          durationMinutes: context.durationMinutes,
          requestedStartAt: context.requestedStartAt,
          currency: result.currency,
          basePayoutCents: result.basePayoutCents,
          basePayoutRuleId: result.basePayoutRuleId,
          basePayoutRuleVersion: result.basePayoutRuleVersion,
          tutorTierAtCalculation: result.tutorTierAtCalculation,
          adjustmentsTotalCents: result.adjustmentsTotalCents,
          totalPayoutCents: result.totalPayoutCents,
          payoutVersion: result.payoutVersion,
          marketplaceConfigVersion: result.marketplaceConfigVersion,
          breakdown: result.adjustments as unknown as Prisma.InputJsonValue,
          status: "ACTIVE",
          expiresAt,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}

/**
 * Called from inside the booking-creation transaction, same pattern as
 * validateAndConsumeCustomerPriceQuote. Direct booking always goes
 * ACTIVE -> CONSUMED directly (no tutor-acceptance step exists in direct
 * booking) — ACCEPTED is reserved for the future Quick Match flow.
 */
export async function validateAndConsumeTutorPayoutQuote(
  tx: Prisma.TransactionClient,
  quoteId: string,
  tutorProfileId: string,
  customerPriceQuoteId: string
) {
  const quote = await tx.tutorPayoutQuote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new TutorPayoutQuoteNotFoundError();
  if (quote.tutorProfileId !== tutorProfileId) throw new TutorPayoutQuoteNotActiveError();
  if (quote.customerPriceQuoteId !== customerPriceQuoteId) throw new TutorPayoutQuoteNotActiveError();
  if (quote.status === "EXPIRED" || quote.expiresAt < new Date()) throw new TutorPayoutQuoteExpiredError();
  if (quote.status !== "ACTIVE") throw new TutorPayoutQuoteNotActiveError();

  await tx.tutorPayoutQuote.update({
    where: { id: quoteId },
    data: { status: "CONSUMED", consumedAt: new Date() },
  });

  return quote;
}
