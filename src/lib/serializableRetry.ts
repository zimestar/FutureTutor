import { Prisma } from "@/generated/prisma/client";

/**
 * Phase H.4 — bounded retry for a Serializable-transaction write-conflict
 * (P2034). Mirrors src/services/payments.ts's private `withSerializableRetry`
 * helper exactly (same retry budget, same jittered backoff) — that helper
 * isn't exported and payments.ts must not be modified in H.4 (see the H.4
 * prompt's financial-boundary rule), so this is a small standalone copy of
 * the same established pattern rather than a new invention.
 *
 * Each retry opens a brand-new transaction via `fn`, so it always re-reads
 * fresh state rather than replaying stale in-memory values. This is what
 * makes the last-active-guardian invariant hold under real concurrent
 * revocation: when Postgres's Serializable isolation aborts one of two
 * racing transactions (a write-skew conflict — each read the other's row to
 * decide about its own write), the retry re-reads the now-current state and
 * either proceeds safely or fails a real business-rule check (not a raw
 * P2034) — see revokeGuardianRelationship in familyManagement.ts.
 *
 * Only P2034 is retried; every other error (including typed domain errors
 * like LastActiveGuardianError) is rethrown immediately on the first
 * occurrence, never swallowed or retried.
 */
const DEFAULT_MAX_RETRIES = 6;

export async function withSerializableRetry<T>(fn: () => Promise<T>, maxRetries = DEFAULT_MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 50 * attempt));
    }
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        continue;
      }
      throw error;
    }
  }
  throw new Error("withSerializableRetry: exhausted retry budget on repeated P2034 serialization conflicts");
}
