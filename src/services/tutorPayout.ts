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
export class TutorPayoutQuoteAlreadyAcceptedError extends Error {}

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

/**
 * Shared body, callable either with the module's own fresh RepeatableRead
 * transaction (createTutorPayoutQuote, below — direct booking's call site)
 * or with a caller-supplied tx (createTutorPayoutQuoteWithTx — Quick
 * Match's dispatch loop, which needs this to run inside its own outer
 * Serializable transaction so ranking-read, invitation-create, and
 * payout-quote-create all commit atomically together). Serializable is a
 * strictly stronger isolation level than RepeatableRead in Postgres, so
 * running this coherent-snapshot logic inside a Serializable transaction is
 * still safe.
 */
async function createTutorPayoutQuoteInTx(
  tx: Prisma.TransactionClient,
  context: TutorPayoutContext,
  customerPriceQuoteId: string
) {
  const customerQuote = await tx.customerPriceQuote.findUnique({ where: { id: customerPriceQuoteId } });
  // Direct booking calls this while the customer quote is still ACTIVE.
  // Quick Match calls this while dispatching a candidate — by that point
  // the customer quote has already been locked at request confirmation
  // (see customerPricing.ts's lockCustomerPriceQuote), so LOCKED is
  // equally valid here; the guardrail below only needs subtotalCents,
  // which doesn't change between ACTIVE and LOCKED.
  if (!customerQuote || (customerQuote.status !== "ACTIVE" && customerQuote.status !== "LOCKED")) {
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
}

export async function createTutorPayoutQuote(context: TutorPayoutContext, customerPriceQuoteId: string) {
  return db.$transaction((tx) => createTutorPayoutQuoteInTx(tx, context, customerPriceQuoteId), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });
}

/** Quick Match only — see createTutorPayoutQuoteInTx's doc comment above. */
export async function createTutorPayoutQuoteWithTx(
  tx: Prisma.TransactionClient,
  context: TutorPayoutContext,
  customerPriceQuoteId: string
) {
  return createTutorPayoutQuoteInTx(tx, context, customerPriceQuoteId);
}

/**
 * Called from inside the booking-creation transaction, same pattern as
 * validateAndConsumeCustomerPriceQuote. Direct booking goes ACTIVE ->
 * CONSUMED directly (no tutor-acceptance step exists in direct booking).
 * Quick Match goes ACTIVE -> ACCEPTED (via acceptTutorPayoutQuote below,
 * called first when the tutor clicks Accept) -> CONSUMED (this function,
 * called moments later in the same transaction once the Booking is actually
 * created) — one consumption code path handles both shapes.
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
  if (quote.status === "ACTIVE") {
    if (quote.expiresAt < new Date()) throw new TutorPayoutQuoteExpiredError();
  } else if (quote.status !== "ACCEPTED") {
    throw new TutorPayoutQuoteNotActiveError();
  }

  await tx.tutorPayoutQuote.update({
    where: { id: quoteId },
    data: { status: "CONSUMED", consumedAt: new Date() },
  });

  return quote;
}

/**
 * Quick Match only — records the tutor's acceptance of an offered payout as
 * its own event, distinct from consumption (see TutorPayoutQuoteStatus
 * schema comment). Called first inside the accept-invitation transaction;
 * validateAndConsumeTutorPayoutQuote is called moments later in the same
 * transaction once the Booking actually exists.
 */
export async function acceptTutorPayoutQuote(tx: Prisma.TransactionClient, quoteId: string, tutorProfileId: string) {
  const quote = await tx.tutorPayoutQuote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new TutorPayoutQuoteNotFoundError();
  if (quote.tutorProfileId !== tutorProfileId) throw new TutorPayoutQuoteNotActiveError();
  if (quote.status === "ACTIVE" && quote.expiresAt < new Date()) throw new TutorPayoutQuoteExpiredError();
  if (quote.status !== "ACTIVE") throw new TutorPayoutQuoteAlreadyAcceptedError();

  return tx.tutorPayoutQuote.update({
    where: { id: quoteId },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
}

/**
 * Quick Match only — the losing-candidate side of the payout-quote
 * lifecycle: this specific tutor did not end up booked (declined, timed
 * out, or lost a race to another candidate/request — see
 * bookingCreation.ts's hasOverlappingActiveBooking). Only transitions a
 * still-ACTIVE/ACCEPTED quote, same idempotent-updateMany-guard pattern as
 * cancelLockedCustomerPriceQuote.
 */
export async function cancelTutorPayoutQuote(tx: Prisma.TransactionClient, quoteId: string) {
  await tx.tutorPayoutQuote.updateMany({
    where: { id: quoteId, status: { in: ["ACTIVE", "ACCEPTED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}
