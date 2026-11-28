import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import "@/test-support/useVerifiedTestDatabase"; // must precede @/lib/db
import { db } from "@/lib/db";
import { ASSISTANT_FREE_MONTHLY_QUESTIONS, IKA_PARENT_SESSION_BONUS, IKA_PLAN } from "@/lib/assistant/config";
import { completeQuestion, getIkaAllowance, reserveQuestion } from "@/services/assistantQuota";
import { createCustomerPriceQuote } from "@/services/customerPricing";

// Ika allowance (free monthly questions, Ika+ plan, credits from packs and
// session bonuses), against a real database.

const stamp = `assistant-quota-it-${Date.now()}`;
const ids: string[] = [];
let subjectId: string;
const quoteIds: string[] = [];
const paymentIds: string[] = [];
const studentProfileIds: string[] = [];

beforeAll(async () => {
  subjectId = (await db.subject.create({ data: { slug: `${stamp}-subject`, sortOrder: 999 } })).id;
  if (!(await db.marketplacePricingSettings.findFirst())) await db.marketplacePricingSettings.create({ data: {} });
  await db.customerBasePriceRule.create({ data: { subjectId, baseDurationMinutes: 60, basePriceCents: 4200, pricingVersion: "CUSTOMER_PRICING_V1" } });
});

afterAll(async () => {
  await db.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await db.customerPriceQuote.deleteMany({ where: { id: { in: quoteIds } } });
  await db.customerBasePriceRule.deleteMany({ where: { subjectId } });
  await db.studentProfile.deleteMany({ where: { id: { in: studentProfileIds } } });
  await db.subject.deleteMany({ where: { id: subjectId } });
  await db.assistantUsage.deleteMany({ where: { userId: { in: ids } } });
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

async function useAllFree(userId: string) {
  for (let i = 0; i < ASSISTANT_FREE_MONTHLY_QUESTIONS; i++) {
    const r = await reserveQuestion(userId, "test-model", "PARENT");
    if (!r.ok) throw new Error("free question expected");
    await completeQuestion(r.usageId, "COMPLETED");
  }
}

async function paidSession(payerUserId: string, status: "CAPTURED" | "REFUNDED") {
  const student = await db.studentProfile.create({
    data: { firstName: "Kid", lastName: "Test", dateOfBirth: new Date("2014-01-01T00:00:00Z"), managementMode: "GUARDIAN_MANAGED" },
  });
  studentProfileIds.push(student.id);
  const quote = await createCustomerPriceQuote(
    { createdByUserId: payerUserId, studentProfileId: student.id, subjectId, academicLevelId: null, tutoringMode: "ONLINE", durationMinutes: 60, requestedStartAt: new Date(Date.now() + 30 * 86400000) },
    db
  );
  quoteIds.push(quote.id);
  const payment = await db.payment.create({
    data: { customerPriceQuoteId: quote.id, payerUserId, amountCents: quote.totalCents, status, capturedAt: new Date(), stripePaymentIntentId: `pi_test_${randomUUID()}` },
  });
  paymentIds.push(payment.id);
}

describe("Ika allowance — real DB", () => {
  it("allows exactly the free number of questions per month, then refuses", async () => {
    const parent = await makeParent("limit");
    await useAllFree(parent.id);
    await expect(reserveQuestion(parent.id, "test-model", "PARENT")).resolves.toEqual({ ok: false, reason: "QUOTA_EXHAUSTED" });
    await expect(getIkaAllowance(parent.id, "PARENT")).resolves.toMatchObject({ freeRemaining: 0, credits: 0, total: 0 });
  });

  it("gives the question back when no answer was delivered (FAILED, REFUSED)", async () => {
    const parent = await makeParent("refund");
    const a = await reserveQuestion(parent.id, "test-model", "PARENT");
    const b = await reserveQuestion(parent.id, "test-model", "PARENT");
    if (!a.ok || !b.ok) throw new Error("reservation expected");
    await completeQuestion(a.usageId, "FAILED");
    await completeQuestion(b.usageId, "REFUSED");
    await expect(getIkaAllowance(parent.id, "PARENT")).resolves.toMatchObject({ freeRemaining: ASSISTANT_FREE_MONTHLY_QUESTIONS });
  });

  it("never lets parallel requests exceed the allowance", async () => {
    const parent = await makeParent("race");
    const results = await Promise.all(Array.from({ length: ASSISTANT_FREE_MONTHLY_QUESTIONS + 5 }, () => reserveQuestion(parent.id, "test-model", "PARENT")));
    expect(results.filter((r) => r.ok)).toHaveLength(ASSISTANT_FREE_MONTHLY_QUESTIONS);
  });

  it("does not count last month's free questions", async () => {
    const parent = await makeParent("month");
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    await db.assistantUsage.createMany({
      data: Array.from({ length: ASSISTANT_FREE_MONTHLY_QUESTIONS }, () => ({ userId: parent.id, model: "test-model", status: "COMPLETED" as const, createdAt: lastMonth })),
    });
    await expect(getIkaAllowance(parent.id, "PARENT")).resolves.toMatchObject({ freeRemaining: ASSISTANT_FREE_MONTHLY_QUESTIONS });
  });

  it("uses free questions first, then pack credits, which never expire", async () => {
    const parent = await makeParent("pack");
    await db.assistantCreditPurchase.create({
      data: { userId: parent.id, questions: 2, amountCents: 499, stripeCheckoutSessionId: `cs_test_${randomUUID()}`, createdAt: new Date("2025-01-01T00:00:00Z") },
    });
    await useAllFree(parent.id);
    const fromCredits = await reserveQuestion(parent.id, "test-model", "PARENT");
    expect(fromCredits.ok && fromCredits.source).toBe("CREDIT");
    await expect(getIkaAllowance(parent.id, "PARENT")).resolves.toMatchObject({ freeRemaining: 0, credits: 1 });
  });

  it("uses the Ika+ plan before credits, only while it is active", async () => {
    const parent = await makeParent("plan");
    await useAllFree(parent.id);
    await db.assistantSubscription.create({
      data: { userId: parent.id, stripeCustomerId: "cus_test", stripeSubscriptionId: `sub_test_${randomUUID()}`, status: "active", currentPeriodEnd: new Date(Date.now() + 86400000) },
    });
    const r = await reserveQuestion(parent.id, "test-model", "PARENT");
    expect(r.ok && r.source).toBe("PLAN");
    await expect(getIkaAllowance(parent.id, "PARENT")).resolves.toMatchObject({ plan: { active: true, remaining: IKA_PLAN.monthlyQuestions - 1 } });
    await db.assistantSubscription.update({ where: { userId: parent.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await expect(reserveQuestion(parent.id, "test-model", "PARENT")).resolves.toEqual({ ok: false, reason: "QUOTA_EXHAUSTED" });
  });

  it("gives the parent who paid a session bonus, and takes it back on a full refund", async () => {
    const parent = await makeParent("bonus");
    await paidSession(parent.id, "CAPTURED");
    await paidSession(parent.id, "REFUNDED");
    await expect(getIkaAllowance(parent.id, "PARENT")).resolves.toMatchObject({ bonusEarned: IKA_PARENT_SESSION_BONUS, credits: IKA_PARENT_SESSION_BONUS });
    // The tutor-side bonus does not apply to a parent's payments.
    await expect(getIkaAllowance(parent.id, "TUTOR")).resolves.toMatchObject({ bonusEarned: 0 });
  });
});
