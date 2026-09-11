import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// FINANCIAL-CONVERGENCE-ROUTE-SEPARATION1 — auth contract for the new
// DB-only financial convergence/eligibility cron, mirroring
// session-notifications-tick/route.test.ts's own established pattern
// exactly (the first cron route in this codebase to get a dedicated test
// file, per that file's own doc comment).

const mocks = vi.hoisted(() => ({
  processFinancialConvergenceAndEligibility: vi.fn(),
}));

vi.mock("@/services/tutorEarningConvergence", () => ({
  processFinancialConvergenceAndEligibility: mocks.processFinancialConvergenceAndEligibility,
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
  });

  afterAll(() => {
    process.env.SESSION_FINANCIAL_CONVERGENCE_CRON_SECRET = originalSecret;
  });

  it("500s when the secret is not configured", async () => {
    delete process.env.SESSION_FINANCIAL_CONVERGENCE_CRON_SECRET;
    const response = await POST(makeRequest("anything"));
    expect(response.status).toBe(500);
    expect(mocks.processFinancialConvergenceAndEligibility).not.toHaveBeenCalled();
  });

  it("401s when the header is missing", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
    expect(mocks.processFinancialConvergenceAndEligibility).not.toHaveBeenCalled();
  });

  it("401s when the header does not match the configured secret", async () => {
    const response = await POST(makeRequest("wrong-secret"));
    expect(response.status).toBe(401);
    expect(mocks.processFinancialConvergenceAndEligibility).not.toHaveBeenCalled();
  });

  it("200s and runs the DB-only convergence+eligibility orchestrator when the secret matches", async () => {
    mocks.processFinancialConvergenceAndEligibility.mockResolvedValue({
      convergedEarnings: 2,
      reconciliationRequired: 0,
      markedEligible: 1,
    });

    const response = await POST(makeRequest("test-secret"));

    expect(response.status).toBe(200);
    expect(mocks.processFinancialConvergenceAndEligibility).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body).toEqual({ ok: true, convergedEarnings: 2, reconciliationRequired: 0, markedEligible: 1 });
  });
});
