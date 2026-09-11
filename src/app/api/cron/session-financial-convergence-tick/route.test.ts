import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// FINANCIAL-CONVERGENCE-ROUTE-SEPARATION1 — auth contract for the new
// DB-only financial convergence/eligibility cron, mirroring
// session-notifications-tick/route.test.ts's own established pattern
// exactly (the first cron route in this codebase to get a dedicated test
// file, per that file's own doc comment).
//
// TUTOR-TRANSFER-RECONCILIATION1: also mocks sweepPostTransferPaymentSafety
// (tutorTransferReconciliation.ts) — both real functions must stay mocked
// here so this remains a fast, DB-free unit test; real-DB behavior for both
// is covered by tutorEarningConvergence.integration.test.ts instead.

const mocks = vi.hoisted(() => ({
  processFinancialConvergenceAndEligibility: vi.fn(),
  sweepPostTransferPaymentSafety: vi.fn(),
}));

vi.mock("@/services/tutorEarningConvergence", () => ({
  processFinancialConvergenceAndEligibility: mocks.processFinancialConvergenceAndEligibility,
}));

vi.mock("@/services/tutorTransferReconciliation", () => ({
  sweepPostTransferPaymentSafety: mocks.sweepPostTransferPaymentSafety,
}));

import { POST } from "./route";

function makeRequest(secretHeader?: string) {
  const headers = new Headers();
  if (secretHeader !== undefined) headers.set("x-cron-secret", secretHeader);
  return new Request("https://internal/api/cron/session-financial-convergence-tick", { method: "POST", headers });
}

describe("POST /api/cron/session-financial-convergence-tick", () => {
  const originalSecret = process.env.SESSION_FINANCIAL_CONVERGENCE_CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_FINANCIAL_CONVERGENCE_CRON_SECRET = "test-secret";
    mocks.processFinancialConvergenceAndEligibility.mockResolvedValue({
      convergedEarnings: 0,
      reconciliationRequired: 0,
      markedEligible: 0,
    });
    mocks.sweepPostTransferPaymentSafety.mockResolvedValue({ evaluated: 0, flagged: 0 });
  });

  afterAll(() => {
    process.env.SESSION_FINANCIAL_CONVERGENCE_CRON_SECRET = originalSecret;
  });

  it("500s when the secret is not configured", async () => {
    delete process.env.SESSION_FINANCIAL_CONVERGENCE_CRON_SECRET;
    const response = await POST(makeRequest("anything"));
    expect(response.status).toBe(500);
    expect(mocks.processFinancialConvergenceAndEligibility).not.toHaveBeenCalled();
    expect(mocks.sweepPostTransferPaymentSafety).not.toHaveBeenCalled();
  });

  it("401s when the header is missing", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
    expect(mocks.processFinancialConvergenceAndEligibility).not.toHaveBeenCalled();
    expect(mocks.sweepPostTransferPaymentSafety).not.toHaveBeenCalled();
  });

  it("401s when the header does not match the configured secret", async () => {
    const response = await POST(makeRequest("wrong-secret"));
    expect(response.status).toBe(401);
    expect(mocks.processFinancialConvergenceAndEligibility).not.toHaveBeenCalled();
    expect(mocks.sweepPostTransferPaymentSafety).not.toHaveBeenCalled();
  });

  it("200s and runs both the DB-only convergence+eligibility orchestrator and the post-transfer reconciliation sweep when the secret matches", async () => {
    mocks.processFinancialConvergenceAndEligibility.mockResolvedValue({
      convergedEarnings: 2,
      reconciliationRequired: 0,
      markedEligible: 1,
    });
    mocks.sweepPostTransferPaymentSafety.mockResolvedValue({ evaluated: 3, flagged: 1 });

    const response = await POST(makeRequest("test-secret"));

    expect(response.status).toBe(200);
    expect(mocks.processFinancialConvergenceAndEligibility).toHaveBeenCalledTimes(1);
    expect(mocks.sweepPostTransferPaymentSafety).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      convergedEarnings: 2,
      reconciliationRequired: 0,
      markedEligible: 1,
      postTransferReconciliation: { evaluated: 3, flagged: 1 },
    });
  });
});
