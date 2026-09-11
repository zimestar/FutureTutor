import { describe, it, expect } from "vitest";
import {
  classifyTutorTransferRecovery,
  TUTOR_TRANSFER_SAFE_RETRY_WINDOW_MS,
  type TutorTransferRecoveryFacts,
} from "./tutorTransferReconciliation";

// TUTOR-TRANSFER-RECONCILIATION1 — pure, zero-I/O unit tests for the
// bounded-retry-window classifier, mirroring paymentSafety.test.ts's own
// style for decidePaymentTransferSafety exactly.

const now = new Date("2026-09-12T00:00:00.000Z");

function facts(overrides: Partial<TutorTransferRecoveryFacts> = {}): TutorTransferRecoveryFacts {
  return {
    status: "FAILED",
    initiatedAt: new Date(now.getTime() - 1000),
    failedAt: new Date(now.getTime() - 1000),
    ...overrides,
  };
}

describe("TUTOR_TRANSFER_SAFE_RETRY_WINDOW_MS", () => {
  it("is exactly 24 hours", () => {
    expect(TUTOR_TRANSFER_SAFE_RETRY_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("classifyTutorTransferRecovery — no transfer / already COMPLETED", () => {
  it("null transfer -> NOT_APPLICABLE", () => {
    expect(classifyTutorTransferRecovery(null, now)).toEqual({ kind: "NOT_APPLICABLE" });
  });

  it("COMPLETED transfer -> NOT_APPLICABLE, regardless of age", () => {
    const veryOld = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    expect(classifyTutorTransferRecovery(facts({ status: "COMPLETED", failedAt: null, initiatedAt: veryOld }), now)).toEqual({
      kind: "NOT_APPLICABLE",
    });
  });
});

describe("classifyTutorTransferRecovery — recent FAILED/PENDING transfer (Phase 6 scenario 6)", () => {
  it("FAILED 1 second ago -> RETRYABLE", () => {
    const result = classifyTutorTransferRecovery(facts({ status: "FAILED", failedAt: new Date(now.getTime() - 1000) }), now);
    expect(result.kind).toBe("RETRYABLE");
  });

  it("FAILED just under the 24h window -> RETRYABLE", () => {
    const almostWindow = new Date(now.getTime() - (TUTOR_TRANSFER_SAFE_RETRY_WINDOW_MS - 1000));
    const result = classifyTutorTransferRecovery(facts({ status: "FAILED", failedAt: almostWindow }), now);
    expect(result.kind).toBe("RETRYABLE");
  });

  it("PENDING (never reached FAILED — e.g. crashed mid-flight), initiatedAt recent -> RETRYABLE, using initiatedAt as the anchor", () => {
    const result = classifyTutorTransferRecovery(
      facts({ status: "PENDING", failedAt: null, initiatedAt: new Date(now.getTime() - 60 * 1000) }),
      now
    );
    expect(result.kind).toBe("RETRYABLE");
  });

  it("exactly at the window boundary (not yet over) -> RETRYABLE", () => {
    const atBoundary = new Date(now.getTime() - TUTOR_TRANSFER_SAFE_RETRY_WINDOW_MS);
    const result = classifyTutorTransferRecovery(facts({ status: "FAILED", failedAt: atBoundary }), now);
    expect(result.kind).toBe("RETRYABLE"); // strictly greater-than, not gte, triggers MANUAL_REVIEW
  });
});

describe("classifyTutorTransferRecovery — stale/unknown transfer (Phase 7 scenario)", () => {
  it("FAILED just over the 24h window -> MANUAL_REVIEW_REQUIRED", () => {
    const justOver = new Date(now.getTime() - (TUTOR_TRANSFER_SAFE_RETRY_WINDOW_MS + 1000));
    const result = classifyTutorTransferRecovery(facts({ status: "FAILED", failedAt: justOver }), now);
    expect(result).toEqual({ kind: "MANUAL_REVIEW_REQUIRED", ageMs: TUTOR_TRANSFER_SAFE_RETRY_WINDOW_MS + 1000, reason: "STALE_UNRESOLVED_TRANSFER" });
  });

  it("FAILED weeks ago -> MANUAL_REVIEW_REQUIRED", () => {
    const weeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const result = classifyTutorTransferRecovery(facts({ status: "FAILED", failedAt: weeksAgo }), now);
    expect(result.kind).toBe("MANUAL_REVIEW_REQUIRED");
  });

  it("PENDING (never reached FAILED) but initiatedAt is stale -> MANUAL_REVIEW_REQUIRED via the initiatedAt anchor", () => {
    const staleInitiated = new Date(now.getTime() - (TUTOR_TRANSFER_SAFE_RETRY_WINDOW_MS + 60 * 60 * 1000));
    const result = classifyTutorTransferRecovery(facts({ status: "PENDING", failedAt: null, initiatedAt: staleInitiated }), now);
    expect(result.kind).toBe("MANUAL_REVIEW_REQUIRED");
  });
});

describe("classifyTutorTransferRecovery — defensive: no anchor at all", () => {
  it("both initiatedAt and failedAt null -> treated as age 0 (RETRYABLE), never guessed as stale", () => {
    const result = classifyTutorTransferRecovery(facts({ status: "PENDING", failedAt: null, initiatedAt: null }), now);
    expect(result).toEqual({ kind: "RETRYABLE", ageMs: 0 });
  });
});
