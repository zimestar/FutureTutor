import { afterAll, describe, expect, it } from "vitest";
import "@/test-support/useVerifiedTestDatabase"; // must precede @/lib/db
import { db } from "@/lib/db";
import { ASSISTANT_FREE_MONTHLY_QUESTIONS } from "@/lib/assistant/config";
import { completeQuestion, questionsRemainingThisMonth, reserveQuestion } from "@/services/assistantQuota";

// ASSISTANT-1 — the monthly free quota, against a real database.

const stamp = `assistant-quota-it-${Date.now()}`;
const ids: string[] = [];

afterAll(async () => {
  await db.assistantUsage.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

async function makeParent(suffix: string) {
  const user = await db.user.create({ data: { email: `${stamp}-${suffix}@example.test`, role: "PARENT" } });
  ids.push(user.id);
  return user;
}

describe("assistant quota — real DB (ASSISTANT-1)", () => {
  it("allows exactly the free number of questions per month, then refuses", async () => {
    const parent = await makeParent("limit");
    for (let i = 0; i < ASSISTANT_FREE_MONTHLY_QUESTIONS; i++) {
      const r = await reserveQuestion(parent.id, "test-model");
      expect(r.ok).toBe(true);
      if (r.ok) await completeQuestion(r.usageId, "COMPLETED");
    }
    await expect(reserveQuestion(parent.id, "test-model")).resolves.toEqual({ ok: false, reason: "QUOTA_EXHAUSTED" });
    await expect(questionsRemainingThisMonth(parent.id)).resolves.toBe(0);
  });

  it("gives the question back when no answer was delivered (FAILED, REFUSED)", async () => {
    const parent = await makeParent("refund");
    const a = await reserveQuestion(parent.id, "test-model");
    const b = await reserveQuestion(parent.id, "test-model");
    if (!a.ok || !b.ok) throw new Error("reservation expected");
    await completeQuestion(a.usageId, "FAILED");
    await completeQuestion(b.usageId, "REFUSED");
    await expect(questionsRemainingThisMonth(parent.id)).resolves.toBe(ASSISTANT_FREE_MONTHLY_QUESTIONS);
  });

  it("never lets parallel requests exceed the quota", async () => {
    const parent = await makeParent("race");
    const results = await Promise.all(Array.from({ length: ASSISTANT_FREE_MONTHLY_QUESTIONS + 5 }, () => reserveQuestion(parent.id, "test-model")));
    expect(results.filter((r) => r.ok)).toHaveLength(ASSISTANT_FREE_MONTHLY_QUESTIONS);
  });

  it("does not count last month's questions", async () => {
    const parent = await makeParent("month");
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    await db.assistantUsage.createMany({
      data: Array.from({ length: ASSISTANT_FREE_MONTHLY_QUESTIONS }, () => ({ userId: parent.id, model: "test-model", status: "COMPLETED" as const, createdAt: lastMonth })),
    });
    await expect(questionsRemainingThisMonth(parent.id)).resolves.toBe(ASSISTANT_FREE_MONTHLY_QUESTIONS);
  });
});
