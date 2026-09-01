import { describe, it, expect, afterEach } from "vitest";
import {
  getClosedBetaMode,
  closedBetaFinancialGateActive,
  closedBetaOnlineOnlyActive,
} from "./closedBetaConfig";

// BETA-HARDEN1 — permanent unit tests for the Closed Beta safety gate.
// Deliberately fails closed in the SAFE direction (unset/invalid ->
// "active"), the opposite default from paymentMode.ts's own
// getValidatedPaymentMode(), which throws instead — see the module's own
// doc comment for why that asymmetry is correct here.

const ORIGINAL_MODE = process.env.CLOSED_BETA_MODE;

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.CLOSED_BETA_MODE;
  else process.env.CLOSED_BETA_MODE = ORIGINAL_MODE;
});

describe("getClosedBetaMode / closedBetaFinancialGateActive / closedBetaOnlineOnlyActive", () => {
  it("unset CLOSED_BETA_MODE defaults to active (the safe/restrictive state)", () => {
    delete process.env.CLOSED_BETA_MODE;
    expect(getClosedBetaMode()).toBe("active");
    expect(closedBetaFinancialGateActive()).toBe(true);
    expect(closedBetaOnlineOnlyActive()).toBe(true);
  });

  it("an unrecognized value also defaults to active, never throws", () => {
    process.env.CLOSED_BETA_MODE = "yes-please";
    expect(() => getClosedBetaMode()).not.toThrow();
    expect(getClosedBetaMode()).toBe("active");
  });

  it("an empty-string value defaults to active", () => {
    process.env.CLOSED_BETA_MODE = "";
    expect(getClosedBetaMode()).toBe("active");
  });

  it('explicit "active" resolves to active', () => {
    process.env.CLOSED_BETA_MODE = "active";
    expect(getClosedBetaMode()).toBe("active");
    expect(closedBetaFinancialGateActive()).toBe(true);
    expect(closedBetaOnlineOnlyActive()).toBe(true);
  });

  it('explicit "inactive" resolves to inactive and both gates report false', () => {
    process.env.CLOSED_BETA_MODE = "inactive";
    expect(getClosedBetaMode()).toBe("inactive");
    expect(closedBetaFinancialGateActive()).toBe(false);
    expect(closedBetaOnlineOnlyActive()).toBe(false);
  });

  it("is re-read on every call, not cached — a value changed mid-process is picked up immediately", () => {
    process.env.CLOSED_BETA_MODE = "active";
    expect(closedBetaFinancialGateActive()).toBe(true);
    process.env.CLOSED_BETA_MODE = "inactive";
    expect(closedBetaFinancialGateActive()).toBe(false);
  });

  it("is a genuinely separate config source from PAYMENT_MODE — never reads that env var", () => {
    const originalPaymentMode = process.env.PAYMENT_MODE;
    delete process.env.PAYMENT_MODE;
    process.env.CLOSED_BETA_MODE = "inactive";
    expect(closedBetaFinancialGateActive()).toBe(false);
    if (originalPaymentMode === undefined) delete process.env.PAYMENT_MODE;
    else process.env.PAYMENT_MODE = originalPaymentMode;
  });
});
