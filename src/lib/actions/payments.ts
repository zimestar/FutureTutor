"use server";

import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentsUseStripe } from "@/lib/paymentMode";
import { preparePaymentForQuote, getOrCreatePaymentForQuote, ensureStripePaymentIntent } from "@/services/payments";
import { canPayForStudent } from "@/services/studentAuthorization";

export type PreparePaymentState =
  | { success: true; paymentId: string; clientSecret: string | null; usesStripe: boolean }
  | { success: false; error: string; retryable: boolean };

/** Direct booking's equivalent of tutoringRequests.ts's
 * preparePaymentForRequestAction — same shape, anchored on a
 * CustomerPriceQuote the widget already has (the tutor is already known,
 * so there's no TutoringRequest to validate against). */
export async function preparePaymentForBookingQuoteAction(customerPriceQuoteId: string): Promise<PreparePaymentState> {
  const t = await getTranslations("booking.errors");
  const session = await auth();
  // Phase H.7 — the actor may be the Parent who created this quote.
  // canPayForStudent below (checked against quote.studentProfileId, the
  // authoritative learner) is the real gate; this is only the coarse role
  // filter.
  if (!session?.user || (session.user.role !== "STUDENT" && session.user.role !== "PARENT")) {
    return { success: false, error: t("notAStudent"), retryable: false };
  }

  const quote = await db.customerPriceQuote.findUnique({ where: { id: customerPriceQuoteId } });
  if (!quote || quote.createdByUserId !== session.user.id) return { success: false, error: t("invalidInput"), retryable: false };
  if (quote.status !== "ACTIVE") return { success: false, error: t("pricingUnavailable"), retryable: false };

  // Phase H.5 security correction: previously only createdByUserId
  // self-match, no H.2 involvement. Unchanged for every existing
  // SELF_MANAGED student.
  const authorized = await canPayForStudent(db, session.user.id, quote.studentProfileId);
  if (!authorized) return { success: false, error: t("notAStudent"), retryable: false };

  try {
    if (paymentsUseStripe()) {
      const payment = await getOrCreatePaymentForQuote(customerPriceQuoteId, session.user.id);
      const { clientSecret } = await ensureStripePaymentIntent(payment.id);
      return { success: true, paymentId: payment.id, clientSecret, usesStripe: true };
    }
    const payment = await preparePaymentForQuote(customerPriceQuoteId, session.user.id);
    return { success: true, paymentId: payment.id, clientSecret: null, usesStripe: false };
  } catch {
    return { success: false, error: t("paymentPreparationFailed"), retryable: true };
  }
}
