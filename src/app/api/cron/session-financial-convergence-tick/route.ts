import { NextResponse } from "next/server";
import { processFinancialConvergenceAndEligibility } from "@/services/tutorEarningConvergence";
import { sweepPostTransferPaymentSafety } from "@/services/tutorTransferReconciliation";

/**
 * FINANCIAL-CONVERGENCE-ROUTE-SEPARATION1 — the dedicated DB-only financial
 * convergence/eligibility cron, split out of /api/cron/payments-tick so
 * that TutorEarning.eligibleAt/status can advance on their own schedule
 * without also exposing Stripe transfer creation.
 *
 * Same shared-secret liveness-sweep pattern as every other cron route in
 * this codebase, with its OWN dedicated secret
 * (SESSION_FINANCIAL_CONVERGENCE_CRON_SECRET) — matching the established
 * one-secret-per-route convention (quick-match-tick, session-noshow-tick,
 * session-notifications-tick each have their own). At deployment time the
 * Railway variable VALUE is set as a reference to the existing
 * PAYMENTS_CRON_SECRET (same financial-cron trust boundary, no new secret
 * material generated) — see FINANCIAL-CONVERGENCE-ROUTE-SEPARATION1's own
 * Phase 10 for the exact infrastructure step; this route never assumes or
 * depends on the two variables being byte-identical, it only ever reads
 * its own.
 *
 * TUTOR-TRANSFER-RECONCILIATION1 (Phase 5/8/9): also runs
 * sweepPostTransferPaymentSafety — a second, independent, equally
 * Stripe-free DB-only detector that flags (never mutates) a TRANSFERRED
 * earning whose underlying Payment has since become unsafe. Folded into
 * this SAME already-scheduled cron rather than a new service, per that
 * mission's own explicit preference not to introduce another scheduled
 * service unless operationally necessary.
 *
 * This route's ENTIRE import graph is Stripe-free: it imports only
 * processFinancialConvergenceAndEligibility (tutorEarningConvergence.ts,
 * calling only sweepTutorEarningConvergence and markEligibleEarnings) and
 * sweepPostTransferPaymentSafety (tutorTransferReconciliation.ts, calling
 * only paymentSafety.ts's own Stripe-free predicate) — neither has any
 * reference to @/lib/stripe, stripe.transfers.create,
 * createTransferForEarning, processEligibleTransfers, or
 * reconcileStuckPayments anywhere. This is enforced by
 * financialConvergenceStripeReachability.test.ts as a mandatory deployment
 * gate, not merely documented here.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_FINANCIAL_CONVERGENCE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SESSION_FINANCIAL_CONVERGENCE_CRON_SECRET is not configured" }, { status: 500 });
  }

  const provided = request.headers.get("x-cron-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processFinancialConvergenceAndEligibility();
  const postTransferReconciliation = await sweepPostTransferPaymentSafety();
  return NextResponse.json({ ok: true, ...result, postTransferReconciliation });
}
