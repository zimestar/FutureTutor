import { NextResponse } from "next/server";
import { sweepDueNoShowConvergence, sweepDueSessionCompletionConvergence } from "@/services/sessionLifecycle";
import { sweepDueVideoRoomProvisioning } from "@/services/videoSession";
import { createDailyVideoProvider } from "@/services/dailyVideoProvider";

/**
 * Session Lifecycle Phase 3 (no-show) + Phase 4 (completion) — same
 * shared-secret liveness-sweep pattern as /api/cron/quick-match-tick and
 * /api/cron/payments-tick. This route now runs BOTH sweeps: Phase 3's
 * no-show convergence (SCHEDULED sessions overdue at T+15) and Phase 4's
 * completion convergence (IN_PROGRESS sessions overdue at Booking.endAt).
 * They are deliberately combined into one route rather than split into two
 * — mirroring /api/cron/payments-tick's own established precedent of
 * running multiple independent sweep functions (reconcileStuckPayments,
 * processEligibleTransfers, reclaimStaleProcessingWebhookEvents) behind one
 * shared-secret route — rather than proliferating a new cron route/secret
 * per lifecycle concern (see the Phase 4 implementation report for the
 * explicit reasoning). The route path and secret env var name
 * (SESSION_NOSHOW_CRON_SECRET) are kept as-is for continuity even though
 * this route's scope is now "session lifecycle convergence," not just
 * no-show — analogous to PAYMENTS_CRON_SECRET already covering more than
 * one concern.
 *
 * No-show convergence is NOT load-bearing for correctness on its own:
 * recordSessionCheckIn's own embedded convergence-first step
 * (sessionLifecycle.ts) is the primary correctness mechanism for no-show. By
 * contrast, completion convergence has NO embedded/lazy trigger anywhere in
 * this codebase (a deliberate Phase 4 design choice — see
 * sweepDueSessionCompletionConvergence's own doc comment) — in this
 * environment this sweep is, in practice, the PRIMARY way a Session ever
 * reaches COMPLETED, not merely a backstop.
 *
 * As with the other cron routes, this repo has no built-in scheduler (no
 * vercel.json, no GitHub Actions workflow) — this route must be invoked
 * periodically by an external trigger (Vercel Cron in production, a
 * scheduled task locally) for either sweep to actually run.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_NOSHOW_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SESSION_NOSHOW_CRON_SECRET is not configured" }, { status: 500 });
  }

  const provided = request.headers.get("x-cron-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const noShow = await sweepDueNoShowConvergence();
  const completion = await sweepDueSessionCompletionConvergence();

  // VIDEO-1A — room provisioning joins this same sweep family (see
  // videoSession.ts's own doc comment for why: it's the identical
  // "session lifecycle time-boundary convergence" shape as the two sweeps
  // above, keyed off the same CHECK_IN_WINDOW_MS_BEFORE_START boundary).
  // Skips gracefully (never fails the whole route) when DAILY_API_KEY isn't
  // configured — e.g. local dev without video credentials.
  const video = process.env.DAILY_API_KEY
    ? await sweepDueVideoRoomProvisioning(createDailyVideoProvider())
    : { attempted: 0, provisioned: 0, failed: 0, skipped: "DAILY_API_KEY not configured" };

  return NextResponse.json({ ok: true, noShow, completion, video });
}
