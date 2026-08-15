import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { TutoringMode } from "@/generated/prisma/enums";
import { canInitiatePaidBooking } from "@/services/studentAuthorization";
import { writeAuditLog } from "@/lib/audit";
import { NotAuthorizedForLearnerError } from "@/services/bookingCreation";

export { NotAuthorizedForLearnerError };

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

/** Convenience wrapper opening its own Serializable transaction — used by
 * the Server Action, which doesn't otherwise need direct transaction
 * control. Tests call createTutoringRequestForLearner directly against
 * their own transaction so they can inspect state before/after precisely. */
export async function createTutoringRequestForLearnerInOwnTransaction(
  client: PrismaClient,
  input: CreateTutoringRequestForLearnerInput
) {
  return client.$transaction((tx) => createTutoringRequestForLearner(tx, input), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}
