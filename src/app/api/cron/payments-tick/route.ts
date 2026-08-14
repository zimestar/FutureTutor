import { NextResponse } from "next/server";
import { reconcileStuckPayments, processEligibleTransfers } from "@/services/tutorTransfers";
import { reclaimStaleProcessingWebhookEvents } from "@/services/stripeWebhooks";

/**
 * Reconciliation/transfer sweep — same shared-secret liveness-sweep pattern
 * as /api/cron/quick-match-tick (Phase F). Not load-bearing for
 * correctness of any single operation (every Step A/B/C flow is already
 * safely recoverable via its own guarded convergence, see
 * src/services/payments.ts); this is what advances abandoned/stuck state
 * nobody is actively viewing.
 */
export async function POST(request: Request) {
  const secret = process.env.PAYMENTS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "PAYMENTS_CRON_SECRET is not configured" }, { status: 500 });
  }

  const provided = request.headers.get("x-cron-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await reconcileStuckPayments();
  const transferResult = await processEligibleTransfers();
  const reclaimedWebhooks = await reclaimStaleProcessingWebhookEvents();

  return NextResponse.json({ ok: true, ...transferResult, reclaimedWebhooks });
}
