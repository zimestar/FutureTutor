import { NextResponse } from "next/server";
import { sweepDueNoShowConvergence } from "@/services/sessionLifecycle";

/**
 * Session Lifecycle Phase 3 — same shared-secret liveness-sweep pattern as
 * /api/cron/quick-match-tick and /api/cron/payments-tick. NOT load-bearing
 * for correctness: recordSessionCheckIn's own embedded convergence-first
 * step (sessionLifecycle.ts §7) is the primary correctness mechanism — a
 * Session past its T+15 grace deadline converges the moment any check-in
 * attempt (or a future explicit "evaluate now" caller) touches it. This
 * route only advances Sessions nobody is actively viewing/checking into, so
 * they don't sit SCHEDULED-but-overdue indefinitely with no trigger ever
 * arriving.
 *
 * As with the two existing cron routes, this repo has no built-in
 * scheduler (no vercel.json, no GitHub Actions workflow) — this route must
 * be invoked periodically by an external trigger (Vercel Cron in
 * production, a scheduled task locally) for the backstop to actually run;
 * see the Phase 3 implementation report §12 for the full assessment.
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

  const result = await sweepDueNoShowConvergence();

  return NextResponse.json({ ok: true, ...result });
}
