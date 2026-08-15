"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { paymentsUseStripe } from "@/lib/paymentMode";
import { canInitiatePaidBooking, canPayForStudent } from "@/services/studentAuthorization";
import {
  createTutoringRequestSchema,
  confirmTutoringRequestSchema,
  cancelTutoringRequestSchema,
} from "@/schemas/tutoringRequest";
import {
  createCustomerPriceQuote,
  lockCustomerPriceQuote,
  cancelActiveCustomerPriceQuote,
  PricingRuleNotFoundError,
} from "@/services/customerPricing";
import {
  preparePaymentForQuote,
  getOrCreatePaymentForQuote,
  ensureStripePaymentIntent,
  verifyAndAuthorizePaymentIntent,
  PaymentIntentVerificationError,
} from "@/services/payments";
import { advanceDispatch, closeTutoringRequest } from "@/services/quickMatchDispatch";
import {
  createTutoringRequestForLearnerInOwnTransaction,
  NotAuthorizedForLearnerError,
} from "@/services/tutoringRequestCreation";

export type CreateTutoringRequestState =
  | {
      success: true;
      tutoringRequestId: string;
      customerPriceQuoteId: string;
      basePriceCents: number;
      subtotalCents: number;
      taxCents: number;
      totalCents: number;
      currency: string;
      expiresAt: string;
    }
  | { success: false; error: string }
  | undefined;

export async function createTutoringRequestAction(
  _prevState: CreateTutoringRequestState,
  formData: FormData
): Promise<CreateTutoringRequestState> {
  const t = await getTranslations("quickMatch.errors");

  const session = await auth();
  // Phase H.7 — the actor may now legitimately be a PARENT initiating
  // Quick Match for a linked child, not only the learner's own STUDENT
  // session.
  if (!session?.user || (session.user.role !== "STUDENT" && session.user.role !== "PARENT")) {
    return { success: false, error: t("notAStudent") };
  }

  const academicLevelId = formData.get("academicLevelId");
  const parsed = createTutoringRequestSchema.safeParse({
    studentProfileId: formData.get("studentProfileId"),
    subjectId: formData.get("subjectId"),
    academicLevelId: academicLevelId ? String(academicLevelId) : undefined,
    tutoringMode: formData.get("tutoringMode"),
    durationMinutes: formData.get("durationMinutes"),
    requestedStartAt: formData.get("requestedStartAt"),
    notes: formData.get("notes") ? String(formData.get("notes")) : undefined,
    addressLine1: formData.get("addressLine1") ? String(formData.get("addressLine1")) : undefined,
    addressLine2: formData.get("addressLine2") ? String(formData.get("addressLine2")) : undefined,
    city: formData.get("city") ? String(formData.get("city")) : undefined,
    province: formData.get("province") ? String(formData.get("province")) : undefined,
    postalCode: formData.get("postalCode") ? String(formData.get("postalCode")) : undefined,
  });
  if (!parsed.success) return { success: false, error: t("invalidInput") };
  const data = parsed.data;

  // Phase H.7 — the learner is now an explicit, client-selected
  // studentProfileId (self, or a linked child), never self-derived from
  // the actor's own userId.
  const studentProfile = await db.studentProfile.findUnique({ where: { id: data.studentProfileId } });
  if (!studentProfile) return { success: false, error: t("invalidInput") };

  // Phase H.5 security correction (extended in H.7 for actor != learner):
  // previously authorized only by role===STUDENT + self-lookup, no H.2
  // involvement. Unchanged for every existing SELF_MANAGED student; now
  // also correctly allows an ACTIVE guardian acting for their linked child.
  const authorized = await canInitiatePaidBooking(db, session.user.id, studentProfile.id);
  if (!authorized) return { success: false, error: t("notAStudent") };

  try {
    // Tutor-agnostic, exactly like the Customer Price Engine was designed
    // for (Phase E) — no tutor is chosen yet at request-creation time.
    const quote = await createCustomerPriceQuote({
      createdByUserId: session.user.id,
      studentProfileId: studentProfile.id,
      subjectId: data.subjectId,
      academicLevelId: data.academicLevelId ?? null,
      tutoringMode: data.tutoringMode,
      durationMinutes: data.durationMinutes,
      requestedStartAt: data.requestedStartAt,
    });

    // Phase H.7 (§17/§21) — the mandatory transaction-bound re-check,
    // immediately before the authoritative TutoringRequest creation
    // mutation, extracted into its own directly-testable service function
    // (see tutoringRequestCreation.ts). Closes the TOCTOU window between
    // the pre-check above and this exact write (e.g. a guardian
    // relationship revoked in between).
    const request = await createTutoringRequestForLearnerInOwnTransaction(db, {
      actorUserId: session.user.id,
      studentProfileId: studentProfile.id,
      subjectId: data.subjectId,
      academicLevelId: data.academicLevelId ?? null,
      tutoringMode: data.tutoringMode,
      durationMinutes: data.durationMinutes,
      requestedStartAt: data.requestedStartAt,
      addressLine1: data.addressLine1 ?? null,
      addressLine2: data.addressLine2 ?? null,
      city: data.city ?? null,
      province: data.province ?? null,
      postalCode: data.postalCode ?? null,
      notes: data.notes ?? null,
      currency: quote.currency,
      customerPriceQuoteId: quote.id,
    });

    return {
      success: true,
      tutoringRequestId: request.id,
      customerPriceQuoteId: quote.id,
      basePriceCents: quote.basePriceCents,
      subtotalCents: quote.subtotalCents,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      currency: quote.currency,
      expiresAt: quote.expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof PricingRuleNotFoundError) return { success: false, error: t("pricingUnavailable") };
    // Phase H.7 — the transaction-bound re-check denied the actor's
    // authority over the learner (revoked between the pre-check and the
    // authoritative creation transaction). The CustomerPriceQuote created
    // just before this point is left ACTIVE/orphaned (never consumed,
    // expires naturally via its own TTL) — not a security concern (it can
    // only ever be consumed by the same createdByUserId that requested
    // it), only a minor, accepted resource-cleanliness gap.
    if (error instanceof NotAuthorizedForLearnerError) return { success: false, error: t("notAStudent") };
    return { success: false, error: t("generic") };
  }
}

export type PreparePaymentState =
  | { success: true; paymentId: string; clientSecret: string | null; usesStripe: boolean }
  | { success: false; error: string };

/** Called once the price is shown, before the student clicks confirm — in
 * live mode this is what lets the client render the Payment Element; in
 * dev/test mode (PAYMENT_MODE=disabled_dev) it's a no-op preparation step
 * with nothing for the UI to render. Never wraps the Stripe call in a
 * transaction — see the Payment model's schema domain comment. */
export async function preparePaymentForRequestAction(tutoringRequestId: string): Promise<PreparePaymentState> {
  const t = await getTranslations("quickMatch.errors");
  const session = await auth();
  // Phase H.7 — the actor may be the Parent who created this request.
  // canPayForStudent below (checked against request.studentProfileId, the
  // authoritative learner — never re-derived from the actor) is the real
  // gate; this is only the coarse role filter.
  if (!session?.user || (session.user.role !== "STUDENT" && session.user.role !== "PARENT")) {
    return { success: false, error: t("notAStudent") };
  }

  const request = await db.tutoringRequest.findUnique({ where: { id: tutoringRequestId } });
  if (!request || !request.customerPriceQuoteId) return { success: false, error: t("notFound") };
  if (request.createdByUserId !== session.user.id) return { success: false, error: t("notYours") };
  if (request.status !== "PRICED") return { success: false, error: t("invalidState") };

  // Phase H.5 security correction: initiating Stripe PaymentIntent
  // preparation previously only checked createdByUserId self-match, no H.2
  // involvement. Unchanged for every existing SELF_MANAGED student.
  const authorized = await canPayForStudent(db, session.user.id, request.studentProfileId);
  if (!authorized) return { success: false, error: t("notAStudent") };

  try {
    if (paymentsUseStripe()) {
      const payment = await getOrCreatePaymentForQuote(request.customerPriceQuoteId, session.user.id);
      const { clientSecret } = await ensureStripePaymentIntent(payment.id);
      return { success: true, paymentId: payment.id, clientSecret, usesStripe: true };
    }
    const payment = await preparePaymentForQuote(request.customerPriceQuoteId, session.user.id);
    return { success: true, paymentId: payment.id, clientSecret: null, usesStripe: false };
  } catch {
    return { success: false, error: t("pricingUnavailable") };
  }
}

export type TutoringRequestActionState = { error?: string; success?: boolean } | undefined;

export async function confirmTutoringRequestAction(
  _prevState: TutoringRequestActionState,
  formData: FormData
): Promise<TutoringRequestActionState> {
  const t = await getTranslations("quickMatch.errors");
  const session = await auth();
  // Phase H.7 — same widening as preparePaymentForRequestAction; the real
  // gate remains canPayForStudent against request.studentProfileId below.
  if (!session?.user || (session.user.role !== "STUDENT" && session.user.role !== "PARENT")) {
    return { error: t("notAStudent") };
  }

  const parsed = confirmTutoringRequestSchema.safeParse({
    tutoringRequestId: formData.get("tutoringRequestId"),
    customerPriceQuoteId: formData.get("customerPriceQuoteId"),
  });
  if (!parsed.success) return { error: t("invalidInput") };
  const { tutoringRequestId, customerPriceQuoteId } = parsed.data;
  const stripePaymentIntentId = formData.get("stripePaymentIntentId")
    ? String(formData.get("stripePaymentIntentId"))
    : null;

  const request = await db.tutoringRequest.findUnique({ where: { id: tutoringRequestId } });
  if (!request) return { error: t("notFound") };
  if (request.createdByUserId !== session.user.id) return { error: t("notYours") };
  if (request.status !== "PRICED") return { error: t("invalidState") };
  if (request.customerPriceQuoteId !== customerPriceQuoteId) return { error: t("invalidInput") };

  // Phase H.5 security correction: confirming authorizes the Stripe
  // payment and locks the quote — previously only createdByUserId
  // self-match, no H.2 involvement. Unchanged for every existing
  // SELF_MANAGED student.
  const authorized = await canPayForStudent(db, session.user.id, request.studentProfileId);
  if (!authorized) return { error: t("notAStudent") };

  // Server-side authorization verification — never trusts a client-side
  // stripe.confirmPayment() resolution alone (Phase G plan §12/Correction
  // 8). A plain Stripe read, before any transaction opens.
  try {
    if (paymentsUseStripe()) {
      if (!stripePaymentIntentId) return { error: t("pricingUnavailable") };
      const payment = await getOrCreatePaymentForQuote(customerPriceQuoteId, session.user.id);
      await verifyAndAuthorizePaymentIntent({
        paymentId: payment.id,
        stripePaymentIntentId,
        expectedPayerUserId: session.user.id,
      });
    } else {
      await preparePaymentForQuote(customerPriceQuoteId, session.user.id);
    }
  } catch (error) {
    if (error instanceof PaymentIntentVerificationError) return { error: t("pricingUnavailable") };
    return { error: t("generic") };
  }

  try {
    await db.$transaction(
      async (tx) => {
        const locked = await lockCustomerPriceQuote(tx, customerPriceQuoteId, session.user.id, {
          subjectId: request.subjectId,
          academicLevelId: request.academicLevelId,
          tutoringMode: request.tutoringMode,
          durationMinutes: request.durationMinutes,
          requestedStartAt: request.requestedStartAt,
        });

        // PRICED -> CONFIRMED -> MATCHING happens as one atomic step (see
        // the Phase F plan §4/§6): there is no independently observable
        // "confirmed but not yet matching" instant worth persisting.
        const updated = await tx.tutoringRequest.updateMany({
          where: { id: tutoringRequestId, status: "PRICED" },
          data: {
            status: "MATCHING",
            confirmedAt: new Date(),
            basePriceCents: locked.basePriceCents,
            adjustmentsTotalCents: locked.adjustmentsTotalCents,
            taxCents: locked.taxCents,
            totalCents: locked.totalCents,
            pricingVersion: locked.pricingVersion,
          },
        });
        if (updated.count === 0) throw new Error("TutoringRequest was not in PRICED state");

        await writeAuditLog(
          {
            actorUserId: session.user.id,
            action: "quickmatch.request.confirmed",
            entityType: "TutoringRequest",
            entityId: tutoringRequestId,
          },
          tx
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch {
    return { error: t("generic") };
  }

  // Kick off dispatch round 1 — deliberately outside the confirm
  // transaction above, since advanceDispatch opens its own transaction.
  await advanceDispatch(tutoringRequestId);

  revalidatePath("/dashboard/quick-match");
  return { success: true };
}

export async function cancelTutoringRequestAction(
  _prevState: TutoringRequestActionState,
  formData: FormData
): Promise<TutoringRequestActionState> {
  const t = await getTranslations("quickMatch.errors");
  const session = await auth();
  if (!session?.user) return { error: t("notYours") };

  const parsed = cancelTutoringRequestSchema.safeParse({ tutoringRequestId: formData.get("tutoringRequestId") });
  if (!parsed.success) return { error: t("invalidInput") };

  const request = await db.tutoringRequest.findUnique({ where: { id: parsed.data.tutoringRequestId } });
  if (!request) return { error: t("notFound") };

  const isAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";
  // Phase H.5 security correction: gated with the same H.2 capability as
  // request creation, for consistency across this resource's lifecycle.
  // Unchanged for every existing SELF_MANAGED student.
  const isAuthorizedCreator =
    request.createdByUserId === session.user.id &&
    (await canInitiatePaidBooking(db, session.user.id, request.studentProfileId));
  if (!isAuthorizedCreator && !isAdmin) return { error: t("notYours") };

  if (request.status === "DRAFT" || request.status === "PRICED") {
    await db.$transaction(async (tx) => {
      const updated = await tx.tutoringRequest.updateMany({
        where: { id: request.id, status: request.status },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      if (updated.count === 0) return;
      if (request.customerPriceQuoteId) {
        await cancelActiveCustomerPriceQuote(tx, request.customerPriceQuoteId);
      }
      await writeAuditLog(
        {
          actorUserId: session.user.id,
          action: "quickmatch.request.cancelled",
          entityType: "TutoringRequest",
          entityId: request.id,
        },
        tx
      );
    });
  } else if (request.status === "MATCHING") {
    await db.$transaction((tx) => closeTutoringRequest(tx, request, "CANCELLED"), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } else {
    return { error: t("invalidState") };
  }

  revalidatePath("/dashboard/quick-match");
  return { success: true };
}
