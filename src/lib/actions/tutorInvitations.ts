"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { respondTutorInvitationSchema, declineTutorInvitationSchema } from "@/schemas/tutoringRequest";
import { isTutorEligibleForRequest } from "@/services/tutorEligibility";
import { createBookingFromQuotes, SlotTakenError } from "@/services/bookingCreation";
import {
  acceptTutorPayoutQuote,
  cancelTutorPayoutQuote,
  TutorPayoutQuoteNotFoundError,
  TutorPayoutQuoteExpiredError,
  TutorPayoutQuoteNotActiveError,
  TutorPayoutQuoteAlreadyAcceptedError,
} from "@/services/tutorPayout";
import {
  QuoteNotFoundError,
  QuoteNotOwnedError,
  QuoteExpiredError,
  QuoteAlreadyConsumedError,
  QuoteNotActiveError,
  QuoteContextMismatchError,
} from "@/services/customerPricing";
import { advanceDispatch } from "@/services/quickMatchDispatch";

export type InvitationActionState = { error?: string; success?: boolean } | undefined;

class InvitationNotPendingError extends Error {}
class InvitationExpiredError extends Error {}
class TutorNotEligibleError extends Error {}

/**
 * §7b's full revalidation list, run inside one Serializable transaction:
 * (1) request still MATCHING, (2) invitation still PENDING, (3) not
 * expired, (4) payout quote in the legal state, (5)/(6) tutor still passes
 * every eligibility check, (7) no overlapping active Booking for this tutor
 * — the genuinely new check this round (§7a/§7c), enforced by
 * createBookingFromQuotes' own hasOverlappingActiveBooking call, which is
 * the same interval-overlap logic isTutorEligibleForRequest's availability
 * check already uses, so a stale-availability race is caught twice.
 *
 * A SlotTakenError here is a candidate-level failure (§7c), not a
 * request-level one: the transaction rolls back, this specific invitation
 * and its payout quote are terminated, and dispatch continues to the next
 * candidate/round for the *request* — it does not become FAILED.
 */
export async function acceptTutorInvitationAction(
  _prevState: InvitationActionState,
  formData: FormData
): Promise<InvitationActionState> {
  const t = await getTranslations("quickMatch.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") return { error: t("notATutor") };

  const parsed = respondTutorInvitationSchema.safeParse({ tutorInvitationId: formData.get("tutorInvitationId") });
  if (!parsed.success) return { error: t("invalidInput") };

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: session.user.id } });
  if (!tutorProfile) return { error: t("invalidInput") };

  // Best-effort lookup only, for the catch block's dispatch-advance call —
  // not used for any authorization/state decision (those are all re-derived
  // inside the transaction below).
  const preflight = await db.tutorInvitation.findUnique({
    where: { id: parsed.data.tutorInvitationId },
    select: { tutoringRequestId: true },
  });

  try {
    await db.$transaction(
      async (tx) => {
        const invitation = await tx.tutorInvitation.findUnique({ where: { id: parsed.data.tutorInvitationId } });
        if (!invitation || invitation.tutorProfileId !== tutorProfile.id || invitation.status !== "PENDING") {
          throw new InvitationNotPendingError();
        }
        if (invitation.expiresAt < new Date()) throw new InvitationExpiredError();
        if (!invitation.tutorPayoutQuoteId) throw new InvitationNotPendingError();

        const request = await tx.tutoringRequest.findUnique({ where: { id: invitation.tutoringRequestId } });
        if (!request || request.status !== "MATCHING" || !request.customerPriceQuoteId) {
          throw new InvitationNotPendingError();
        }

        const stillEligible = await isTutorEligibleForRequest(tx, tutorProfile.id, {
          subjectId: request.subjectId,
          academicLevelId: request.academicLevelId,
          tutoringMode: request.tutoringMode,
          requestedStartAt: request.requestedStartAt,
          durationMinutes: request.durationMinutes,
          city: request.city,
        });
        if (!stillEligible) throw new TutorNotEligibleError();

        await acceptTutorPayoutQuote(tx, invitation.tutorPayoutQuoteId, tutorProfile.id);

        const endAt = new Date(request.requestedStartAt.getTime() + request.durationMinutes * 60 * 1000);
        const availabilityRow = await tx.tutorAvailability.findFirst({ where: { tutorProfileId: tutorProfile.id } });
        const timezone = availabilityRow?.timezone ?? "UTC";

        const { booking } = await createBookingFromQuotes(tx, {
          studentProfileId: request.studentProfileId,
          tutorProfileId: tutorProfile.id,
          subjectId: request.subjectId,
          academicLevelId: request.academicLevelId,
          startAt: request.requestedStartAt,
          endAt,
          timezone,
          mode: request.tutoringMode,
          createdByUserId: request.createdByUserId,
          customerPriceQuoteId: request.customerPriceQuoteId,
          tutorPayoutQuoteId: invitation.tutorPayoutQuoteId,
          tutoringRequestId: request.id,
          location:
            request.tutoringMode !== "ONLINE"
              ? {
                  addressLine1: request.addressLine1,
                  addressLine2: request.addressLine2,
                  city: request.city,
                  province: request.province,
                  postalCode: request.postalCode,
                }
              : null,
        });

        await tx.tutorInvitation.update({
          where: { id: invitation.id },
          data: { status: "ACCEPTED", respondedAt: new Date(), bookingId: booking.id },
        });

        const otherPending = await tx.tutorInvitation.findMany({
          where: { tutoringRequestId: request.id, status: "PENDING", id: { not: invitation.id } },
          select: { id: true, tutorPayoutQuoteId: true, tutorProfile: { select: { userId: true } } },
        });
        if (otherPending.length > 0) {
          await tx.tutorInvitation.updateMany({
            where: { id: { in: otherPending.map((other) => other.id) } },
            data: { status: "SUPERSEDED", respondedAt: new Date() },
          });
          for (const other of otherPending) {
            if (other.tutorPayoutQuoteId) await cancelTutorPayoutQuote(tx, other.tutorPayoutQuoteId);
            await notifyUser(tx, {
              userId: other.tutorProfile.userId,
              type: "quickmatch.invitation.superseded",
              title: "Request no longer available",
              body: "Another tutor accepted this request first.",
              metadata: { tutoringRequestId: request.id },
            });
          }
        }

        // Guarded — a concurrent accept for the same request (parallel
        // round) may have already flipped this to BOOKED; only one write
        // actually lands (§7 scenario 1).
        await tx.tutoringRequest.updateMany({
          where: { id: request.id, status: "MATCHING" },
          data: { status: "BOOKED", bookedAt: new Date() },
        });

        await writeAuditLog(
          {
            actorUserId: session.user.id,
            action: "quickmatch.invitation.accepted",
            entityType: "TutorInvitation",
            entityId: invitation.id,
            metadata: { tutoringRequestId: request.id, bookingId: booking.id },
          },
          tx
        );
        await writeAuditLog(
          {
            actorUserId: session.user.id,
            action: "quickmatch.booking.created",
            entityType: "Booking",
            entityId: booking.id,
            metadata: { tutoringRequestId: request.id },
          },
          tx
        );

        await notifyUser(tx, {
          userId: request.createdByUserId,
          type: "quickmatch.request.booked",
          title: "Tutor found!",
          body: "A tutor has accepted your request and your session is booked.",
          metadata: { tutoringRequestId: request.id, bookingId: booking.id },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (
      error instanceof SlotTakenError ||
      error instanceof InvitationNotPendingError ||
      error instanceof InvitationExpiredError ||
      error instanceof TutorNotEligibleError ||
      error instanceof TutorPayoutQuoteNotFoundError ||
      error instanceof TutorPayoutQuoteExpiredError ||
      error instanceof TutorPayoutQuoteNotActiveError ||
      error instanceof TutorPayoutQuoteAlreadyAcceptedError
    ) {
      // Candidate-level failure (§7c) — the request itself is not FAILED;
      // dispatch simply continues to the next candidate/round. Safe to call
      // even if another path already advanced this request (advanceDispatch
      // is a self-guarding no-op in that case).
      if (preflight?.tutoringRequestId) await advanceDispatch(preflight.tutoringRequestId);
      return { error: t("invitationNoLongerAvailable") };
    }
    if (
      error instanceof QuoteNotFoundError ||
      error instanceof QuoteNotOwnedError ||
      error instanceof QuoteExpiredError ||
      error instanceof QuoteAlreadyConsumedError ||
      error instanceof QuoteNotActiveError ||
      error instanceof QuoteContextMismatchError
    ) {
      return { error: t("pricingUnavailable") };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: t("invitationNoLongerAvailable") };
    }
    return { error: t("generic") };
  }

  revalidatePath("/tutor/quick-match");
  revalidatePath("/dashboard/quick-match");
  revalidatePath("/tutor/bookings");
  revalidatePath("/dashboard/bookings");
  return { success: true };
}

export async function declineTutorInvitationAction(
  _prevState: InvitationActionState,
  formData: FormData
): Promise<InvitationActionState> {
  const t = await getTranslations("quickMatch.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") return { error: t("notATutor") };

  const parsed = declineTutorInvitationSchema.safeParse({
    tutorInvitationId: formData.get("tutorInvitationId"),
    declineReason: formData.get("declineReason") ? String(formData.get("declineReason")) : undefined,
  });
  if (!parsed.success) return { error: t("invalidInput") };

  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: session.user.id } });
  if (!tutorProfile) return { error: t("invalidInput") };

  const invitation = await db.tutorInvitation.findUnique({ where: { id: parsed.data.tutorInvitationId } });
  if (!invitation || invitation.tutorProfileId !== tutorProfile.id) return { error: t("invalidInput") };

  const updated = await db.tutorInvitation.updateMany({
    where: { id: invitation.id, status: "PENDING" },
    data: { status: "DECLINED", respondedAt: new Date(), declineReason: parsed.data.declineReason ?? null },
  });
  if (updated.count === 0) return { error: t("invitationNoLongerAvailable") };

  await writeAuditLog({
    actorUserId: session.user.id,
    action: "quickmatch.invitation.declined",
    entityType: "TutorInvitation",
    entityId: invitation.id,
    metadata: { tutoringRequestId: invitation.tutoringRequestId },
  });

  await advanceDispatch(invitation.tutoringRequestId);

  revalidatePath("/tutor/quick-match");
  revalidatePath("/dashboard/quick-match");
  return { success: true };
}
