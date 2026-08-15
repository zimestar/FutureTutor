"use server";

import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canInitiatePaidBooking } from "@/services/studentAuthorization";
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
  studentProfileId: string;
  tutorProfileId: string;
  subjectId: string;
  academicLevelId?: string;
  startAt: string;
}): Promise<PriceQuoteResult> {
  const t = await getTranslations("booking.errors");

  const session = await auth();
  // Phase H.7 — the actor may now legitimately be a PARENT booking for a
  // linked child, not only the learner's own STUDENT session.
  if (!session?.user || (session.user.role !== "STUDENT" && session.user.role !== "PARENT")) {
    return { success: false, error: t("notAStudent") };
  }

  const parsed = createPriceQuoteSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: t("invalidInput") };

  // Phase H.7 — the learner is now an explicit, client-selected
  // studentProfileId (self, or a linked child) instead of always being
  // self-derived from the actor's own userId. That value is NEVER
  // authority on its own — resolved fresh here, then independently
  // re-verified via H.2 immediately below. A forged/unrelated id simply
  // fails to resolve to a real StudentProfile, or fails the H.2 check.
  const studentProfile = await db.studentProfile.findUnique({ where: { id: parsed.data.studentProfileId } });
  if (!studentProfile) return { success: false, error: t("invalidInput") };

  // Phase H.5 security correction (extended in H.7 for actor != learner):
  // the old self-ownership-only authorization.server.ts#canActForStudent
  // had no managementMode awareness and would incorrectly authorize a
  // GUARDIAN_MANAGED student's own restricted login. H.2's
  // canInitiatePaidBooking correctly denies that, correctly allows an
  // ACTIVE guardian acting for their linked child, and remains identical
  // for every existing SELF_MANAGED student booking themselves.
  const authorized = await canInitiatePaidBooking(db, session.user.id, studentProfile.id);
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
