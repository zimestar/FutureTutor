import { NextResponse } from "next/server";
import { sweepDueSessionReminders, dispatchSessionNotificationsAfterCommit } from "@/services/sessionNotifications";

/**
 * PROD-SESSION-NOTIFICATIONS1 — same shared-secret liveness-sweep pattern
 * as /api/cron/session-noshow-tick / quick-match-tick / payments-tick.
 * Deliberately a NEW, dedicated route rather than folded into
 * session-noshow-tick: reminders scan FUTURE bookings on a genuinely
 * different window (startAt in the next 2-24h) than that route's three
 * sweeps (all past-due-boundary convergence), and this mission's own
 * instruction is explicit — do not repurpose the Payments cron, and only
 * reuse session-noshow-tick if doing so is clean and does not couple
 * unrelated responsibilities. Cancellation and no-show notifications do
 * NOT need this route at all — they're triggered directly from
 * cancellationPolicy.ts / sessionLifecycle.ts's own authoritative
 * transactions (session-noshow-tick's existing sweep already dispatches
 * no-show notifications for free, since resolveSessionNoShowConvergence
 * now calls dispatchSessionNotificationsAfterCommit internally).
 *
 * As with every other cron route in this codebase, this repo has no
 * built-in scheduler — this route must be invoked periodically by an
 * external trigger (configured directly wherever the deployment's cron
 * trigger lives, not declared in this repository). Per this mission's
 * explicit instruction, this endpoint is deployed UNSCHEDULED — no
 * Railway cron trigger is wired to it without separate, explicit owner
 * authorization.
 *
 * Fail-safe / bounded / idempotent by construction: `sweepDueSessionReminders`
 * takes a bounded `limit` (default 100) per reminder window, its own
 * writes are wrapped one booking at a time (never one giant transaction),
 * and durable dedupeKey uniqueness makes a duplicated/overlapping tick a
 * safe no-op regardless of how often or unevenly this route is invoked.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_NOTIFICATIONS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SESSION_NOTIFICATIONS_CRON_SECRET is not configured" }, { status: 500 });
  }

  const provided = request.headers.get("x-cron-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reminders = await sweepDueSessionReminders();

  // Dispatch, per booking, strictly after the reminder rows created above
  // are durably committed — never inside sweepDueSessionReminders' own
  // per-booking transaction. Each call is independently fail-safe (a
  // provider failure for one booking's email never affects another's, and
  // never rethrows to this route).
  for (const bookingId of reminders.bookingIds) {
    await dispatchSessionNotificationsAfterCommit(bookingId);
  }

  return NextResponse.json({ ok: true, reminders: { bookingsTouched: reminders.bookingIds.length } });
}
