import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  getClosedBetaMode,
  closedBetaFinancialGateActive,
  closedBetaOnlineOnlyActive,
  getClosedBetaFinancialGateMode,
  getClosedBetaOnlineOnlyMode,
  getEffectiveClosedBetaGates,
} from "./closedBetaConfig";

// BETA-HARDEN1 — permanent unit tests for the Closed Beta safety gate.
// Deliberately fails closed in the SAFE direction (unset/invalid ->
// "active"), the opposite default from paymentMode.ts's own
// getValidatedPaymentMode(), which throws instead — see the module's own
// doc comment for why that asymmetry is correct here.

const ORIGINAL_MODE = process.env.CLOSED_BETA_MODE;
// RW-22 — the legacy-only tests below must not be affected by the two new
// per-gate variables if a developer's shell happens to export them.
const ORIGINAL_NEW_GATE_VARS = {
  CLOSED_BETA_FINANCIAL_GATE: process.env.CLOSED_BETA_FINANCIAL_GATE,
  CLOSED_BETA_ONLINE_ONLY: process.env.CLOSED_BETA_ONLINE_ONLY,
};

beforeEach(() => {
  delete process.env.CLOSED_BETA_FINANCIAL_GATE;
  delete process.env.CLOSED_BETA_ONLINE_ONLY;
});

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.CLOSED_BETA_MODE;
  else process.env.CLOSED_BETA_MODE = ORIGINAL_MODE;
  for (const [key, value] of Object.entries(ORIGINAL_NEW_GATE_VARS)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
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

// ---------------------------------------------------------------------------
// RW-22 — two independent gates with a fail-closed legacy fallback.
// ---------------------------------------------------------------------------
const GATE_VARS = ["CLOSED_BETA_FINANCIAL_GATE", "CLOSED_BETA_ONLINE_ONLY", "CLOSED_BETA_MODE"] as const;
type GateVar = (typeof GATE_VARS)[number];
const ORIGINAL_GATES: Record<GateVar, string | undefined> = Object.fromEntries(GATE_VARS.map((k) => [k, process.env[k]])) as Record<
  GateVar,
  string | undefined
>;

function setEnv(values: Partial<Record<GateVar, string | undefined>>) {
  for (const key of GATE_VARS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/** The approved precedence, restated independently of the implementation. */
function expectedGate(explicit: string | undefined, legacy: string | undefined): "active" | "inactive" {
  if (explicit !== undefined) return explicit === "active" || explicit === "inactive" ? explicit : "active";
  return legacy === "active" || legacy === "inactive" ? legacy : "active";
}

// unset, both valid values, and invalid: empty, case, whitespace, synonyms.
const EXPLICIT_VALUES = [undefined, "active", "inactive", "", "Active", "INACTIVE", " inactive", "inactive ", "\tinactive", "off", "false", "0"];
const LEGACY_VALUES = [undefined, "active", "inactive", "", "Inactive", " inactive", "bogus"];

describe("RW-22 — independent closed-beta gates", () => {
  afterEach(() => setEnv(ORIGINAL_GATES));

  it("full matrix: financial x online-only x legacy — every combination resolves per the approved precedence", () => {
    let checked = 0;
    for (const financial of EXPLICIT_VALUES) {
      for (const onlineOnly of EXPLICIT_VALUES) {
        for (const legacy of LEGACY_VALUES) {
          setEnv({ CLOSED_BETA_FINANCIAL_GATE: financial, CLOSED_BETA_ONLINE_ONLY: onlineOnly, CLOSED_BETA_MODE: legacy });
          const label = JSON.stringify({ financial, onlineOnly, legacy });
          const expectedFinancial = expectedGate(financial, legacy);
          const expectedOnlineOnly = expectedGate(onlineOnly, legacy);
          expect(getClosedBetaFinancialGateMode(), label).toBe(expectedFinancial);
          expect(getClosedBetaOnlineOnlyMode(), label).toBe(expectedOnlineOnly);
          expect(closedBetaFinancialGateActive(), label).toBe(expectedFinancial === "active");
          expect(closedBetaOnlineOnlyActive(), label).toBe(expectedOnlineOnly === "active");
          expect(getEffectiveClosedBetaGates(), label).toEqual({ financialGate: expectedFinancial, onlineOnly: expectedOnlineOnly });
          checked += 1;
        }
      }
    }
    expect(checked).toBe(EXPLICIT_VALUES.length * EXPLICIT_VALUES.length * LEGACY_VALUES.length);
  });

  it("default (nothing set) is active/active", () => {
    setEnv({});
    expect(getEffectiveClosedBetaGates()).toEqual({ financialGate: "active", onlineOnly: "active" });
    expect(closedBetaFinancialGateActive()).toBe(true);
    expect(closedBetaOnlineOnlyActive()).toBe(true);
  });

  it.each(["active", "inactive"] as const)("legacy-only CLOSED_BETA_MODE=%s keeps its exact pre-RW-22 behaviour for both gates", (legacy) => {
    setEnv({ CLOSED_BETA_MODE: legacy });
    expect(getClosedBetaMode()).toBe(legacy);
    expect(getEffectiveClosedBetaGates()).toEqual({ financialGate: legacy, onlineOnly: legacy });
  });

  it("the gates are independent: financial inactive + online-only active (the intended first paid launch)", () => {
    setEnv({ CLOSED_BETA_FINANCIAL_GATE: "inactive", CLOSED_BETA_ONLINE_ONLY: "active" });
    expect(closedBetaFinancialGateActive()).toBe(false);
    expect(closedBetaOnlineOnlyActive()).toBe(true);
  });

  it("the gates are independent: financial active + online-only inactive", () => {
    setEnv({ CLOSED_BETA_FINANCIAL_GATE: "active", CLOSED_BETA_ONLINE_ONLY: "inactive" });
    expect(closedBetaFinancialGateActive()).toBe(true);
    expect(closedBetaOnlineOnlyActive()).toBe(false);
  });

  it("a valid new variable overrides the legacy variable, in both directions, for its own gate only", () => {
    setEnv({ CLOSED_BETA_MODE: "inactive", CLOSED_BETA_FINANCIAL_GATE: "active" });
    expect(getEffectiveClosedBetaGates()).toEqual({ financialGate: "active", onlineOnly: "inactive" });
    setEnv({ CLOSED_BETA_MODE: "active", CLOSED_BETA_ONLINE_ONLY: "inactive" });
    expect(getEffectiveClosedBetaGates()).toEqual({ financialGate: "active", onlineOnly: "inactive" });
  });

  it.each(["", "Inactive", "INACTIVE", " inactive", "inactive ", "off", "false", "disabled"])(
    "an invalid explicit value (%j) fails closed to active and never inherits a legacy inactive",
    (invalid) => {
      setEnv({ CLOSED_BETA_MODE: "inactive", CLOSED_BETA_FINANCIAL_GATE: invalid, CLOSED_BETA_ONLINE_ONLY: invalid });
      expect(getEffectiveClosedBetaGates()).toEqual({ financialGate: "active", onlineOnly: "active" });
      expect(closedBetaFinancialGateActive()).toBe(true);
      expect(closedBetaOnlineOnlyActive()).toBe(true);
    }
  );

  it("is re-read on every call for the new variables too (not cached)", () => {
    setEnv({ CLOSED_BETA_FINANCIAL_GATE: "active" });
    expect(closedBetaFinancialGateActive()).toBe(true);
    setEnv({ CLOSED_BETA_FINANCIAL_GATE: "inactive" });
    expect(closedBetaFinancialGateActive()).toBe(false);
  });

  it("never reads PAYMENT_MODE, STRIPE_CONNECT_ENABLED or FINANCIAL_E2E_* (separate gates stay separate)", () => {
    const saved = ["PAYMENT_MODE", "STRIPE_CONNECT_ENABLED", "FINANCIAL_E2E_ENABLED"].map((k) => [k, process.env[k]] as const);
    try {
      setEnv({ CLOSED_BETA_FINANCIAL_GATE: "active", CLOSED_BETA_ONLINE_ONLY: "active" });
      for (const value of ["live", "true", "inactive"]) {
        process.env.PAYMENT_MODE = value;
        process.env.STRIPE_CONNECT_ENABLED = value;
        process.env.FINANCIAL_E2E_ENABLED = value;
        expect(getEffectiveClosedBetaGates()).toEqual({ financialGate: "active", onlineOnly: "active" });
      }
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
