import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { TutoringMode } from "@/generated/prisma/enums";
import { canInitiatePaidBooking } from "@/services/studentAuthorization";
import { writeAuditLog } from "@/lib/audit";
import { withSerializableRetry } from "@/lib/serializableRetry";
import { NotAuthorizedForLearnerError } from "@/services/bookingCreation";

export { NotAuthorizedForLearnerError };

/**
 * Golden Path P0 — Quick Match active-request backend invariant.
 *
 * The authoritative set of TutoringRequestStatus values that represent a
 * genuinely ACTIVE customer Quick Match — one still in flight toward a
 * Booking, that must not be allowed to coexist with a second simultaneous
 * request for the same learner. Independently audited against the actual
 * lifecycle code (not inferred from enum names alone):
 *
 *  - DRAFT: never actually persisted by createTutoringRequestForLearner
 *    today (it always writes PRICED directly on create), but it IS the
 *    model's own schema default and cancelTutoringRequestAction
 *    (src/lib/actions/tutoringRequests.ts) already treats it identically to
 *    PRICED for cancellation purposes — i.e. the existing code already
 *    models DRAFT as an in-progress, pre-payment stage of the same one
 *    active flow. Included here for the same reason: defensive
 *    correctness/consistency with that existing treatment, at zero cost
 *    today since no row can currently have this status.
 *  - PRICED: priced, awaiting the customer's payment confirmation. Active.
 *  - CONFIRMED: per confirmTutoringRequestAction's own comment, "PRICED ->
 *    CONFIRMED -> MATCHING happens as one atomic step... there is no
 *    independently observable 'confirmed but not yet matching' instant
 *    worth persisting" — the actual write goes PRICED -> MATCHING directly,
 *    so no row is ever currently persisted with status CONFIRMED either.
 *    Included for the same defensive-correctness reason as DRAFT: it is the
 *    schema's own named mid-flow state, costs nothing to include, and
 *    protects correctness if a future change ever does persist it.
 *  - MATCHING: dispatch is actively running (quickMatchDispatch.ts). Active.
 *  - PAYMENT_PENDING: a tutor has locally claimed the win and payment
 *    capture is in flight (src/lib/actions/tutorInvitations.ts). Active.
 *
 * Terminal (NOT active — must never block a new Quick Match):
 *  - BOOKED: a Booking was successfully created; the TutoringRequest has
 *    completed its matching purpose (src/services/payments.ts's
 *    convergeToCaptured only ever writes BOOKED from PAYMENT_PENDING, and
 *    nothing in the codebase ever transitions a request back out of
 *    BOOKED). Purely historical from Quick Match's point of view.
 *  - PAYMENT_FAILED: per its own schema doc comment, reached only from
 *    PAYMENT_PENDING when capture definitively fails
 *    (convergeToCaptureFailed, src/services/payments.ts) — a
 *    request-level, not candidate-level, outcome. Confirmed by tracing
 *    every write site: "PAYMENT_FAILED" is written in exactly one place
 *    (convergeToCaptureFailed) and never appears in any `where` filter
 *    anywhere in the codebase — there is no "retry payment on the same
 *    request" code path. Terminal.
 *  - CANCELLED: written by cancelTutoringRequestAction and
 *    closeTutoringRequest; never transitioned onward. Terminal.
 *  - EXPIRED: defined on the enum but, like DRAFT/CONFIRMED, never actually
 *    written anywhere for TutoringRequest today (the only production
 *    "EXPIRED" writes in this area are TutorInvitation.status, a distinct
 *    enum). By strong analogy with every other "EXPIRED" status in this
 *    codebase (CustomerPriceQuote, TutorPayoutQuote, TutorInvitation — all
 *    terminal, "validity window lapsed"), and by its plain name, classified
 *    terminal.
 *  - NO_TUTOR_FOUND: written by closeTutoringRequest when dispatch is
 *    exhausted with no eligible/payable candidate; cancels pending
 *    invitations/quotes and never advances further. Terminal.
 *  - FAILED: also only reachable via closeTutoringRequest, for "genuine
 *    unexpected server error during acceptance" — currently unreached by
 *    any call site (closeTutoringRequest is only ever invoked with
 *    NO_TUTOR_FOUND or CANCELLED today), but by the same closeTutoringRequest
 *    contract (only fires from MATCHING, never reversed) it is terminal by
 *    construction.
 *
 * DISCREPANCY FROM CODEX'S INFERRED SET: Codex's local/uncommitted frontend
 * work inferred the active set as exactly {PRICED, CONFIRMED, MATCHING,
 * PAYMENT_PENDING}. This audit concludes {DRAFT, PRICED, CONFIRMED,
 * MATCHING, PAYMENT_PENDING} — one status wider (DRAFT). This has NO
 * observable behavioral effect today (no code path currently persists a
 * DRAFT TutoringRequest row), but is a genuine, deliberate categorization
 * difference, not an oversight: cancelTutoringRequestAction already treats
 * DRAFT as equivalent to PRICED, and this guard is kept consistent with
 * that existing precedent rather than silently narrowing to Codex's set.
 */
export const ACTIVE_TUTORING_REQUEST_STATUSES = [
  "DRAFT",
  "PRICED",
  "CONFIRMED",
  "MATCHING",
  "PAYMENT_PENDING",
] as const;

/** Golden Path P0 — the actor already has an in-flight Quick Match for this
 * exact learner (see ACTIVE_TUTORING_REQUEST_STATUSES above for the
 * authoritative active-status set and its rationale). */
export class ActiveTutoringRequestExistsError extends Error {}

export interface CreateTutoringRequestForLearnerInput {
  actorUserId: string;
  studentProfileId: string;
  subjectId: string;
  academicLevelId?: string | null;
  tutoringMode: TutoringMode;
  durationMinutes: number;
  requestedStartAt: Date;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  currency: string;
  customerPriceQuoteId: string;
}

/**
 * Golden Path P0 — the transaction-bound duplicate-active-request guard.
 * Scoped by studentProfileId (the learner), NOT createdByUserId (the
 * actor) — the same scoping key TutoringRequest's own indexes already use
 * (`@@index([studentProfileId, status])` in prisma/schema.prisma) and the
 * same key the Quick Match page itself looks up "the" current request by
 * (src/app/[locale]/dashboard/quick-match/page.tsx). This deliberately
 * covers the case a Parent-guardian and the learner's own login (or two
 * different active guardians) both try to start a Quick Match for the SAME
 * learner concurrently — "same customer" (createdByUserId) is not the right
 * key, since the product invariant is "one active Quick Match per learner
 * slot," not "one active Quick Match per initiating account." A pure
 * existence check, no decision logic — deliberately mirrors
 * hasOverlappingActiveBooking's shape in bookingCreation.ts.
 */
export async function hasActiveTutoringRequest(
  tx: Prisma.TransactionClient,
  studentProfileId: string
): Promise<boolean> {
  const existing = await tx.tutoringRequest.findFirst({
    where: { studentProfileId, status: { in: [...ACTIVE_TUTORING_REQUEST_STATUSES] } },
    select: { id: true },
  });
  return existing != null;
}

/**
 * Phase H.7 (§17/§21) — the authoritative TutoringRequest-creation mutation,
 * extracted as its own directly-testable service function (mirroring
 * bookingCreation.ts's reserveBookingPendingPayment) rather than living
 * inline inside the "use server" action, so the mandatory transaction-bound
 * re-check can be exercised by a permanent integration test without going
 * through the Next.js Server Action runtime. Called from inside a
 * Serializable transaction by createTutoringRequestAction, immediately
 * after the CustomerPriceQuote has been created (which opens its own,
 * separate RepeatableRead transaction — see customerPricing.ts) — this
 * function re-verifies `canInitiatePaidBooking` fresh, inside ITS OWN
 * transaction, closing the TOCTOU window between the action's outer
 * pre-check and this exact write.
 */
export async function createTutoringRequestForLearner(
  tx: Prisma.TransactionClient,
  input: CreateTutoringRequestForLearnerInput
) {
  const authorized = await canInitiatePaidBooking(tx, input.actorUserId, input.studentProfileId);
  if (!authorized) throw new NotAuthorizedForLearnerError();

  // Golden Path P0 — the duplicate-active-request guard, fresh-read and
  // count-checked inside this SAME transaction (never a separate pre-check
  // transaction), immediately before the create — closing the TOCTOU/
  // write-skew window the same way hasOverlappingActiveBooking's call site
  // in reserveBookingPendingPayment does for tutor-slot conflicts.
  const alreadyActive = await hasActiveTutoringRequest(tx, input.studentProfileId);
  if (alreadyActive) throw new ActiveTutoringRequestExistsError();

  const request = await tx.tutoringRequest.create({
    data: {
      createdByUserId: input.actorUserId,
      studentProfileId: input.studentProfileId,
      subjectId: input.subjectId,
      academicLevelId: input.academicLevelId ?? null,
      tutoringMode: input.tutoringMode,
      durationMinutes: input.durationMinutes,
      requestedStartAt: input.requestedStartAt,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      province: input.province ?? null,
      postalCode: input.postalCode ?? null,
      notes: input.notes ?? null,
      currency: input.currency,
      customerPriceQuoteId: input.customerPriceQuoteId,
      status: "PRICED",
    },
  });

  await writeAuditLog(
    {
      actorUserId: input.actorUserId,
      action: "quickmatch.request.created",
      entityType: "TutoringRequest",
      entityId: request.id,
    },
    tx
  );

  return request;
}

/**
 * Convenience wrapper opening its own Serializable transaction — used by
 * the Server Action, which doesn't otherwise need direct transaction
 * control. Tests call createTutoringRequestForLearner directly against
 * their own transaction so they can inspect state before/after precisely.
 *
 * Golden Path P0 — wrapped in withSerializableRetry (src/lib/
 * serializableRetry.ts), reusing the exact shared primitive already applied
 * around reserveBookingPendingPayment's call sites (P0 Booking Serializable
 * Retry Hardening) and cancelBookingWithRefund/convergeTutorEarningFromSession
 * before that — never a second retry implementation. The duplicate-active-
 * request guard added above is a genuine write-skew hazard under
 * Serializable isolation (two concurrent creates for the same
 * studentProfileId can each read "no active row exists" before either
 * commits); Postgres's Serializable isolation detects this and aborts one
 * side with a 40001 conflict, which withSerializableRetry retries with a
 * brand-new transaction that re-reads fresh state — resolving to a correct
 * ActiveTutoringRequestExistsError rejection rather than a raw, unretried
 * serialization failure. Every read/write in createTutoringRequestForLearner
 * goes through the `tx` this wrapper opens, with no ambient `db` writes and
 * no network call anywhere in that closure, so an aborted attempt rolls back
 * atomically and a retry is always safe.
 */
export async function createTutoringRequestForLearnerInOwnTransaction(
  client: PrismaClient,
  input: CreateTutoringRequestForLearnerInput
) {
  return withSerializableRetry(() =>
    client.$transaction((tx) => createTutoringRequestForLearner(tx, input), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  );
}
