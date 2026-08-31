import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { TutoringRequest, TutoringRequestStatus } from "@/generated/prisma/client";
import { notifyUser } from "@/lib/notify";
import { writeAuditLog } from "@/lib/audit";
import { getEligibleTutors } from "@/services/tutorEligibility";
import { rankCandidates } from "@/services/tutorRanking";
import { createTutorPayoutQuoteWithTx, cancelTutorPayoutQuote, TutorPayoutRuleNotFoundError, NegativeSpreadError } from "@/services/tutorPayout";
import { cancelLockedCustomerPriceQuote } from "@/services/customerPricing";

/**
 * The single orchestrator entry point — called (a) right after a request
 * moves CONFIRMED -> MATCHING, (b) after a tutor declines, (c) after a
 * candidate loses the accept-time overlap check (bookingCreation.ts's
 * hasOverlappingActiveBooking — a candidate-level failure, not a
 * request-level one), and (d) from expireStaleInvitationsAndAdvance for
 * timeouts (lazy-on-read + the cron tick route). Idempotent and
 * self-guarding: if there's already a live PENDING invitation, or the
 * request isn't MATCHING, or a concurrent call already advanced the round,
 * this is a no-op.
 */
export async function advanceDispatch(tutoringRequestId: string): Promise<void> {
  try {
    await db.$transaction(
      async (tx) => {
        const request = await tx.tutoringRequest.findUnique({ where: { id: tutoringRequestId } });
        if (!request || request.status !== "MATCHING") return;

        const pendingCount = await tx.tutorInvitation.count({
          where: { tutoringRequestId, status: "PENDING" },
        });
        if (pendingCount > 0) return; // still waiting on an active round

        const settings = await tx.tutorRankingSettings.findFirst();
        if (!settings) throw new Error("TutorRankingSettings is not seeded — run prisma db seed");

        const attemptsSoFar = await tx.tutorInvitation.count({ where: { tutoringRequestId } });

        let inviteCount: number;
        let isParallelRound: boolean;
        if (attemptsSoFar < settings.sequentialInvitationCount) {
          inviteCount = 1;
          isParallelRound = false;
        } else if (attemptsSoFar < settings.maxDispatchAttempts) {
          // PROD-DISPATCHFIX1 — must be `>=`/`<` (a range check), not
          // `attemptsSoFar === settings.sequentialInvitationCount` (an exact-
          // equality check). The old condition could only ever be true once,
          // at the single instant attemptsSoFar exactly equaled
          // sequentialInvitationCount — so only one parallel batch was ever
          // dispatched, no matter how much headroom remained under
          // maxDispatchAttempts. Every subsequent round (attemptsSoFar now
          // past that one value) fell through to the else branch below and
          // closed the request to NO_TUTOR_FOUND prematurely. This range
          // check re-enters the parallel branch on every round for as long
          // as budget remains, producing as many batches as fit.
          inviteCount = Math.min(settings.parallelBatchSize, settings.maxDispatchAttempts - attemptsSoFar);
          isParallelRound = true;
        } else {
          await closeTutoringRequest(tx, request, "NO_TUTOR_FOUND");
          return;
        }

        const eligible = await getEligibleTutors(tx, {
          id: tutoringRequestId,
          subjectId: request.subjectId,
          academicLevelId: request.academicLevelId,
          tutoringMode: request.tutoringMode,
          requestedStartAt: request.requestedStartAt,
          durationMinutes: request.durationMinutes,
          city: request.city,
        });

        if (eligible.length === 0) {
          await closeTutoringRequest(tx, request, "NO_TUTOR_FOUND");
          return;
        }

        const userIdByTutorProfileId = new Map(eligible.map((t) => [t.id, t.userId]));
        const ranked = await rankCandidates(tx, eligible);

        // Guarded advance: only proceed if this request's dispatchRound
        // hasn't already moved past what we just read — protects against
        // concurrent dispatch-step invocations racing (§7 scenario 7).
        const newRound = request.dispatchRound + 1;
        const advanced = await tx.tutoringRequest.updateMany({
          where: { id: tutoringRequestId, status: "MATCHING", dispatchRound: request.dispatchRound },
          data: { dispatchRound: newRound },
        });
        if (advanced.count === 0) return; // another process already advanced this request

        const expiresAt = new Date(Date.now() + settings.responseWindowMinutes * 60 * 1000);
        let created = 0;

        for (const candidate of ranked) {
          if (created >= inviteCount) break;
          try {
            const payoutQuote = await createTutorPayoutQuoteWithTx(
              tx,
              {
                tutorProfileId: candidate.tutorProfileId,
                subjectId: request.subjectId,
                academicLevelId: request.academicLevelId,
                tutoringMode: request.tutoringMode,
                durationMinutes: request.durationMinutes,
                requestedStartAt: request.requestedStartAt,
              },
              request.customerPriceQuoteId! // non-null once CONFIRMED, which MATCHING implies
            );

            const invitation = await tx.tutorInvitation.create({
              data: {
                tutoringRequestId,
                tutorProfileId: candidate.tutorProfileId,
                tutorPayoutQuoteId: payoutQuote.id,
                dispatchRound: newRound,
                isParallelRound,
                status: "PENDING",
                rankScore: candidate.rankScore,
                rankBreakdown: candidate.rankBreakdown,
                rankingVersion: candidate.rankingVersion,
                expiresAt,
              },
            });

            await writeAuditLog(
              {
                action: "quickmatch.invitation.dispatched",
                entityType: "TutorInvitation",
                entityId: invitation.id,
                metadata: { tutoringRequestId, tutorProfileId: candidate.tutorProfileId, dispatchRound: newRound, isParallelRound },
              },
              tx
            );

            const tutorUserId = userIdByTutorProfileId.get(candidate.tutorProfileId);
            if (tutorUserId) {
              await notifyUser(tx, {
                userId: tutorUserId,
                type: "quickmatch.invitation.new",
                title: "New tutoring request",
                body: "You have a new tutoring request waiting for your response.",
                metadata: { tutoringRequestId, tutorInvitationId: invitation.id },
              });
            }

            created++;
          } catch (err) {
            if (err instanceof TutorPayoutRuleNotFoundError || err instanceof NegativeSpreadError) continue;
            throw err;
          }
        }

        if (created === 0) {
          // Nobody in the ranked list could actually be offered a payout —
          // functionally equivalent to no eligible tutors.
          await closeTutoringRequest(tx, request, "NO_TUTOR_FOUND");
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    // A rare Serializable conflict with a concurrent dispatch-step call for
    // the same request is not fatal — the lazy-expiry-on-read path or the
    // next trigger (decline/timeout/cron) will simply try again. Dispatch
    // correctness never depends on this call succeeding on every attempt.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") return;
    throw err;
  }
}

/**
 * Shared terminal-transition helper — used both by advanceDispatch's
 * internal NO_TUTOR_FOUND path and by tutoringRequests.ts's cancel action
 * (MATCHING -> CANCELLED). Only transitions a request that is currently
 * MATCHING (the updateMany's WHERE guard) — a concurrent transition (e.g.
 * a tutor just won) simply loses the race silently, matching every other
 * guarded-transition pattern in this phase.
 *
 * §4a invariant: once this returns true, every PENDING invitation for the
 * request is CANCELLED, every not-yet-consumed TutorPayoutQuote tied to
 * them is CANCELLED, the LOCKED CustomerPriceQuote is CANCELLED (never
 * CONSUMED — no Booking exists), and dispatchRound/bookkeeping are closed:
 * advanceDispatch's own first check (status !== "MATCHING") prevents any
 * future call from creating a new TutorInvitation against this row.
 */
export async function closeTutoringRequest(
  tx: Prisma.TransactionClient,
  request: Pick<TutoringRequest, "id" | "customerPriceQuoteId">,
  toStatus: Extract<TutoringRequestStatus, "CANCELLED" | "NO_TUTOR_FOUND" | "FAILED">
): Promise<boolean> {
  const updated = await tx.tutoringRequest.updateMany({
    where: { id: request.id, status: "MATCHING" },
    data: toStatus === "CANCELLED" ? { status: toStatus, cancelledAt: new Date() } : { status: toStatus },
  });
  if (updated.count === 0) return false;

  const pendingInvitations = await tx.tutorInvitation.findMany({
    where: { tutoringRequestId: request.id, status: "PENDING" },
    select: { id: true, tutorPayoutQuoteId: true },
  });
  if (pendingInvitations.length > 0) {
    await tx.tutorInvitation.updateMany({
      where: { tutoringRequestId: request.id, status: "PENDING" },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });
    for (const invitation of pendingInvitations) {
      if (invitation.tutorPayoutQuoteId) await cancelTutorPayoutQuote(tx, invitation.tutorPayoutQuoteId);
    }
  }

  if (request.customerPriceQuoteId) {
    await cancelLockedCustomerPriceQuote(tx, request.customerPriceQuoteId);
  }

  const actionSuffix = toStatus === "CANCELLED" ? "cancelled" : toStatus === "NO_TUTOR_FOUND" ? "noTutorFound" : "failed";
  await writeAuditLog(
    { action: `quickmatch.request.${actionSuffix}`, entityType: "TutoringRequest", entityId: request.id },
    tx
  );

  return true;
}

/**
 * Lazy-expiry-on-read primary mechanism (no cron/queue infra exists in this
 * repo) — call from any read path that touches a MATCHING request or a
 * tutor's invitation list, and from the external cron-tick route
 * (/api/cron/quick-match-tick) as a liveness backstop for abandoned
 * requests nobody is actively viewing.
 */
export async function expireStaleInvitationsAndAdvance(): Promise<void> {
  const now = new Date();
  const stale = await db.tutorInvitation.findMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    select: { id: true, tutoringRequestId: true },
  });
  if (stale.length === 0) return;

  const affectedRequestIds = new Set<string>();
  for (const invitation of stale) {
    const result = await db.tutorInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" }, // guards a race with a just-in-time accept/decline
      data: { status: "EXPIRED", respondedAt: new Date() },
    });
    if (result.count > 0) affectedRequestIds.add(invitation.tutoringRequestId);
  }

  for (const requestId of affectedRequestIds) {
    await advanceDispatch(requestId);
  }
}
