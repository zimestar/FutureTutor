import { afterAll, afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import "@/test-support/useVerifiedTestDatabase"; // must precede @/lib/db
import { db } from "@/lib/db";
import { fulfillFromSession, ikaPurchasesAvailable, syncIkaSubscription } from "@/services/ikaBilling";

// IKA-BILLING — fulfilment is idempotent and never crosses users; the
// Closed Beta financial gate keeps purchases closed.

const stamp = `ika-billing-it-${Date.now()}`;
const ids: string[] = [];
const env = { ...process.env };

afterEach(() => {
  process.env = { ...env };
});

afterAll(async () => {
  await db.assistantCreditPurchase.deleteMany({ where: { userId: { in: ids } } });
  await db.assistantSubscription.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

async function makeParent(suffix: string) {
  const user = await db.user.create({ data: { email: `${stamp}-${suffix}@example.test`, role: "PARENT" } });
  ids.push(user.id);
  return user;
}

function packSession(userId: string, id: string, overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id,
    object: "checkout.session",
    status: "complete",
    payment_status: "paid",
    amount_total: 499,
    currency: "cad",
    payment_intent: "pi_test_1",
    metadata: { ikaKind: "pack", userId, questions: "50" },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe("Ika pack fulfilment", () => {
  it("adds the credits exactly once, however many times it runs", async () => {
    const parent = await makeParent("pack");
    const session = packSession(parent.id, `cs_test_${stamp}_a`);
    await expect(fulfillFromSession(session)).resolves.toBe("PACK");
    await expect(fulfillFromSession(session)).resolves.toBe("PACK");
    await expect(fulfillFromSession(session, parent.id)).resolves.toBe("PACK");
    const rows = await db.assistantCreditPurchase.findMany({ where: { userId: parent.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ questions: 50, amountCents: 499, currency: "CAD" });
  });

  it("ignores unpaid sessions, foreign sessions and non-Ika sessions", async () => {
    const parent = await makeParent("guard");
    await expect(fulfillFromSession(packSession(parent.id, `cs_test_${stamp}_b`, { payment_status: "unpaid" }))).resolves.toBe("PENDING");
    await expect(fulfillFromSession(packSession(parent.id, `cs_test_${stamp}_c`), "someone-else")).resolves.toBe("IGNORED");
    await expect(fulfillFromSession(packSession(parent.id, `cs_test_${stamp}_d`, { metadata: {} }))).resolves.toBe("IGNORED");
    await expect(db.assistantCreditPurchase.count({ where: { userId: parent.id } })).resolves.toBe(0);
  });
});

describe("Ika+ subscription mirror", () => {
  it("mirrors status, period end and cancellation from Stripe", async () => {
    const parent = await makeParent("plan");
    const end = Math.floor(Date.now() / 1000) + 30 * 86400;
    const subscription = {
      id: `sub_test_${stamp}`,
      customer: "cus_test_1",
      status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      created: Math.floor(Date.now() / 1000),
      metadata: { ikaKind: "plan", userId: parent.id },
      items: { data: [{ current_period_end: end }] },
    } as unknown as Stripe.Subscription;
    await syncIkaSubscription(subscription);
    await syncIkaSubscription({ ...subscription, cancel_at_period_end: true } as Stripe.Subscription);
    const row = await db.assistantSubscription.findUniqueOrThrow({ where: { userId: parent.id } });
    expect(row).toMatchObject({ status: "active", cancelAtPeriodEnd: true, stripeCustomerId: "cus_test_1" });
    expect(row.currentPeriodEnd.getTime()).toBe(end * 1000);
    // A subscription that is not Ika's is never mirrored.
    await syncIkaSubscription({ ...subscription, id: "sub_other", metadata: {} } as unknown as Stripe.Subscription);
    await expect(db.assistantSubscription.count({ where: { stripeSubscriptionId: "sub_other" } })).resolves.toBe(0);
  });
});

describe("Closed Beta financial gate", () => {
  it("keeps Ika purchases closed while the gate is active", () => {
    process.env.PAYMENT_MODE = "stripe_test";
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
    process.env.CLOSED_BETA_FINANCIAL_GATE = "active";
    expect(ikaPurchasesAvailable()).toBe(false);
  });

  it("is routed through the Stripe webhook's idempotent claim", () => {
    const webhooks = readFileSync("src/services/stripeWebhooks.ts", "utf8");
    expect(webhooks).toContain('case "checkout.session.completed":');
    expect(webhooks).toContain('case "customer.subscription.deleted":');
    expect(webhooks).toContain("if (session.metadata?.ikaKind) await fulfillFromSession(session);");
  });
});
