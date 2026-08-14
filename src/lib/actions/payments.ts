"use server";

import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentsAreLive } from "@/lib/paymentMode";
import { preparePaymentForQuote, getOrCreatePaymentForQuote, ensureStripePaymentIntent } from "@/services/payments";

export type PreparePaymentState =
  | { success: true; paymentId: string; clientSecret: string | null; live: boolean }
  | { success: false; error: string };

/** Direct booking's equivalent of tutoringRequests.ts's
 * preparePaymentForRequestAction — same shape, anchored on a
 * CustomerPriceQuote the widget already has (the tutor is already known,
 * so there's no TutoringRequest to validate against). */
export async function preparePaymentForBookingQuoteAction(customerPriceQuoteId: string): Promise<PreparePaymentState> {
  const t = await getTranslations("booking.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "STUDENT") return { success: false, error: t("notAStudent") };

  const quote = await db.customerPriceQuote.findUnique({ where: { id: customerPriceQuoteId } });
  if (!quote || quote.createdByUserId !== session.user.id) return { success: false, error: t("invalidInput") };
  if (quote.status !== "ACTIVE") return { success: false, error: t("pricingUnavailable") };

  try {
    if (paymentsAreLive()) {
      const payment = await getOrCreatePaymentForQuote(customerPriceQuoteId, session.user.id);
      const { clientSecret } = await ensureStripePaymentIntent(payment.id);
      return { success: true, paymentId: payment.id, clientSecret, live: true };
    }
    const payment = await preparePaymentForQuote(customerPriceQuoteId, session.user.id);
    return { success: true, paymentId: payment.id, clientSecret: null, live: false };
  } catch {
    return { success: false, error: t("pricingUnavailable") };
  }
}
