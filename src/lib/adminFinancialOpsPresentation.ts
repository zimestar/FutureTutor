import type { TutorEarningStatus, TutorTransferStatus } from "@/generated/prisma/enums";
import { TUTOR_EARNING_FINANCIAL_DELAY_MS } from "@/services/tutorEarningConvergence";
import type { TutorEarningSessionFacts } from "@/lib/tutorEarningPresentation";

/**
 * ADMIN-FINANCIAL-OPS1A — a deterministic, admin-facing operational
 * classification for one TutorEarning, superset of
 * tutorEarningPresentation.ts's tutor-facing presentTutorEarningTransparency
 * (which this file deliberately does NOT modify or replace). Two things an
 * admin needs that a tutor doesn't:
 *
 *  1. "Awaiting convergence" — a TIME-RELATIVE signal (needs `now`): the
 *     authoritative payable outcome has been reached AND the delay has
 *     already elapsed (real or projected), but TutorEarning.status is still
 *     PENDING_ELIGIBLE. This never happens for a tutor's own view (they
 *     just see "pending eligibility" either way) but matters operationally,
 *     since it is exactly the observable symptom of the currently-
 *     unscheduled Payments cron never having run the convergence sweep.
 *  2. TutorTransfer.status itself (PENDING/FAILED), which the tutor-facing
 *     function never needed to branch on (a tutor only ever sees
 *     TRANSFERRED once the whole pipeline succeeded).
 *
 * PURE — no DB access, no financial decision, no write. Given the same
 * facts twice, always returns the same classification.
 */
export type AdminEarningReasonKey =
  | "pendingSessionOutcome"
  | "waiting24h"
  | "awaitingConvergence"
  | "eligible"
  | "heldTutorNoShow"
  | "heldNoShowUnresolved"
  | "heldInterrupted"
  | "heldUnknown"
  | "transferPending"
  | "transferred"
  | "transferFailed"
  | "cancelled";

export type AdminEarningDelayAnchor = "completion" | "studentNoShow" | "none";

export interface AdminEarningClassification {
  key: AdminEarningReasonKey;
  /** Which authoritative Session timestamp the 24h delay is measured from —
   * "none" when no payable outcome has been reached yet. Purely
   * informational; never a second source of truth. */
  delayAnchor: AdminEarningDelayAnchor;
  /** A real date, or null. Whether it's the persisted TutorEarning.eligibleAt
   * or a derived projection is told apart by eligibilityDateIsExpected below
   * — never conflate the two in copy. */
  eligibilityDate: Date | null;
  /** True ONLY for a date this function projected itself (never a real
   * persisted eligibleAt). */
  eligibilityDateIsExpected: boolean;
  /** TutorTransfer.completedAt, when a completed transfer exists. */
  transferDate: Date | null;
}

export interface AdminTransferFacts {
  status: TutorTransferStatus;
  completedAt: Date | null;
}

function heldReason(session: TutorEarningSessionFacts | null): AdminEarningReasonKey {
  if (session?.sessionStatus === "INTERRUPTED") return "heldInterrupted";
  if (session?.sessionStatus === "NO_SHOW" && session.noShowOutcome === "TUTOR_NO_SHOW") return "heldTutorNoShow";
  if (session?.sessionStatus === "NO_SHOW" && session.noShowOutcome === "NO_SHOW_UNRESOLVED") return "heldNoShowUnresolved";
  // Defensive — never guess a specific reason from incomplete facts.
  return "heldUnknown";
}

const NO_DATE: Pick<AdminEarningClassification, "eligibilityDate" | "eligibilityDateIsExpected" | "transferDate" | "delayAnchor"> = {
  eligibilityDate: null,
  eligibilityDateIsExpected: false,
  transferDate: null,
  delayAnchor: "none",
};

export function classifyTutorEarningForAdmin(
  earning: { status: TutorEarningStatus; eligibleAt: Date | null },
  session: TutorEarningSessionFacts | null,
  transfer: AdminTransferFacts | null,
  now: Date
): AdminEarningClassification {
  if (earning.status === "CANCELLED") {
    return { key: "cancelled", ...NO_DATE };
  }

  // A COMPLETED TutorTransfer is the most informative signal available,
  // checked ahead of TRANSFERRED/ELIGIBLE so a genuinely inconsistent
  // combination (should never happen given finalizeTransfer's own atomic
  // transaction) still surfaces the transfer honestly rather than silently
  // reporting a stale earning status.
  if (transfer?.status === "COMPLETED" || earning.status === "TRANSFERRED") {
    return { key: "transferred", ...NO_DATE, transferDate: transfer?.completedAt ?? null };
  }

  if (transfer?.status === "FAILED") {
    return { key: "transferFailed", ...NO_DATE };
  }

  if (transfer?.status === "PENDING") {
    return { key: "transferPending", ...NO_DATE };
  }

  if (earning.status === "ELIGIBLE") {
    return { key: "eligible", ...NO_DATE };
  }

  if (earning.status === "HELD") {
    return { key: heldReason(session), ...NO_DATE };
  }

  // earning.status === "PENDING_ELIGIBLE" — the only remaining case.
  const delayAnchor: AdminEarningDelayAnchor =
    session?.sessionStatus === "COMPLETED"
      ? "completion"
      : session?.sessionStatus === "NO_SHOW" && session.noShowOutcome === "STUDENT_NO_SHOW"
        ? "studentNoShow"
        : "none";

  const projectedDate =
    session?.sessionStatus === "COMPLETED" && session.completedAt
      ? new Date(session.completedAt.getTime() + TUTOR_EARNING_FINANCIAL_DELAY_MS)
      : session?.sessionStatus === "NO_SHOW" && session.noShowOutcome === "STUDENT_NO_SHOW" && session.noShowConvergedAt
        ? new Date(session.noShowConvergedAt.getTime() + TUTOR_EARNING_FINANCIAL_DELAY_MS)
        : null;

  const anchorDate = earning.eligibleAt ?? projectedDate;
  if (!anchorDate) {
    // No payable outcome reached yet — nothing safe to project.
    return { key: "pendingSessionOutcome", ...NO_DATE };
  }

  const isExpected = earning.eligibleAt === null;
  const key: AdminEarningReasonKey = anchorDate.getTime() <= now.getTime() ? "awaitingConvergence" : "waiting24h";
  return { key, delayAnchor, eligibilityDate: anchorDate, eligibilityDateIsExpected: isExpected, transferDate: null };
}
