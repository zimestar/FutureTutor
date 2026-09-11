import "server-only";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { assessPaymentSafetyForTutorTransfer, isPaymentTransferSafe } from "@/services/paymentSafety";

/**
 * TUTOR-TRANSFER-RECONCILIATION1 — TutorTransfer recovery/reconciliation
 * policy. Deliberately its own Stripe-free module (no import from
 * tutorTransfers.ts, which imports @/lib/stripe at module scope), mirroring
 * paymentSafety.ts's own reasoning exactly: everything defined here must
 * remain safely importable from the DB-only convergence cron without
 * introducing any Stripe reachability there.
 *
 * Covers TWO distinct failure domains (see this mission's own framing):
 *
 * A. PRE/IN-FLIGHT TRANSFER RECOVERY — classifyTutorTransferRecovery, a
 *    pure bounded-retry-window classifier consumed by createTransferForEarning
 *    itself (tutorTransfers.ts, the Stripe-capable file) immediately before
 *    it would otherwise blindly reuse the deterministic Stripe idempotency
 *    key (`transfer:${tutorEarningId}`) to retry a not-yet-COMPLETED
 *    transfer.
 *
 * B. POST-TRANSFER FINANCIAL INCONSISTENCY DETECTION —
 *    sweepPostTransferPaymentSafety, a DB-only detector (Payment/Refund
 *    reads only, zero Stripe calls) for TRANSFERRED earnings whose
 *    underlying Payment has since become unsafe (refunded, disputed, or
 *    ambiguous). Purely observational: it flags via AuditLog + an admin
 *    Notification, and NEVER mutates TutorEarning/TutorTransfer/Payment —
 *    reversing money is an explicit, separate, NOT-authorized-by-this-
 *    mission product/owner decision (see this file's own doc comment on
 *    sweepPostTransferPaymentSafety, and the mission's own Phase 6/7).
 */

// ---------------------------------------------------------------------------
// A. Pre/in-flight transfer recovery — bounded retry window.
// ---------------------------------------------------------------------------

/**
 * [YOUR IDEA — INITIAL DEFAULT] 24 hours, matching Stripe's long-documented
 * idempotency-key retention period. MUST be reconfirmed against current
 * live Stripe documentation before this policy is treated as authoritative
 * in a real live-money environment — this codebase's own established
 * standing caveat (see the Phase G plan's repeated "verify against current
 * Stripe documentation at implementation time" notes) applies here
 * identically; nothing about Stripe's actual current retention period is
 * assumed from training data alone.
 *
 * Why this matters: createTransferForEarning retries a not-yet-COMPLETED
 * TutorTransfer by reusing the SAME deterministic idempotency key
 * (`transfer:${tutorEarningId}`) on every sweep that finds it. That reuse
 * is what makes a retry economically safe — Stripe returns the ORIGINAL
 * transfer object instead of creating a second one, regardless of whether
 * the prior attempt's local FAILED marking reflected a genuine Stripe-side
 * failure or a DB failure AFTER Stripe had already succeeded (both cases
 * converge to the correct COMPLETED state via the same key-reuse
 * mechanism — see this mission's Phase 3/12 for the full reasoning). That
 * safety guarantee is bounded by how long STRIPE itself still honors the
 * key, not by anything this codebase controls — so automatic retry MUST
 * stop once a transfer has been unresolved for longer than that window,
 * rather than continuing to blindly reuse a key that may no longer
 * deduplicate anything.
 */
export const TUTOR_TRANSFER_SAFE_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type TutorTransferRecoveryClassification =
  | { kind: "NOT_APPLICABLE" } // no transfer row, or already COMPLETED — nothing to classify
  | { kind: "RETRYABLE"; ageMs: number } // PENDING/FAILED, still inside the safe key-reuse window
  | { kind: "MANUAL_REVIEW_REQUIRED"; ageMs: number; reason: "STALE_UNRESOLVED_TRANSFER" };

export interface TutorTransferRecoveryFacts {
  status: "PENDING" | "COMPLETED" | "FAILED";
  initiatedAt: Date | null;
  failedAt: Date | null;
}

/**
 * PURE — no I/O. `failedAt` is preferred as the age anchor when present
 * (the most recent known event on this transfer); `initiatedAt` covers the
 * case where the transfer has never even reached a FAILED state yet (e.g.
 * the process crashed between Step A's local create and Step B's Stripe
 * call, or between a successful Stripe call and finalizeTransfer — exactly
 * the "uncertain" case this mission's Phase 3 describes). `now` is
 * injectable for deterministic testing, exactly like this codebase's other
 * pure decision functions (decideTutorEarningConvergence, etc.).
 */
export function classifyTutorTransferRecovery(
  transfer: TutorTransferRecoveryFacts | null,
  now: Date = new Date()
): TutorTransferRecoveryClassification {
  if (!transfer || transfer.status === "COMPLETED") return { kind: "NOT_APPLICABLE" };

  const anchor = transfer.failedAt ?? transfer.initiatedAt;
  // No anchor at all is defensive-only (initiatedAt is always set at
  // creation in the current writer) — treat as age 0 (freshly created,
  // definitely retryable) rather than guessing a large/small age either
  // direction.
  const ageMs = anchor ? now.getTime() - anchor.getTime() : 0;

  if (ageMs > TUTOR_TRANSFER_SAFE_RETRY_WINDOW_MS) {
    return { kind: "MANUAL_REVIEW_REQUIRED", ageMs, reason: "STALE_UNRESOLVED_TRANSFER" };
  }
  return { kind: "RETRYABLE", ageMs };
}

/**
 * I/O wrapper for the manual-review signal — writes AuditLog + notifies
 * every ADMIN/SUPER_ADMIN, but ONLY ONCE per transfer (Phase 10: avoid
 * duplicate audit spam across repeated sweeps). A transfer that stays
 * stale across many future sweeps (once payments-tick is eventually
 * scheduled) must not re-notify every 15 minutes forever.
 */
export async function flagTutorTransferForManualReview(transferId: string, ageMs: number): Promise<void> {
  const already = await db.auditLog.findFirst({
    where: { entityType: "TutorTransfer", entityId: transferId, action: "tutor_transfer.manual_review_required" },
    select: { id: true },
  });
  if (already) return;

  await writeAuditLog({
    actorUserId: null,
    action: "tutor_transfer.manual_review_required",
    entityType: "TutorTransfer",
    entityId: transferId,
    metadata: { ageMs, reason: "STALE_UNRESOLVED_TRANSFER" },
  });

  const admins = await db.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
  for (const admin of admins) {
    await notifyUser(db, {
      userId: admin.id,
      type: "tutor_transfer.manual_review_required",
      title: "Tutor transfer needs manual review",
      body: "A tutor transfer has been unresolved past the safe automatic-retry window and requires manual review before any further action.",
      metadata: { tutorTransferId: transferId },
    });
  }
}

// ---------------------------------------------------------------------------
// B. Post-transfer financial inconsistency detection — DB-only, zero Stripe.
// ---------------------------------------------------------------------------

export interface PostTransferReconciliationResult {
  evaluated: number;
  flagged: number;
}

/**
 * DB-only detector: re-evaluates the authoritative payment-safety predicate
 * (paymentSafety.ts, already proven Stripe-free) for every currently
 * TRANSFERRED earning. A TRANSFERRED earning whose underlying Payment has
 * since become unsafe (refunded, disputed, or ambiguous) must never
 * silently continue appearing financially healthy.
 *
 * Deliberately does NOT touch TutorEarning.status, TutorTransfer, or
 * Payment — this mission explicitly prohibits automatic reversal, a
 * connected-account debit, or a negative tutor balance (none of which has
 * any existing implementation to reuse anyway — see this mission's own
 * Phase 7 read-only finding: TutorTransferReversal exists in schema but is
 * written by zero application code). This function's entire job is
 * DETECT + SURFACE, exactly matching the mission's Phase 6 policy — the
 * actual money-recovery decision is a separate, not-yet-made owner/product
 * decision.
 *
 * Safe to run on the existing DB-only convergence cron
 * (session-financial-convergence-tick) — zero Stripe imports anywhere in
 * this function's own call graph, verified by
 * financialConvergenceStripeReachability.test.ts. No new scheduled service
 * is introduced for this (Phase 9's own stated preference).
 */
export async function sweepPostTransferPaymentSafety(limit = 200): Promise<PostTransferReconciliationResult> {
  const candidates = await db.tutorEarning.findMany({
    where: { status: "TRANSFERRED" },
    select: { id: true, bookingId: true },
    take: limit,
  });

  let flagged = 0;
  for (const candidate of candidates) {
    const safety = await assessPaymentSafetyForTutorTransfer(db, candidate.bookingId);
    if (isPaymentTransferSafe(safety)) continue;

    // reasonKey distinguishes WHICH unsafe condition was observed, so a
    // condition that WORSENS (e.g. OPEN -> LOST) or changes shape produces
    // a fresh, genuinely-new signal, while a sweep that re-observes the
    // exact same already-flagged condition writes nothing further.
    const reasonKey = `${safety.status}:${safety.reason}`;
    const already = await db.auditLog.findFirst({
      where: {
        entityType: "TutorEarning",
        entityId: candidate.id,
        action: "tutor_earning.post_transfer_payment_unsafe",
        metadata: { path: ["reasonKey"], equals: reasonKey },
      },
      select: { id: true },
    });
    if (already) continue;

    await writeAuditLog({
      actorUserId: null,
      action: "tutor_earning.post_transfer_payment_unsafe",
      entityType: "TutorEarning",
      entityId: candidate.id,
      metadata: { bookingId: candidate.bookingId, paymentSafetyStatus: safety.status, reason: safety.reason, reasonKey },
    });

    const admins = await db.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
    for (const admin of admins) {
      await notifyUser(db, {
        userId: admin.id,
        type: "tutor_earning.post_transfer_payment_unsafe",
        title: "Completed tutor transfer now financially inconsistent",
        body: "A tutor transfer already completed, but the underlying payment has since become unsafe (refunded, disputed, or ambiguous) — review required. No automatic reversal has occurred.",
        metadata: { tutorEarningId: candidate.id },
      });
    }
    flagged++;
  }
  return { evaluated: candidates.length, flagged };
}
