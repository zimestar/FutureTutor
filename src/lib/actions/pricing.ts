"use server";

import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canActForStudent } from "@/lib/authorization.server";
import { createPriceQuoteSchema } from "@/schemas/pricing";
import { createCustomerPriceQuote, PricingRuleNotFoundError, type PriceAdjustment } from "@/services/customerPricing";
import { createTutorPayoutQuote, TutorPayoutRuleNotFoundError, NegativeSpreadError } from "@/services/tutorPayout";

const SESSION_DURATION_MINUTES = 60;

export type PriceQuoteResult =
  | {
      success: true;
      customerPriceQuoteId: string;
      tutorPayoutQuoteId: string;
      basePriceCents: number;
      adjustments: PriceAdjustment[];
      subtotalCents: number;
      taxCents: number;
      taxConfigured: boolean;
      totalCents: number;
      currency: string;
      expiresAt: string;
    }
  | { success: false; error: string };

export async function createPriceQuoteAction(input: {
  tutorProfileId: string;
  subjectId: string;
  academicLevelId?: string;
  startAt: string;
}): Promise<PriceQuoteResult> {
  const t = await getTranslations("booking.errors");

  const session = await auth();
  if (!session?.user || session.user.role !== "STUDENT") {
    return { success: false, error: t("notAStudent") };
  }

  const parsed = createPriceQuoteSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: t("invalidInput") };

  const studentProfile = await db.studentProfile.findUnique({ where: { userId: session.user.id } });
  if (!studentProfile) return { success: false, error: t("invalidInput") };

  const authorized = await canActForStudent(session.user.id, studentProfile.id);
  if (!authorized) return { success: false, error: t("notAStudent") };

  const tutorProfile = await db.tutorProfile.findUnique({ where: { id: parsed.data.tutorProfileId } });
  if (!tutorProfile) return { success: false, error: t("invalidInput") };

  try {
    const customerQuote = await createCustomerPriceQuote({
      createdByUserId: session.user.id,
      studentProfileId: studentProfile.id,
      subjectId: parsed.data.subjectId,
      academicLevelId: parsed.data.academicLevelId ?? null,
      tutoringMode: tutorProfile.learningMode ?? "BOTH",
      durationMinutes: SESSION_DURATION_MINUTES,
      requestedStartAt: parsed.data.startAt,
    });

    const payoutQuote = await createTutorPayoutQuote(
      {
        tutorProfileId: tutorProfile.id,
        subjectId: parsed.data.subjectId,
        academicLevelId: parsed.data.academicLevelId ?? null,
        tutoringMode: tutorProfile.learningMode ?? "BOTH",
        durationMinutes: SESSION_DURATION_MINUTES,
        requestedStartAt: parsed.data.startAt,
      },
      customerQuote.id
    );

    return {
      success: true,
      customerPriceQuoteId: customerQuote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      basePriceCents: customerQuote.basePriceCents,
      adjustments: customerQuote.breakdown as unknown as PriceAdjustment[],
      subtotalCents: customerQuote.subtotalCents,
      taxCents: customerQuote.taxCents,
      taxConfigured: customerQuote.taxConfigured,
      totalCents: customerQuote.totalCents,
      currency: customerQuote.currency,
      expiresAt: customerQuote.expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof PricingRuleNotFoundError || error instanceof TutorPayoutRuleNotFoundError) {
      return { success: false, error: t("pricingUnavailable") };
    }
    if (error instanceof NegativeSpreadError) {
      return { success: false, error: t("pricingUnavailable") };
    }
    return { success: false, error: t("generic") };
  }
}
