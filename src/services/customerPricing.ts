import { createHash } from "crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { TutoringMode } from "@/generated/prisma/enums";
import { roundMinorUnits, proRateCents, sumCents } from "@/lib/money";
import { pickHighestPriorityRule } from "@/lib/ruleResolution";
import { getUrgencyBand } from "@/lib/urgency";
import { getSupplySignal } from "@/services/marketplaceSupply";
import { calculateTax } from "@/services/tax";
import { getDistance } from "@/services/distance";

export const CUSTOMER_PRICING_VERSION = "CUSTOMER_PRICING_V1";

export class PricingRuleNotFoundError extends Error {}
export class QuoteNotFoundError extends Error {}
export class QuoteNotOwnedError extends Error {}
export class QuoteExpiredError extends Error {}
export class QuoteAlreadyConsumedError extends Error {}
export class QuoteNotActiveError extends Error {}
export class QuoteContextMismatchError extends Error {}
export class QuoteAlreadyLockedError extends Error {}

/** What the pure calculation actually needs — no identity fields, since a
 *  non-persisted preview (e.g. a `/find-tutors` "from $X" estimate) has no
 *  quote owner to record. */
export interface CustomerPriceCalculationInput {
  subjectId: string;
  academicLevelId?: string | null;
  tutoringMode: TutoringMode;
  durationMinutes: number;
  requestedStartAt: Date;
  distanceKm?: number | null;
}

/** Adds the quote-ownership fields required only when persisting a real quote. */
export interface CustomerPricingContext extends CustomerPriceCalculationInput {
  createdByUserId: string;
  studentProfileId: string;
}

export interface PriceAdjustment {
  type: "URGENCY" | "LOW_SUPPLY" | "TRAVEL";
  amountCents: number;
  reasonKey: string;
  ruleVersion: string;
  metadata?: Record<string, unknown>;
}

export interface CustomerPriceResult {
  basePriceCents: number;
  basePriceRuleId: string;
  basePriceRuleVersion: string;
  adjustments: PriceAdjustment[];
  adjustmentsTotalCents: number;
  subtotalCents: number;
  taxCents: number;
  taxConfigured: boolean;
  totalCents: number;
  currency: string;
  pricingVersion: string;
  marketplaceConfigVersion: string;
  calculatedAt: Date;
}

interface QuoteContextFingerprint {
  subjectId: string;
  academicLevelId?: string | null;
  tutoringMode: TutoringMode;
  durationMinutes: number;
  requestedStartAt: Date;
}

function computeContextHash(input: QuoteContextFingerprint): string {
  const raw = [
    input.subjectId,
    input.academicLevelId ?? "",
    input.tutoringMode,
    input.durationMinutes,
    input.requestedStartAt.toISOString(),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

async function loadSettings(tx: Prisma.TransactionClient) {
  const settings = await tx.marketplacePricingSettings.findFirst();
  if (!settings) throw new Error("MarketplacePricingSettings is not seeded — run prisma db seed");
  return settings;
}

/**
 * The entire read phase (matched rule + settings + supply signal) happens
 * inside one RepeatableRead transaction so nothing can straddle an admin's
 * mid-calculation configuration change — see the Phase E plan's "coherent
 * configuration snapshot" section.
 */
async function calculateWithinSnapshot(tx: Prisma.TransactionClient, context: CustomerPriceCalculationInput) {
  const now = new Date();
  const settings = await loadSettings(tx);

  const candidates = await tx.customerBasePriceRule.findMany({
    where: {
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
    throw new PricingRuleNotFoundError(
      `No active CustomerBasePriceRule for subject=${context.subjectId} level=${context.academicLevelId ?? "any"}`
    );
  }

  const basePriceCents = proRateCents(rule.basePriceCents, rule.baseDurationMinutes, context.durationMinutes);
  const adjustments: PriceAdjustment[] = [];

  const urgencyBand = getUrgencyBand(context.requestedStartAt, now, settings);
  if (urgencyBand === "SHORT_NOTICE") {
    adjustments.push({
      type: "URGENCY",
      amountCents: settings.urgencyShortNoticeAmountCents,
      reasonKey: "urgencyShortNotice",
      ruleVersion: settings.configVersion,
    });
  } else if (urgencyBand === "URGENT") {
    adjustments.push({
      type: "URGENCY",
      amountCents: settings.urgencyUrgentAmountCents,
      reasonKey: "urgencyUrgent",
      ruleVersion: settings.configVersion,
    });
  }

  const supply = await getSupplySignal(
    tx,
    { subjectId: context.subjectId, academicLevelId: context.academicLevelId, mode: context.tutoringMode },
    settings.lowSupplyThresholdCount
  );
  if (supply.scarcityBand === "LOW") {
    adjustments.push({
      type: "LOW_SUPPLY",
      amountCents: settings.lowSupplyAmountCents,
      reasonKey: "lowSupply",
      ruleVersion: settings.configVersion,
      metadata: { qualifiedTutorCount: supply.qualifiedTutorCount },
    });
  }

  const distance = getDistance({ approximateDistanceKm: context.distanceKm });
  if (context.tutoringMode === "IN_PERSON" && distance.distanceKm != null) {
    const travelAmountCents = roundMinorUnits(distance.distanceKm * 100);
    adjustments.push({
      type: "TRAVEL",
      amountCents: travelAmountCents,
      reasonKey: "travel",
      ruleVersion: settings.configVersion,
      metadata: { distanceKm: distance.distanceKm },
    });
  }

  const adjustmentsTotalCents = sumCents(...adjustments.map((a) => a.amountCents));
  const subtotalCents = sumCents(basePriceCents, adjustmentsTotalCents);
  const tax = calculateTax({}, subtotalCents);
  const totalCents = sumCents(subtotalCents, tax.taxCents);

  const result: CustomerPriceResult = {
    basePriceCents,
    basePriceRuleId: rule.id,
    basePriceRuleVersion: rule.pricingVersion,
    adjustments,
    adjustmentsTotalCents,
    subtotalCents,
    taxCents: tax.taxCents,
    taxConfigured: tax.configured,
    totalCents,
    currency: rule.currency,
    pricingVersion: CUSTOMER_PRICING_VERSION,
    marketplaceConfigVersion: settings.configVersion,
    calculatedAt: now,
  };

  return { result, ruleId: rule.id, settings };
}

/** Pure calculation, no persistence — used for search-page price previews. */
export async function calculateCustomerPrice(context: CustomerPriceCalculationInput): Promise<CustomerPriceResult> {
  return db.$transaction(async (tx) => (await calculateWithinSnapshot(tx, context)).result, {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });
}

export async function createCustomerPriceQuote(context: CustomerPricingContext) {
  return db.$transaction(
    async (tx) => {
      const { result, settings } = await calculateWithinSnapshot(tx, context);
      const expiresAt = new Date(result.calculatedAt.getTime() + settings.quoteTtlMinutes * 60 * 1000);
      const contextHash = computeContextHash(context);

      return tx.customerPriceQuote.create({
        data: {
          createdByUserId: context.createdByUserId,
          studentProfileId: context.studentProfileId,
          subjectId: context.subjectId,
          academicLevelId: context.academicLevelId ?? null,
          tutoringMode: context.tutoringMode,
          durationMinutes: context.durationMinutes,
          requestedStartAt: context.requestedStartAt,
          currency: result.currency,
          basePriceCents: result.basePriceCents,
          basePriceRuleId: result.basePriceRuleId,
          basePriceRuleVersion: result.basePriceRuleVersion,
          adjustmentsTotalCents: result.adjustmentsTotalCents,
          subtotalCents: result.subtotalCents,
          taxCents: result.taxCents,
          taxConfigured: result.taxConfigured,
          totalCents: result.totalCents,
          pricingVersion: result.pricingVersion,
          marketplaceConfigVersion: result.marketplaceConfigVersion,
          contextHash,
          breakdown: result.adjustments as unknown as Prisma.InputJsonValue,
          contextSnapshot: {
            ...context,
            requestedStartAt: context.requestedStartAt.toISOString(),
          } as unknown as Prisma.InputJsonValue,
          status: "ACTIVE",
          expiresAt,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}

/**
 * Called from *inside* the booking-creation transaction (see
 * bookingCreation.ts) — takes that transaction's client rather than opening
 * its own, so quote consumption and Booking creation are atomic together.
 *
 * Handles both quote-lifecycle shapes: direct booking's ACTIVE -> CONSUMED
 * (expiresAt still governs validity) and Quick Match's LOCKED -> CONSUMED
 * (expiresAt is never consulted once LOCKED — see the CustomerQuoteStatus.
 * LOCKED schema comment; only the caller's own TutoringRequest-status guard
 * governs validity at that point). One function, not two, so there is a
 * single authoritative consumption code path either way.
 */
export async function validateAndConsumeCustomerPriceQuote(
  tx: Prisma.TransactionClient,
  quoteId: string,
  userId: string,
  expectedContext: QuoteContextFingerprint
) {
  const quote = await tx.customerPriceQuote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new QuoteNotFoundError();
  if (quote.createdByUserId !== userId) throw new QuoteNotOwnedError();
  if (quote.status === "CONSUMED") throw new QuoteAlreadyConsumedError();
  if (quote.status === "CANCELLED") throw new QuoteNotActiveError();
  if (quote.status === "EXPIRED") throw new QuoteExpiredError();
  if (quote.status === "ACTIVE") {
    if (quote.expiresAt < new Date()) throw new QuoteExpiredError();
  } else if (quote.status !== "LOCKED") {
    throw new QuoteNotActiveError();
  }

  const expectedHash = computeContextHash(expectedContext);
  if (expectedHash !== quote.contextHash) throw new QuoteContextMismatchError();

  await tx.customerPriceQuote.update({
    where: { id: quoteId },
    data: { status: "CONSUMED", consumedAt: new Date() },
  });

  return quote;
}

/**
 * Quick Match only — moves ACTIVE -> LOCKED at the moment a student confirms
 * a TutoringRequest, before matching begins. From this point the quote's
 * values are immutable and expiresAt is retired (see the schema comment);
 * only the parent TutoringRequest's own lifecycle governs whether this quote
 * may still reach CONSUMED (booked) or CANCELLED (matching ended without a
 * booking). Called inside the same transaction that transitions the request
 * PRICED -> CONFIRMED.
 */
export async function lockCustomerPriceQuote(
  tx: Prisma.TransactionClient,
  quoteId: string,
  userId: string,
  expectedContext: QuoteContextFingerprint
) {
  const quote = await tx.customerPriceQuote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new QuoteNotFoundError();
  if (quote.createdByUserId !== userId) throw new QuoteNotOwnedError();
  if (quote.status === "LOCKED" || quote.status === "CONSUMED") throw new QuoteAlreadyLockedError();
  if (quote.status === "CANCELLED") throw new QuoteNotActiveError();
  if (quote.status === "EXPIRED" || quote.expiresAt < new Date()) throw new QuoteExpiredError();
  if (quote.status !== "ACTIVE") throw new QuoteNotActiveError();

  const expectedHash = computeContextHash(expectedContext);
  if (expectedHash !== quote.contextHash) throw new QuoteContextMismatchError();

  return tx.customerPriceQuote.update({
    where: { id: quoteId },
    data: { status: "LOCKED", lockedAt: new Date() },
  });
}

/**
 * Quick Match only — the losing/failed-match side of the LOCKED quote
 * lifecycle: matching ended (NO_TUTOR_FOUND, student cancellation, or a
 * dispatch failure) without ever producing a Booking. Only transitions a
 * still-LOCKED quote — a concurrently-CONSUMED quote (a tutor accepted just
 * before this ran) is left untouched by the updateMany's WHERE guard, so
 * this can never overwrite a real booking's financial snapshot.
 */
export async function cancelLockedCustomerPriceQuote(tx: Prisma.TransactionClient, quoteId: string) {
  await tx.customerPriceQuote.updateMany({
    where: { id: quoteId, status: "LOCKED" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

/**
 * Quick Match only — a student abandons/cancels a TutoringRequest before
 * ever confirming it (still ACTIVE, never LOCKED). Same idempotent-guard
 * shape as cancelLockedCustomerPriceQuote, just for the earlier state.
 */
export async function cancelActiveCustomerPriceQuote(tx: Prisma.TransactionClient, quoteId: string) {
  await tx.customerPriceQuote.updateMany({
    where: { id: quoteId, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}
