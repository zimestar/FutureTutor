import { NextResponse } from "next/server";
import { processFinancialConvergenceAndEligibility } from "@/services/tutorEarningConvergence";

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
 * material generated) — see the mission's own Phase 10 for the exact
 * infrastructure step; this route never assumes or depends on the two
 * variables being byte-identical, it only ever reads its own.
 *
 * This route's ENTIRE import graph is Stripe-free: it imports only
 * processFinancialConvergenceAndEligibility, which itself calls only
 * sweepTutorEarningConvergence and markEligibleEarnings — both defined in
 * src/services/tutorEarningConvergence.ts, a module with zero references to
 * @/lib/stripe, stripe.transfers.create, createTransferForEarning,
 * processEligibleTransfers, or reconcileStuckPayments anywhere. This is
 * enforced by financialConvergenceStripeReachability.test.ts as a
 * mandatory deployment gate, not merely documented here.
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
  return NextResponse.json({ ok: true, ...result });
}
