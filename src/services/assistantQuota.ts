import "server-only";
import { db } from "@/lib/db";
import { ASSISTANT_FREE_MONTHLY_QUESTIONS, currentMonthStart } from "@/lib/assistant/config";

/**
 * ASSISTANT-1 — monthly free quota. A question is reserved (PENDING) before
 * the model is called, under a per-user advisory lock so two tabs can never
 * both take the last question; it is released (FAILED/REFUSED do not count)
 * when no answer was delivered.
 */
const COUNTED = ["PENDING", "COMPLETED"] as const;

export async function questionsUsedThisMonth(userId: string, now = new Date()) {
  return db.assistantUsage.count({
    where: { userId, status: { in: [...COUNTED] }, createdAt: { gte: currentMonthStart(now) } },
  });
}

export async function questionsRemainingThisMonth(userId: string, now = new Date()) {
  return Math.max(0, ASSISTANT_FREE_MONTHLY_QUESTIONS - (await questionsUsedThisMonth(userId, now)));
}

export type Reservation = { ok: true; usageId: string; remainingAfter: number } | { ok: false; reason: "QUOTA_EXHAUSTED" };

export async function reserveQuestion(userId: string, model: string, now = new Date()): Promise<Reservation> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assistant:${userId}`}))`;
    const used = await tx.assistantUsage.count({
      where: { userId, status: { in: [...COUNTED] }, createdAt: { gte: currentMonthStart(now) } },
    });
    if (used >= ASSISTANT_FREE_MONTHLY_QUESTIONS) return { ok: false, reason: "QUOTA_EXHAUSTED" } as const;
    const usage = await tx.assistantUsage.create({ data: { userId, model }, select: { id: true } });
    return { ok: true, usageId: usage.id, remainingAfter: ASSISTANT_FREE_MONTHLY_QUESTIONS - used - 1 } as const;
  });
}

export async function completeQuestion(
  usageId: string,
  status: "COMPLETED" | "FAILED" | "REFUSED",
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number }
) {
  await db.assistantUsage.update({
    where: { id: usageId },
    data: { status, completedAt: new Date(), ...(usage ?? {}) },
  });
}
