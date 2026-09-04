"use server";

import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentsUseStripe } from "@/lib/paymentMode";
import { closedBetaFinancialGateActive } from "@/lib/closedBetaConfig";
import { financialE2EEnabled, isFinancialE2EExceptionAllowed, auditFinancialE2EExceptionUsed } from "@/lib/financialE2EConfig";
import { preparePaymentForQuote, getOrCreatePaymentForQuote, ensureStripePaymentIntent } from "@/services/payments";
import { canPayForStudent } from "@/services/studentAuthorization";

export type PreparePaymentState =
  | { success: true; paymentId: string; clientSecret: string | null; usesStripe: boolean }
  // `reason: "beta_gate"` lets the UI distinguish "the Closed Beta financial
  // gate is active" (not retryable by the user, ever, regardless of
  // selection) from an ordinary transient payment-preparation failure —
  // see BookingWidget.tsx/QuickMatchPriceReview.tsx.
  | { success: false; error: string; retryable: boolean; reason?: "beta_gate" };

/** Direct booking's equivalent of tutoringRequests.ts's
 * preparePaymentForRequestAction — same shape, anchored on a
 * CustomerPriceQuote the widget already has (the tutor is already known,
 * so there's no TutoringRequest to validate against). */
export async function preparePaymentForBookingQuoteAction(customerPriceQuoteId: string): Promise<PreparePaymentState> {
  const t = await getTranslations("booking.errors");

  // BETA-HARDEN1 — the Closed Beta financial gate. Checked first, before
  // any session/authorization work, so a crafted direct call fails closed
  // regardless of who the caller is. This is the exact choke point that
  // BETA-USER1 identified as auto-firing a live Stripe PaymentIntent off a
  // single slot selection — no Stripe object is created past this point
  // while the gate is active.
  if (closedBetaFinancialGateActive()) {
    // PROD-FINANCIAL-E2E1-GATE1 — a temporary, narrowly-scoped exception for
    // exactly one controlled certification scenario (see
    // src/lib/financialE2EConfig.ts). financialE2EEnabled() is a zero-I/O
    // env check, so the ordinary case (this mechanism unconfigured, as it
    // is everywhere in production right now) short-circuits here with the
    // exact same call pattern as before this mission — no auth() call, no
    // DB read, no behavior change for any ordinary user.
    if (!financialE2EEnabled()) {
      return { success: false, error: t("betaBookingsUnavailable"), retryable: false, reason: "beta_gate" };
    }
    const e2eSession = await auth();
    const e2eActorId = e2eSession?.user?.id;
    const e2eAllowed = e2eActorId
      ? await isFinancialE2EExceptionAllowed({ actorUserId: e2eActorId, customerPriceQuoteId })
      : false;
    if (!e2eAllowed) {
      return { success: false, error: t("betaBookingsUnavailable"), retryable: false, reason: "beta_gate" };
    }
    // Not client-controllable — tutorProfileId comes only from the server's
    // own FINANCIAL_E2E_TUTOR_PROFILE_ID, already re-verified above.
    await auditFinancialE2EExceptionUsed({
      actorUserId: e2eActorId!,
      tutorProfileId: process.env.FINANCIAL_E2E_TUTOR_PROFILE_ID!,
    });
    // Falls through to the normal payment-preparation flow below, exactly
    // as if the Closed Beta gate were inactive.
  }

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
