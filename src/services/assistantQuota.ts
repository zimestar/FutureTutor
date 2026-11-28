import "server-only";
import { db } from "@/lib/db";
import {
  ASSISTANT_FREE_MONTHLY_QUESTIONS,
  IKA_BONUS_START,
  IKA_PARENT_SESSION_BONUS,
  IKA_PLAN,
  IKA_TUTOR_SESSION_BONUS,
  currentMonthStart,
  type AssistantAudience,
} from "@/lib/assistant/config";

/**
 * Ika allowance. A question is paid from, in order: the monthly free
 * questions, the Ika+ plan (fair-use ceiling per month), then credits.
 * Credits = session bonuses (derived from real, non-refunded payments for
 * parents and completed sessions for tutors, so a refund takes the bonus
 * back) + purchased packs − questions already paid with credits. Credits
 * never expire.
 *
 * A question is reserved (PENDING) before the model is called, under a
 * per-user advisory lock so two tabs can never both take the last one; it is
 * released (FAILED/REFUSED do not count) when no answer was delivered.
 */
const COUNTED = ["PENDING", "COMPLETED"] as const;
const PLAN_ACTIVE_STATUSES = ["active", "trialing"];

type Client = Pick<typeof db, "assistantUsage" | "assistantCreditPurchase" | "assistantSubscription" | "payment" | "session_">;

export type IkaAllowance = {
  freeLimit: number;
  freeRemaining: number;
  plan: { active: boolean; remaining: number; currentPeriodEnd: Date; cancelAtPeriodEnd: boolean; status: string } | null;
  credits: number;
  bonusEarned: number;
  total: number;
};

export function planIsActive(plan: { status: string; currentPeriodEnd: Date } | null, now = new Date()) {
  return Boolean(plan && PLAN_ACTIVE_STATUSES.includes(plan.status) && plan.currentPeriodEnd > now);
}

async function sessionBonus(client: Client, userId: string, audience: AssistantAudience) {
  if (audience === "PARENT") {
    const paid = await client.payment.count({
      where: { payerUserId: userId, status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] }, capturedAt: { gte: IKA_BONUS_START } },
    });
    return paid * IKA_PARENT_SESSION_BONUS;
  }
  const completed = await client.session_.count({
    where: { status: "COMPLETED", completedAt: { gte: IKA_BONUS_START }, booking: { tutorProfile: { userId } } },
  });
  return completed * IKA_TUTOR_SESSION_BONUS;
}

async function computeAllowance(client: Client, userId: string, audience: AssistantAudience, now: Date): Promise<IkaAllowance> {
  const month = currentMonthStart(now);
  const [freeUsed, planUsed, creditUsed, bonusEarned, purchased, subscription] = await Promise.all([
    client.assistantUsage.count({ where: { userId, source: "FREE", status: { in: [...COUNTED] }, createdAt: { gte: month } } }),
    client.assistantUsage.count({ where: { userId, source: "PLAN", status: { in: [...COUNTED] }, createdAt: { gte: month } } }),
    client.assistantUsage.count({ where: { userId, source: "CREDIT", status: { in: [...COUNTED] } } }),
    sessionBonus(client, userId, audience),
    client.assistantCreditPurchase.aggregate({ where: { userId }, _sum: { questions: true } }),
    client.assistantSubscription.findUnique({ where: { userId } }),
  ]);
  const freeRemaining = Math.max(0, ASSISTANT_FREE_MONTHLY_QUESTIONS - freeUsed);
  const active = planIsActive(subscription, now);
  const plan = subscription
    ? {
        active,
        remaining: active ? Math.max(0, IKA_PLAN.monthlyQuestions - planUsed) : 0,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        status: subscription.status,
      }
    : null;
  const credits = Math.max(0, bonusEarned + (purchased._sum.questions ?? 0) - creditUsed);
  return {
    freeLimit: ASSISTANT_FREE_MONTHLY_QUESTIONS,
    freeRemaining,
    plan,
    credits,
    bonusEarned,
    total: freeRemaining + (plan?.remaining ?? 0) + credits,
  };
}

export function getIkaAllowance(userId: string, audience: AssistantAudience, now = new Date()) {
  return computeAllowance(db, userId, audience, now);
}

export type Reservation =
  | { ok: true; usageId: string; source: "FREE" | "PLAN" | "CREDIT"; allowanceAfter: IkaAllowance }
  | { ok: false; reason: "QUOTA_EXHAUSTED" };

export async function reserveQuestion(
  userId: string,
  model: string,
  audience: AssistantAudience,
  now = new Date(),
  options: { hasImage?: boolean } = {}
): Promise<Reservation> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assistant:${userId}`}))`;
    const allowance = await computeAllowance(tx, userId, audience, now);
    const source =
      allowance.freeRemaining > 0 ? "FREE" : allowance.plan && allowance.plan.remaining > 0 ? "PLAN" : allowance.credits > 0 ? "CREDIT" : null;
    if (!source) return { ok: false, reason: "QUOTA_EXHAUSTED" } as const;
    const usage = await tx.assistantUsage.create({ data: { userId, model, source, hasImage: options.hasImage ?? false }, select: { id: true } });
    const after: IkaAllowance = {
      ...allowance,
      freeRemaining: allowance.freeRemaining - (source === "FREE" ? 1 : 0),
      plan: allowance.plan && { ...allowance.plan, remaining: allowance.plan.remaining - (source === "PLAN" ? 1 : 0) },
      credits: allowance.credits - (source === "CREDIT" ? 1 : 0),
      total: allowance.total - 1,
    };
    return { ok: true, usageId: usage.id, source, allowanceAfter: after } as const;
  });
}

export async function completeQuestion(
  usageId: string,
  status: "COMPLETED" | "FAILED" | "REFUSED",
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
) {
  await db.assistantUsage.update({
    where: { id: usageId },
    data: { status, completedAt: new Date(), ...(usage ?? {}) },
  });
}
