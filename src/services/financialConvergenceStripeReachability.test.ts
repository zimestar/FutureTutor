import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// FINANCIAL-CONVERGENCE-ROUTE-SEPARATION1 — Phase 4's mandatory deployment
// gate: static proof (not merely convention) that the new DB-only financial
// convergence/eligibility path is structurally incapable of reaching
// Stripe. Mirrors the existing source-text-scan convention already used by
// admin/financial-ops/page.test.ts and admin/audit-log/page.test.ts —
// comments stripped first so explanatory prose (which necessarily NAMES the
// forbidden functions/imports to document that it never calls them) can
// never produce a false negative.

function sourceWithoutComments(path: string): string {
  const source = readFileSync(path, "utf8");
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const routePath = join(__dirname, "..", "app", "api", "cron", "session-financial-convergence-tick", "route.ts");
const convergencePath = join(__dirname, "tutorEarningConvergence.ts");
const paymentSafetyPath = join(__dirname, "paymentSafety.ts");

const STRIPE_REFERENCE = /stripe\.transfers|getstripeclient|from ["']@\/lib\/stripe["']|from ["']stripe["']/i;
const TRANSFER_BOUNDARY_REFERENCE = /createTransferForEarning|processEligibleTransfers|reconcileStuckPayments/;

describe("/api/cron/session-financial-convergence-tick route — Stripe reachability", () => {
  const route = sourceWithoutComments(routePath);

  it("does not import or reference Stripe in any form", () => {
    expect(route.toLowerCase()).not.toMatch(STRIPE_REFERENCE);
  });

  it("does not reference createTransferForEarning, processEligibleTransfers, or reconcileStuckPayments", () => {
    expect(route).not.toMatch(TRANSFER_BOUNDARY_REFERENCE);
  });

  it("invokes only processFinancialConvergenceAndEligibility from @/services/tutorEarningConvergence", () => {
    expect(route).toMatch(/processFinancialConvergenceAndEligibility/);
    expect(route).toMatch(/from "@\/services\/tutorEarningConvergence"/);
  });

  it("uses its own dedicated cron secret, distinct from PAYMENTS_CRON_SECRET", () => {
    expect(route).toMatch(/SESSION_FINANCIAL_CONVERGENCE_CRON_SECRET/);
    expect(route).not.toMatch(/PAYMENTS_CRON_SECRET/);
  });
});

describe("tutorEarningConvergence.ts — Stripe reachability", () => {
  const service = sourceWithoutComments(convergencePath);

  it("does not import or reference Stripe in any form", () => {
    expect(service.toLowerCase()).not.toMatch(STRIPE_REFERENCE);
  });

  it("does not reference createTransferForEarning, processEligibleTransfers, or reconcileStuckPayments — the DB-only convergence/eligibility engine never reaches the transfer boundary", () => {
    expect(service).not.toMatch(TRANSFER_BOUNDARY_REFERENCE);
  });

  it("defines sweepTutorEarningConvergence, markEligibleEarnings, and processFinancialConvergenceAndEligibility in this same Stripe-free module", () => {
    expect(service).toMatch(/export async function sweepTutorEarningConvergence/);
    expect(service).toMatch(/export async function markEligibleEarnings/);
    expect(service).toMatch(/export async function processFinancialConvergenceAndEligibility/);
  });
});

describe("tutorTransfers.ts — narrowed responsibility", () => {
  const transfers = sourceWithoutComments(join(__dirname, "tutorTransfers.ts"));

  it("no longer defines markEligibleEarnings (relocated to tutorEarningConvergence.ts)", () => {
    expect(transfers).not.toMatch(/export async function markEligibleEarnings/);
  });

  it("processEligibleTransfers no longer calls sweepTutorEarningConvergence or markEligibleEarnings", () => {
    // \r?\n — this repo's source files use CRLF line endings.
    const fnMatch = transfers.match(/export async function processEligibleTransfers[\s\S]*?\r?\n}\r?\n/);
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).not.toMatch(/sweepTutorEarningConvergence|markEligibleEarnings/);
  });

  it("remains the sole module invoking stripe.transfers.create", () => {
    expect(transfers).toMatch(/stripe\.transfers\.create/);
  });

  it("FINANCIAL-TRANSFER-SAFETY-GATES1: createTransferForEarning re-checks payment safety before the Stripe call", () => {
    const fnMatch = transfers.match(/export async function createTransferForEarning[\s\S]*?\r?\n}\r?\n/);
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).toMatch(/assessPaymentSafetyForTutorTransfer/);
    // The safety check must appear BEFORE the Stripe call in source order —
    // a textual ordering check, not just presence, since presence alone
    // wouldn't catch the check being wired in after the fact.
    const safetyCheckIndex = fnBody.indexOf("assessPaymentSafetyForTutorTransfer");
    const stripeCallIndex = fnBody.indexOf("stripe.transfers.create");
    expect(safetyCheckIndex).toBeGreaterThan(-1);
    expect(stripeCallIndex).toBeGreaterThan(-1);
    expect(safetyCheckIndex).toBeLessThan(stripeCallIndex);
  });
});

describe("paymentSafety.ts — Stripe reachability", () => {
  const safety = sourceWithoutComments(paymentSafetyPath);

  it("does not import or reference Stripe in any form", () => {
    expect(safety.toLowerCase()).not.toMatch(STRIPE_REFERENCE);
  });

  it("does not reference createTransferForEarning, processEligibleTransfers, or reconcileStuckPayments", () => {
    expect(safety).not.toMatch(TRANSFER_BOUNDARY_REFERENCE);
  });

  it("does not import from payments.ts (which pulls in @/lib/stripe at module scope)", () => {
    expect(safety).not.toMatch(/from ["']@\/services\/payments["']/);
  });

  it("defines assessPaymentSafetyForTutorTransfer and isPaymentTransferSafe", () => {
    expect(safety).toMatch(/export async function assessPaymentSafetyForTutorTransfer/);
    expect(safety).toMatch(/export function isPaymentTransferSafe/);
  });
});

describe("FINANCIAL-TRANSFER-SAFETY-GATES1: convergence route transitively imports only Stripe-free modules", () => {
  it("tutorEarningConvergence.ts imports paymentSafety.ts, which is itself Stripe-free (verified above) — no transitive Stripe path exists", () => {
    const service = sourceWithoutComments(convergencePath);
    expect(service).toMatch(/from ["']@\/services\/paymentSafety["']/);
  });

  it("markEligibleEarnings calls assessPaymentSafetyForTutorTransfer before promoting to ELIGIBLE", () => {
    const service = sourceWithoutComments(convergencePath);
    const fnMatch = service.match(/export async function markEligibleEarnings[\s\S]*?\r?\n}\r?\n/);
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).toMatch(/assessPaymentSafetyForTutorTransfer/);
    const safetyCheckIndex = fnBody.indexOf("assessPaymentSafetyForTutorTransfer");
    const promoteIndex = fnBody.indexOf('data: { status: "ELIGIBLE" }');
    expect(safetyCheckIndex).toBeGreaterThan(-1);
    expect(promoteIndex).toBeGreaterThan(-1);
    expect(safetyCheckIndex).toBeLessThan(promoteIndex);
  });
});
