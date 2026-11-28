import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { paymentsUseStripe } from "@/lib/paymentMode";
import { closedBetaFinancialGateActive } from "@/lib/closedBetaConfig";
import { IKA_PACK, IKA_PLAN } from "@/lib/assistant/config";
import { planIsActive } from "@/services/assistantQuota";

/**
 * IKA-BILLING — the 50-question pack (one-time Checkout payment) and the
 * Ika+ plan (Checkout subscription). Purchases are offered only when Stripe
 * is configured AND the Closed Beta financial gate is open — the gate is
 * never bypassed here. Fulfilment is idempotent (unique Checkout session id /
 * one subscription row per user) and runs both from the success redirect
 * (immediate) and from the Stripe webhook (authoritative); the plan is also
 * re-read from Stripe when its period has ended, so a renewal or a
 * cancellation is picked up even if a webhook was missed.
 */
export type IkaPurchaseKind = "pack" | "plan";

export function ikaPurchasesAvailable(): boolean {
  return paymentsUseStripe() && !closedBetaFinancialGateActive();
}

type CheckoutInput = { userId: string; email: string | null; kind: IkaPurchaseKind; returnUrl: string };

export async function createIkaCheckout(input: CheckoutInput): Promise<{ ok: true; url: string } | { ok: false; reason: "UNAVAILABLE" | "ALREADY_SUBSCRIBED" | "FAILED" }> {
  if (!ikaPurchasesAvailable()) return { ok: false, reason: "UNAVAILABLE" };
  const stripe = getStripeClient();
  const metadata = { ikaKind: input.kind, userId: input.userId };
  const successUrl = `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}ika_checkout={CHECKOUT_SESSION_ID}`;
  const existing = await db.assistantSubscription.findUnique({ where: { userId: input.userId } });

  try {
    if (input.kind === "pack") {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        client_reference_id: input.userId,
        customer: existing?.stripeCustomerId,
        customer_email: existing ? undefined : (input.email ?? undefined),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: IKA_PACK.currency,
              unit_amount: IKA_PACK.amountCents,
              product_data: { name: `Ika — ${IKA_PACK.questions} questions`, description: "FutureTutor AI assistant · credits never expire" },
            },
          },
        ],
        metadata: { ...metadata, questions: String(IKA_PACK.questions) },
        payment_intent_data: { metadata: { ...metadata, questions: String(IKA_PACK.questions) } },
        success_url: successUrl,
        cancel_url: input.returnUrl,
      });
      return session.url ? { ok: true, url: session.url } : { ok: false, reason: "FAILED" };
    }

    if (existing && planIsActive(existing)) return { ok: false, reason: "ALREADY_SUBSCRIBED" };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: input.userId,
      customer: existing?.stripeCustomerId,
      customer_email: existing ? undefined : (input.email ?? undefined),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: IKA_PLAN.currency,
            unit_amount: IKA_PLAN.amountCents,
            recurring: { interval: "month" },
            product_data: { name: "Ika+", description: "FutureTutor AI assistant · monthly plan" },
          },
        },
      ],
      metadata,
      subscription_data: { metadata },
      success_url: successUrl,
      cancel_url: input.returnUrl,
    });
    return session.url ? { ok: true, url: session.url } : { ok: false, reason: "FAILED" };
  } catch (error) {
    console.error("[ika-billing] checkout creation failed", error instanceof Error ? error.message : error);
    return { ok: false, reason: "FAILED" };
  }
}

function periodEnd(subscription: Stripe.Subscription): Date {
  const ends = subscription.items.data.map((item) => item.current_period_end).filter((value): value is number => typeof value === "number");
  return new Date((ends.length ? Math.max(...ends) : subscription.created) * 1000);
}

function customerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** Mirrors a Stripe subscription that belongs to Ika (metadata.ikaKind = plan). */
export async function syncIkaSubscription(subscription: Stripe.Subscription): Promise<void> {
  if (subscription.metadata?.ikaKind !== "plan") return;
  const userId = subscription.metadata.userId;
  const stripeCustomerId = customerId(subscription.customer);
  if (!userId || !stripeCustomerId) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return;
  const data = {
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: periodEnd(subscription),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
  };
  const current = await db.assistantSubscription.findUnique({ where: { userId } });
  // A newer subscription replaces an ended one; an old subscription's late event never overwrites a newer row.
  if (current && current.stripeSubscriptionId !== subscription.id && planIsActive(current) && !["active", "trialing"].includes(subscription.status)) return;
  await db.assistantSubscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

/**
 * Fulfils a completed Ika Checkout session. Safe to call any number of times
 * (redirect and webhook): the pack is keyed on the Checkout session id.
 * When expectedUserId is given (success redirect), a session that belongs to
 * someone else is ignored.
 */
export async function fulfillIkaCheckout(sessionId: string, expectedUserId?: string): Promise<"PACK" | "PLAN" | "PENDING" | "IGNORED"> {
  if (!paymentsUseStripe()) return "IGNORED";
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  return fulfillFromSession(session, expectedUserId);
}

export async function fulfillFromSession(session: Stripe.Checkout.Session, expectedUserId?: string): Promise<"PACK" | "PLAN" | "PENDING" | "IGNORED"> {
  const kind = session.metadata?.ikaKind;
  const userId = session.metadata?.userId;
  if ((kind !== "pack" && kind !== "plan") || !userId) return "IGNORED";
  if (expectedUserId && expectedUserId !== userId) return "IGNORED";
  if (session.status !== "complete") return "PENDING";

  if (kind === "pack") {
    if (session.payment_status !== "paid") return "PENDING";
    const questions = Number(session.metadata?.questions ?? IKA_PACK.questions);
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
    try {
      await db.assistantCreditPurchase.create({
        data: {
          userId,
          questions: Number.isInteger(questions) && questions > 0 ? questions : IKA_PACK.questions,
          amountCents: session.amount_total ?? IKA_PACK.amountCents,
          currency: (session.currency ?? IKA_PACK.currency).toUpperCase(),
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
        },
      });
    } catch (error) {
      // Already fulfilled (unique Checkout session id) — idempotent no-op.
      const code = (error as { code?: string }).code;
      if (code !== "P2002") throw error;
    }
    return "PACK";
  }

  const subscription =
    typeof session.subscription === "string" ? await getStripeClient().subscriptions.retrieve(session.subscription) : session.subscription;
  if (!subscription) return "PENDING";
  await syncIkaSubscription(subscription);
  return "PLAN";
}

/** Re-reads the plan from Stripe once its paid period is over (renewal or end). */
export async function refreshIkaPlanIfStale(userId: string, now = new Date()): Promise<void> {
  if (!paymentsUseStripe()) return;
  const row = await db.assistantSubscription.findUnique({ where: { userId } });
  if (!row || row.currentPeriodEnd > now || ["canceled", "incomplete_expired"].includes(row.status)) return;
  try {
    await syncIkaSubscription(await getStripeClient().subscriptions.retrieve(row.stripeSubscriptionId));
  } catch (error) {
    console.error("[ika-billing] plan refresh failed", error instanceof Error ? error.message : error);
  }
}

/** Cancel at the end of the paid period (or undo that). Never refunds. */
export async function setIkaPlanCancellation(userId: string, cancel: boolean): Promise<boolean> {
  if (!paymentsUseStripe()) return false;
  const row = await db.assistantSubscription.findUnique({ where: { userId } });
  if (!row || !planIsActive(row)) return false;
  const subscription = await getStripeClient().subscriptions.update(row.stripeSubscriptionId, { cancel_at_period_end: cancel });
  await syncIkaSubscription(subscription);
  return true;
}
