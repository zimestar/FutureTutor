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

/**
 * Session Lifecycle Phase 2 — discovered under this phase's own genuine
 * multi-way concurrency tests (recordSessionCheckIn racing 2-3 concurrent
 * first-check-ins), reproduced deterministically, and additive-only fixed
 * here rather than worked around locally, since this is the one shared
 * retry primitive every Serializable-transaction caller in the codebase
 * (H.8's cancelBookingWithRefund included) already relies on.
 *
 * A genuine Postgres 40001 serialization_failure at COMMIT time (as opposed
 * to mid-transaction, inside a query) is not always translated by the
 * Prisma 7 + @prisma/adapter-pg stack into a PrismaClientKnownRequestError
 * with code "P2034" — it can also surface as a raw DriverAdapterError whose
 * `cause.kind` is "TransactionWriteConflict" (see
 * node_modules/@prisma/adapter-pg/dist/index.mjs's own Postgres-error-code
 * mapping: "40001" -> { kind: "TransactionWriteConflict" }). Both shapes
 * represent the EXACT SAME underlying event (a real, transient Serializable
 * write-conflict, safe and correct to retry with fresh state) — this is
 * duck-typed rather than importing @prisma/driver-adapter-utils, since that
 * package is only a transitive dependency (pinned via @prisma/adapter-pg),
 * not one this project declares directly.
 */
function isRetryableSerializationConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "DriverAdapterError" &&
    typeof (error as { cause?: unknown }).cause === "object" &&
    (error as { cause?: { kind?: unknown } }).cause !== null &&
    (error as { cause?: { kind?: unknown } }).cause?.kind === "TransactionWriteConflict"
  ) {
    return true;
  }
  return false;
}

export async function withSerializableRetry<T>(fn: () => Promise<T>, maxRetries = DEFAULT_MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 50 * attempt));
    }
    try {
      return await fn();
    } catch (error) {
      if (isRetryableSerializationConflict(error)) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("withSerializableRetry: exhausted retry budget on repeated P2034 serialization conflicts");
}
