import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { SessionStatus, TutorEarningStatus } from "@/generated/prisma/enums";
import { withSerializableRetry } from "@/lib/serializableRetry";
import { writeAuditLog } from "@/lib/audit";
import { getSessionFinancialFacts, type NoShowOutcome, type SessionFinancialFacts } from "@/services/sessionLifecycle";

/**
 * Phase 5B — Session Outcome -> Tutor Earning Convergence Engine.
 *
 * ARCHITECTURAL BOUNDARY (task §1): Session lifecycle produces facts
 * (src/services/sessionLifecycle.ts's getSessionFinancialFacts, a pure
 * read); this file is the ONLY place a TutorEarning row is written as a
 * consequence of a Session outcome. sessionLifecycle.ts itself never
 * imports this file and never touches TutorEarning — verified by the
 * existing "financial firewall" regression tests in
 * sessionLifecyclePhase4.integration.test.ts and
 * sessionNoShowConvergence.integration.test.ts, which assert that calling
 * completion/interruption/no-show convergence directly leaves TutorEarning
 * completely untouched. This engine is always invoked SEPARATELY, from the
 * financial cron sweep (tutorTransfers.ts's processEligibleTransfers), never
 * embedded inside a Session Lifecycle writer.
 *
 * TIME ALONE MUST NEVER MAKE A TUTOR EARNING ELIGIBLE (task §0): this engine
 * only ever sets TutorEarning.eligibleAt once the authoritative Session
 * outcome already permits it (COMPLETED or STUDENT_NO_SHOW) — the financial
 * delay below is then a SECOND, independent gate on top of that permission,
 * enforced by markEligibleEarnings' own hardened Session-truth check
 * (tutorTransfers.ts), not by this column alone.
 */

// ---------------------------------------------------------------------------
// The financial delay — unchanged in magnitude from the pre-Phase-5B rule
// (TutorEarning.eligibleAt's own schema comment: "[YOUR IDEA — RECOMMENDED
// PAYOUT TIMING] booking.endAt + 24h"), but re-anchored per task §3C/§11.
//
// ANCHOR AUDIT (task §3C — "report your conclusion explicitly"):
// Booking.endAt is the *scheduled*, contractual end — it never moves and is
// known before the session ever happens. completedAt
// (resolveSessionCompletionConvergence's own server-generated timestamp,
// Session Lifecycle Phase 4) is the *authoritative* moment convergence
// actually observed the session as finished, and by construction
// (decideSessionCompletionOutcome: "now >= bookingEndAt -> COMPLETE,
// completedAt = now") is always >= Booking.endAt — usually by a small,
// cron-interval-bounded margin, but never earlier. Phase 5A's own schema
// comment on TutorEarning.eligibleAt already commits to this answer
// prospectively: "COMPLETED -> completedAt + 24h ... STUDENT_NO_SHOW ->
// noShowConvergedAt + 24h" — i.e. anchor to the authoritative Session-truth
// timestamp the outcome itself produced, not the pre-outcome scheduled
// time. This engine follows that already-published intent: completedAt is
// the correct anchor because task §3C's own framing ("Session completion is
// the prerequisite. Time is then the secondary condition") is only true if
// the delay is measured FROM the moment the prerequisite was actually
// satisfied — measuring from Booking.endAt would let the delay start
// ticking before completion was ever confirmed, reintroducing a sliver of
// the exact "time alone" defect this phase closes (a session that lags
// significantly behind its scheduled end, e.g. a late completion sweep,
// would otherwise become eligible sooner than 24h after it actually
// finished converging).
export const TUTOR_EARNING_FINANCIAL_DELAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pure decision function — no I/O, mirrors decideNoShowOutcome /
// decideSessionCompletionOutcome's own "pure boundary function" shape
// exactly. Takes only the authoritative Session-truth facts (never a client
// timestamp, never a client-claimed outcome) and returns exactly one
// permitted action. This is the SOLE place financial policy per Session
// outcome (task §3 A-G) is expressed.
// ---------------------------------------------------------------------------

export type TutorEarningConvergenceDecision =
  | { kind: "NOT_DUE" } // SCHEDULED / IN_PROGRESS — task §3A/§3B
  | { kind: "CANCELLED_FIREWALL" } // Session_ CANCELLED — H.8 owns this earning exclusively, task §8
  | { kind: "ELIGIBLE_AT_VIA_COMPLETION"; eligibleAt: Date } // task §3C
  | { kind: "ELIGIBLE_AT_VIA_STUDENT_NO_SHOW"; eligibleAt: Date } // task §3D
  | { kind: "HOLD_TUTOR_NO_SHOW" } // task §3E
  | { kind: "HOLD_NO_SHOW_UNRESOLVED" } // task §3F
  | { kind: "HOLD_INTERRUPTED" } // task §3G
  | { kind: "INCONSISTENT_SESSION_FACTS" }; // defensive: a terminal status missing its own authoritative timestamp/outcome — never expected in practice, never guessed at, always reported rather than acted on

export interface TutorEarningConvergenceDecisionInput {
  sessionStatus: SessionStatus;
  completedAt: Date | null;
  noShowConvergedAt: Date | null;
  noShowOutcome: NoShowOutcome | null;
}

/**
 * PURE — the entire Phase 5B financial policy table (task §3), in one
 * exhaustive switch. STUDENT_NO_SHOW POLICY (task §3D): audited against
 * Phase 5A's own schema comment on TutorEarning.eligibleAt and Session_.
 * noShowConvergedAt, both of which already explicitly commit to "STUDENT_NO_SHOW
 * -> noShowConvergedAt + 24h" as the intended Phase 5B behavior — i.e. a
 * STUDENT_NO_SHOW (tutor present, learner presence never confirmed)
 * preserves NORMAL tutor earning eligibility after the standard delay
 * (task §3D option 1/2), never a penalty against the tutor and never a new
 * refund policy. This is treated as an already-published repository
 * decision (documented by a prior phase's own author, specifically
 * forward-referencing this phase), not a policy invented here — see the
 * Phase 5B implementation report for the full citation. This is NOT
 * invoked as a §3D STOP condition because the policy is not ambiguous: it
 * is explicitly pre-recorded in the schema.
 */
export function decideTutorEarningConvergence(
  input: TutorEarningConvergenceDecisionInput
): TutorEarningConvergenceDecision {
  switch (input.sessionStatus) {
    case "SCHEDULED":
    case "IN_PROGRESS":
      return { kind: "NOT_DUE" };
    case "CANCELLED":
      return { kind: "CANCELLED_FIREWALL" };
    case "COMPLETED":
      if (!input.completedAt) return { kind: "INCONSISTENT_SESSION_FACTS" };
      return { kind: "ELIGIBLE_AT_VIA_COMPLETION", eligibleAt: new Date(input.completedAt.getTime() + TUTOR_EARNING_FINANCIAL_DELAY_MS) };
    case "INTERRUPTED":
      return { kind: "HOLD_INTERRUPTED" };
    case "NO_SHOW":
      if (input.noShowOutcome === "STUDENT_NO_SHOW") {
        if (!input.noShowConvergedAt) return { kind: "INCONSISTENT_SESSION_FACTS" };
        return {
          kind: "ELIGIBLE_AT_VIA_STUDENT_NO_SHOW",
          eligibleAt: new Date(input.noShowConvergedAt.getTime() + TUTOR_EARNING_FINANCIAL_DELAY_MS),
        };
      }
      if (input.noShowOutcome === "TUTOR_NO_SHOW") return { kind: "HOLD_TUTOR_NO_SHOW" };
      if (input.noShowOutcome === "NO_SHOW_UNRESOLVED") return { kind: "HOLD_NO_SHOW_UNRESOLVED" };
      return { kind: "INCONSISTENT_SESSION_FACTS" };
    default:
      return { kind: "INCONSISTENT_SESSION_FACTS" };
  }
}

/**
 * Shared predicate: "does the authoritative Session outcome, on its own,
 * ever permit this earning to be paid at all" — COMPLETED or
 * NO_SHOW+STUDENT_NO_SHOW, exactly the two ELIGIBLE_AT_VIA_* decision
 * branches above. Reused in two places or (task §9 hardening —
 * markEligibleEarnings must not promote PENDING_ELIGIBLE -> ELIGIBLE from
 * eligibleAt alone; this is its second, authoritative gate) and (this
 * engine's own TRANSFERRED/ELIGIBLE conflict check below, task §7) — one
 * shared definition, not two independently-maintained copies of "which
 * outcomes justify payment."
 */
export function isSessionEligibleForPayment(
  facts: Pick<SessionFinancialFacts, "sessionStatus" | "noShowOutcome">
): boolean {
  if (facts.sessionStatus === "COMPLETED") return true;
  if (facts.sessionStatus === "NO_SHOW" && facts.noShowOutcome === "STUDENT_NO_SHOW") return true;
  return false;
}

export type TutorEarningConvergenceOutcome =
  | "NO_SESSION"
  | "NO_EARNING"
  | "NOT_DUE"
  | "CANCELLED_FIREWALL"
  | "CANCELLED_EARNING_PRESERVED"
  | "ELIGIBLE_AT_SET_VIA_COMPLETION"
  | "ELIGIBLE_AT_SET_VIA_STUDENT_NO_SHOW"
  | "ELIGIBLE_AT_ALREADY_SET"
  | "HELD_VIA_TUTOR_NO_SHOW"
  | "HELD_VIA_NO_SHOW_UNRESOLVED"
  | "HELD_VIA_INTERRUPTED"
  | "HELD_ALREADY"
  | "TRANSFERRED_CONSISTENT"
  | "TRANSFERRED_RECONCILIATION_REQUIRED"
  | "ELIGIBLE_CONSISTENT"
  | "ELIGIBLE_RECONCILIATION_REQUIRED"
  | "INCONSISTENT_SESSION_FACTS";

export interface TutorEarningConvergenceResult {
  bookingId: string;
  outcome: TutorEarningConvergenceOutcome;
  earningId: string | null;
  /** Authoritative POST-operation status — re-read after any write, exactly
   * like every other convergence entrypoint in this codebase. */
  earningStatus: TutorEarningStatus | null;
  eligibleAt: Date | null;
  /** True whenever a TRANSFERRED or ELIGIBLE earning's current state
   * conflicts with what the authoritative Session outcome would have
   * permitted (task §7). Never auto-corrected — see this function's own
   * firewall handling below. */
  reconciliationRequired: boolean;
  /** True ONLY when THIS invocation's own guarded write actually changed a
   * row — never true for an idempotent no-op / already-converged / firewall
   * observation. */
  mutated: boolean;
}

function unchangedResult(
  bookingId: string,
  outcome: TutorEarningConvergenceOutcome,
  earning: { id: string; status: TutorEarningStatus; eligibleAt: Date | null } | null,
  reconciliationRequired = false
): TutorEarningConvergenceResult {
  return {
    bookingId,
    outcome,
    earningId: earning?.id ?? null,
    earningStatus: earning?.status ?? null,
    eligibleAt: earning?.eligibleAt ?? null,
    reconciliationRequired,
    mutated: false,
  };
}

/**
 * THE financial convergence engine (task §5) — "please converge this
 * booking's TutorEarning against its authoritative Session outcome, right
 * now." Server-side only (no client input beyond bookingId + an injectable
 * clock kept only for the completed-vs-not-yet-due symmetry with every
 * other convergence entrypoint in this codebase — the decision itself never
 * depends on `now`, since eligibility ANCHORS are set once and promotion to
 * ELIGIBLE is a separate, later concern owned by markEligibleEarnings).
 * Idempotent, retry-safe, concurrency-safe: mirrors
 * resolveSessionCompletionConvergence / resolveSessionNoShowConvergence's
 * own shape exactly — read authoritative facts inside a Serializable
 * transaction, decide via a pure function, perform (at most) one guarded
 * `updateMany` keyed on the exact expected prior state, re-read
 * authoritatively, return.
 *
 * FIREWALLS (task §7/§8), checked BEFORE the decision function ever runs,
 * because they are about the EARNING's own current status, not the Session
 * outcome:
 *  - CANCELLED earning: preserved unconditionally — H.8 owns this
 *    exclusively (cancellationPolicy.ts is the only writer of
 *    TutorEarningStatus.CANCELLED anywhere in this codebase, and Phase 5B
 *    must not modify that file or dilute this semantic).
 *  - TRANSFERRED / ELIGIBLE earning: immutable to this engine either way —
 *    never clawed back, never re-held. If the current Session outcome does
 *    NOT justify payment (isSessionEligibleForPayment), that is flagged
 *    (audited + reconciliationRequired: true) and returned, never silently
 *    corrected. TRANSFERRED is the task's own explicit requirement (§7);
 *    ELIGIBLE is extended the identical treatment here as a deliberate,
 *    conservative judgment call (documented in the Phase 5B report) — an
 *    ELIGIBLE earning already sits in the "about to be transferred" queue
 *    (createTransferForEarning may already be racing it toward Stripe), so
 *    silently reverting it to HELD would be exactly the kind of "backward
 *    transition on financial state already in motion" task §6 forbids for
 *    TRANSFERRED, just one status earlier.
 *  - HELD earning: every Session state that produces HELD is terminal (no
 *    writer ever transitions a Session_ away from NO_SHOW/INTERRUPTED), so
 *    a HELD earning can never legitimately need reconciliation — observed
 *    and returned as-is.
 *
 * Only a PENDING_ELIGIBLE earning is ever actively converged (a status
 * transition or an eligibleAt write). The two write guards below are
 * deliberately DIFFERENT shapes, both important:
 *  - ELIGIBLE_AT_VIA_*: guarded on `status: PENDING_ELIGIBLE, eligibleAt:
 *    null` — write-once, exactly like Session_.noShowConvergedAt (Phase
 *    5A). This is what makes the engine SAFE to run against legacy rows
 *    (task §10): a PENDING_ELIGIBLE row whose eligibleAt is already
 *    populated (the pre-Phase-5B writer) is structurally never touched by
 *    this branch — no blind rewrite of a legacy value ever happens here.
 *  - HOLD_*: guarded on `status: PENDING_ELIGIBLE` alone (eligibleAt is
 *    unconditionally nulled). This IS allowed to fire against a legacy row
 *    with a stale non-null eligibleAt — moving PENDING_ELIGIBLE (with a
 *    wall-clock eligibleAt that Session truth has now proven wrong) to
 *    HELD (eligibleAt null) is strictly SAFETY-TIGHTENING: it can only ever
 *    remove a false eligibility signal, never grant one. This is a
 *    self-healing correction, not the "blind destructive rewrite" task §10
 *    forbids.
 */
export async function convergeTutorEarningFromSession(
  bookingId: string,
  options: { clock?: () => Date } = {}
): Promise<TutorEarningConvergenceResult> {
  const clock = options.clock ?? (() => new Date());
  void clock; // reserved for parity with every other convergence entrypoint; the decision below is time-independent by design (see doc comment)

  return withSerializableRetry(() =>
    db.$transaction(
      async (tx) => {
        const facts = await getSessionFinancialFacts(tx, bookingId);
        if (!facts) {
          return unchangedResult(bookingId, "NO_SESSION", null);
        }

        const earning = await tx.tutorEarning.findUnique({ where: { bookingId } });
        if (!earning) {
          return unchangedResult(bookingId, "NO_EARNING", null);
        }

        if (earning.status === "CANCELLED") {
          return unchangedResult(bookingId, "CANCELLED_EARNING_PRESERVED", earning);
        }

        if (earning.status === "TRANSFERRED" || earning.status === "ELIGIBLE") {
          const consistent = isSessionEligibleForPayment(facts);
          if (!consistent) {
            await writeAuditLog(
              {
                actorUserId: null,
                action:
                  earning.status === "TRANSFERRED"
                    ? "tutor_earning.reconciliation_required_transferred"
                    : "tutor_earning.reconciliation_required_eligible",
                entityType: "TutorEarning",
                entityId: earning.id,
                metadata: { bookingId, sessionStatus: facts.sessionStatus, noShowOutcome: facts.noShowOutcome },
              },
              tx
            );
          }
          const outcome: TutorEarningConvergenceOutcome = consistent
            ? earning.status === "TRANSFERRED"
              ? "TRANSFERRED_CONSISTENT"
              : "ELIGIBLE_CONSISTENT"
            : earning.status === "TRANSFERRED"
              ? "TRANSFERRED_RECONCILIATION_REQUIRED"
              : "ELIGIBLE_RECONCILIATION_REQUIRED";
          return unchangedResult(bookingId, outcome, earning, !consistent);
        }

        if (earning.status === "HELD") {
          return unchangedResult(bookingId, "HELD_ALREADY", earning);
        }

        // earning.status === "PENDING_ELIGIBLE" — the only status this
        // engine actively converges.
        const decision = decideTutorEarningConvergence({
          sessionStatus: facts.sessionStatus,
          completedAt: facts.completedAt,
          noShowConvergedAt: facts.noShowConvergedAt,
          noShowOutcome: facts.noShowOutcome,
        });

        switch (decision.kind) {
          case "NOT_DUE":
            return unchangedResult(bookingId, "NOT_DUE", earning);

          case "CANCELLED_FIREWALL":
            // H.8's own cancellation transaction voids Session_ and
            // TutorEarning atomically in the SAME transaction (cancellationPolicy.ts
            // steps 8-9) — a separately-read PENDING_ELIGIBLE earning
            // paired with an already-committed CANCELLED Session_ is not a
            // reachable state; this branch exists only for completeness.
            return unchangedResult(bookingId, "CANCELLED_FIREWALL", earning);

          case "INCONSISTENT_SESSION_FACTS": {
            await writeAuditLog(
              {
                actorUserId: null,
                action: "tutor_earning.reconciliation_required_inconsistent_facts",
                entityType: "TutorEarning",
                entityId: earning.id,
                metadata: { bookingId, sessionStatus: facts.sessionStatus },
              },
              tx
            );
            return unchangedResult(bookingId, "INCONSISTENT_SESSION_FACTS", earning, true);
          }

          case "ELIGIBLE_AT_VIA_COMPLETION":
          case "ELIGIBLE_AT_VIA_STUDENT_NO_SHOW": {
            const updated = await tx.tutorEarning.updateMany({
              where: { id: earning.id, status: "PENDING_ELIGIBLE", eligibleAt: null },
              data: { eligibleAt: decision.eligibleAt },
            });
            const mutated = updated.count === 1;
            const final = await tx.tutorEarning.findUniqueOrThrow({ where: { id: earning.id } });
            if (mutated) {
              await writeAuditLog(
                {
                  actorUserId: null,
                  action:
                    decision.kind === "ELIGIBLE_AT_VIA_COMPLETION"
                      ? "tutor_earning.eligibility_anchor_set_completion"
                      : "tutor_earning.eligibility_anchor_set_student_no_show",
                  entityType: "TutorEarning",
                  entityId: earning.id,
                  metadata: { bookingId, eligibleAt: decision.eligibleAt.toISOString() },
                },
                tx
              );
            }
            const outcome: TutorEarningConvergenceOutcome = mutated
              ? decision.kind === "ELIGIBLE_AT_VIA_COMPLETION"
                ? "ELIGIBLE_AT_SET_VIA_COMPLETION"
                : "ELIGIBLE_AT_SET_VIA_STUDENT_NO_SHOW"
              : "ELIGIBLE_AT_ALREADY_SET";
            return {
              bookingId,
              outcome,
              earningId: final.id,
              earningStatus: final.status,
              eligibleAt: final.eligibleAt,
              reconciliationRequired: false,
              mutated,
            };
          }

          case "HOLD_TUTOR_NO_SHOW":
          case "HOLD_NO_SHOW_UNRESOLVED":
          case "HOLD_INTERRUPTED": {
            const updated = await tx.tutorEarning.updateMany({
              where: { id: earning.id, status: "PENDING_ELIGIBLE" },
              data: { status: "HELD", eligibleAt: null },
            });
            const mutated = updated.count === 1;
            const final = await tx.tutorEarning.findUniqueOrThrow({ where: { id: earning.id } });
            if (mutated) {
              const action =
                decision.kind === "HOLD_TUTOR_NO_SHOW"
                  ? "tutor_earning.held_tutor_no_show"
                  : decision.kind === "HOLD_NO_SHOW_UNRESOLVED"
                    ? "tutor_earning.held_no_show_unresolved"
                    : "tutor_earning.held_interrupted";
              await writeAuditLog({ actorUserId: null, action, entityType: "TutorEarning", entityId: earning.id, metadata: { bookingId } }, tx);
            }
            const outcome: TutorEarningConvergenceOutcome = mutated
              ? decision.kind === "HOLD_TUTOR_NO_SHOW"
                ? "HELD_VIA_TUTOR_NO_SHOW"
                : decision.kind === "HOLD_NO_SHOW_UNRESOLVED"
                  ? "HELD_VIA_NO_SHOW_UNRESOLVED"
                  : "HELD_VIA_INTERRUPTED"
              : "HELD_ALREADY";
            return {
              bookingId,
              outcome,
              earningId: final.id,
              earningStatus: final.status,
              eligibleAt: final.eligibleAt,
              reconciliationRequired: false,
              mutated,
            };
          }

          default: {
            const _exhaustive: never = decision;
            throw new Error(`convergeTutorEarningFromSession: unreachable decision ${JSON.stringify(_exhaustive)}`);
          }
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
}

export interface SweepTutorEarningConvergenceResult {
  evaluated: number;
  converged: number;
  reconciliationRequired: number;
}

/**
 * Liveness sweep — the cron-callable entrypoint, mirroring
 * sweepDueNoShowConvergence / sweepDueSessionCompletionConvergence's own
 * shape exactly (find candidates, call the single standalone entrypoint per
 * candidate, tally). Wired from tutorTransfers.ts's processEligibleTransfers
 * (the FINANCIAL cron sweep), never from sessionLifecycle.ts or its own cron
 * route — preserving the task §1 architectural boundary at the wiring level
 * too, not merely inside this file.
 *
 * Every PENDING_ELIGIBLE earning is a candidate (not just ones with a
 * populated eligibleAt) — this is what lets a fresh earning whose Session
 * has just reached COMPLETED/NO_SHOW/INTERRUPTED actually converge, and
 * also what lets a legacy PENDING_ELIGIBLE row with a stale eligibleAt
 * self-heal to HELD when Session truth says it should be (see this file's
 * own convergeTutorEarningFromSession doc comment on the two different
 * write-guard shapes).
 */
export async function sweepTutorEarningConvergence(limit = 200): Promise<SweepTutorEarningConvergenceResult> {
  const candidates = await db.tutorEarning.findMany({
    where: { status: "PENDING_ELIGIBLE" },
    select: { bookingId: true },
    take: limit,
  });

  let converged = 0;
  let reconciliationRequired = 0;
  for (const candidate of candidates) {
    const result = await convergeTutorEarningFromSession(candidate.bookingId);
    if (result.mutated) converged++;
    if (result.reconciliationRequired) reconciliationRequired++;
  }
  return { evaluated: candidates.length, converged, reconciliationRequired };
}
