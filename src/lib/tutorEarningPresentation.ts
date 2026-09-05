import type { SessionStatus, TutorEarningStatus } from "@/generated/prisma/enums";
import type { NoShowOutcome } from "@/services/sessionLifecycle";
import { TUTOR_EARNING_FINANCIAL_DELAY_MS } from "@/services/tutorEarningConvergence";

export type TutorEarningPresentationKey =
  | "pendingOutcome"
  | "pendingEligibility"
  | "eligible"
  | "held"
  | "transferred"
  | "cancelled";

export interface TutorEarningPresentation {
  key: TutorEarningPresentationKey;
  badgeVariant: "mint" | "blue" | "neutral" | "outline";
  showEligibilityDate: boolean;
}

/** Display-only mapping of authoritative fields; never derives or mutates financial state. */
export function presentTutorEarning(
  status: TutorEarningStatus,
  eligibleAt: Date | null
): TutorEarningPresentation {
  switch (status) {
    case "PENDING_ELIGIBLE":
      return eligibleAt
        ? { key: "pendingEligibility", badgeVariant: "blue", showEligibilityDate: true }
        : { key: "pendingOutcome", badgeVariant: "neutral", showEligibilityDate: false };
    case "ELIGIBLE":
      return { key: "eligible", badgeVariant: "mint", showEligibilityDate: false };
    case "HELD":
      return { key: "held", badgeVariant: "outline", showEligibilityDate: false };
    case "TRANSFERRED":
      return { key: "transferred", badgeVariant: "mint", showEligibilityDate: false };
    case "CANCELLED":
      return { key: "cancelled", badgeVariant: "outline", showEligibilityDate: false };
  }
}

// ---------------------------------------------------------------------------
// TUTOR-PAYOUT-TRANSPARENCY1 — a richer, additive presentation for
// /tutor/payouts only. presentTutorEarning above is deliberately left
// unchanged (still used by /tutor/bookings' compact inline badge) so this
// mission's work carries zero regression risk to that page. This function
// derives a SPECIFIC, honest reason from the same authoritative facts the
// financial convergence engine itself reads (tutorEarningConvergence.ts /
// getSessionFinancialFacts) — never a new classification invented here.
// ---------------------------------------------------------------------------

export type TutorEarningReasonKey =
  | "pendingOutcome"
  | "pendingEligibilityPersisted"
  | "pendingEligibilityExpected"
  | "eligible"
  | "heldTutorNoShow"
  | "heldNoShowUnresolved"
  | "heldInterrupted"
  | "held"
  | "transferred"
  | "cancelled";

export interface TutorEarningTransparency {
  key: TutorEarningReasonKey;
  badgeVariant: "mint" | "blue" | "neutral" | "outline";
  /** A real date to show, or null. Whether it's the persisted, authoritative
   * TutorEarning.eligibleAt or a projected one is told apart by
   * `eligibilityDateIsExpected` below — never conflate the two in copy. */
  eligibilityDate: Date | null;
  /** True ONLY for a date this function projected itself (persisted
   * completedAt/noShowConvergedAt + the official delay), never for a real
   * persisted eligibleAt. The caller MUST label these differently
   * ("Expected eligibility" vs. an unqualified "Eligible on"). */
  eligibilityDateIsExpected: boolean;
  /** TutorTransfer.completedAt, when a completed transfer exists for this earning. */
  transferDate: Date | null;
}

/** Already-reconstructed Session facts for one booking — the caller resolves
 * these once (reusing the same reconstructNoShowOutcome helper the financial
 * engine itself uses), so this function stays a pure, synchronous decision
 * with no DB access of its own, mirroring decideTutorEarningConvergence's
 * own shape. */
export interface TutorEarningSessionFacts {
  sessionStatus: SessionStatus;
  completedAt: Date | null;
  noShowConvergedAt: Date | null;
  noShowOutcome: NoShowOutcome | null;
}

function genericHeld(): TutorEarningTransparency {
  return { key: "held", badgeVariant: "outline", eligibilityDate: null, eligibilityDateIsExpected: false, transferDate: null };
}

export function presentTutorEarningTransparency(
  earning: { status: TutorEarningStatus; eligibleAt: Date | null },
  session: TutorEarningSessionFacts | null,
  transfer: { completedAt: Date | null } | null
): TutorEarningTransparency {
  switch (earning.status) {
    case "CANCELLED":
      return { key: "cancelled", badgeVariant: "outline", eligibilityDate: null, eligibilityDateIsExpected: false, transferDate: null };

    case "TRANSFERRED":
      return {
        key: "transferred",
        badgeVariant: "mint",
        eligibilityDate: earning.eligibleAt,
        eligibilityDateIsExpected: false,
        transferDate: transfer?.completedAt ?? null,
      };

    case "ELIGIBLE":
      return { key: "eligible", badgeVariant: "mint", eligibilityDate: null, eligibilityDateIsExpected: false, transferDate: null };

    case "HELD": {
      if (session?.sessionStatus === "INTERRUPTED") {
        return { key: "heldInterrupted", badgeVariant: "outline", eligibilityDate: null, eligibilityDateIsExpected: false, transferDate: null };
      }
      if (session?.sessionStatus === "NO_SHOW" && session.noShowOutcome === "TUTOR_NO_SHOW") {
        return { key: "heldTutorNoShow", badgeVariant: "outline", eligibilityDate: null, eligibilityDateIsExpected: false, transferDate: null };
      }
      if (session?.sessionStatus === "NO_SHOW" && session.noShowOutcome === "NO_SHOW_UNRESOLVED") {
        return { key: "heldNoShowUnresolved", badgeVariant: "outline", eligibilityDate: null, eligibilityDateIsExpected: false, transferDate: null };
      }
      // Defensive fallback — never guess a specific reason from incomplete
      // facts; a generic but honest "on hold" beats a fabricated one.
      return genericHeld();
    }

    case "PENDING_ELIGIBLE": {
      if (earning.eligibleAt) {
        return {
          key: "pendingEligibilityPersisted",
          badgeVariant: "blue",
          eligibilityDate: earning.eligibleAt,
          eligibilityDateIsExpected: false,
          transferDate: null,
        };
      }
      // eligibleAt is null. This is legitimate whenever the session outcome
      // isn't resolved yet (still SCHEDULED/IN_PROGRESS) — but it can ALSO
      // be null purely because the financial convergence sweep (gated
      // behind the currently-unscheduled Payments cron) hasn't run yet even
      // though the session itself has already reached a payable outcome.
      // In that second case, a safe expected date CAN be projected directly
      // from the same authoritative anchor + delay the engine itself would
      // use — labeled as a projection, never as an already-granted date.
      if (session?.sessionStatus === "COMPLETED" && session.completedAt) {
        return {
          key: "pendingEligibilityExpected",
          badgeVariant: "blue",
          eligibilityDate: new Date(session.completedAt.getTime() + TUTOR_EARNING_FINANCIAL_DELAY_MS),
          eligibilityDateIsExpected: true,
          transferDate: null,
        };
      }
      if (session?.sessionStatus === "NO_SHOW" && session.noShowOutcome === "STUDENT_NO_SHOW" && session.noShowConvergedAt) {
        return {
          key: "pendingEligibilityExpected",
          badgeVariant: "blue",
          eligibilityDate: new Date(session.noShowConvergedAt.getTime() + TUTOR_EARNING_FINANCIAL_DELAY_MS),
          eligibilityDateIsExpected: true,
          transferDate: null,
        };
      }
      // Session outcome not yet resolved (SCHEDULED/IN_PROGRESS), or no
      // Session row at all — nothing safe to project.
      return { key: "pendingOutcome", badgeVariant: "neutral", eligibilityDate: null, eligibilityDateIsExpected: false, transferDate: null };
    }
  }
}
