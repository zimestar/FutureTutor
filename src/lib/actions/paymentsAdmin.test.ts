import { beforeEach, describe, expect, it, vi } from "vitest";

// ADMIN-AUTH-HARDENING1 — reconcilePaymentAction triggers a real Stripe
// reconciliation call (resolveCaptureOutcomeAndConverge); its authorization
// gate previously trusted the stale JWT role directly. This file proves the
// gate is now DB-fresh (requireSuperAdmin) and, critically, that
// resolveCaptureOutcomeAndConverge — the actual financial function — is
// NEVER reached when the fresh check denies. The financial function itself
// is mocked; its own behavior is unchanged by this mission and is not
// re-tested here.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireSuperAdmin: vi.fn(),
  resolveCaptureOutcomeAndConverge: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/services/adminPermissions", () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock("@/services/payments", () => ({ resolveCaptureOutcomeAndConverge: mocks.resolveCaptureOutcomeAndConverge }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { reconcilePaymentAction } from "./paymentsAdmin";

const FAKE_SESSION = { user: { id: "actor-1", role: "SUPER_ADMIN" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(FAKE_SESSION);
});

describe("reconcilePaymentAction", () => {
  it("a fresh, active SUPER_ADMIN can trigger reconciliation — the fresh actor id is stamped on the audit row", async () => {
    mocks.requireSuperAdmin.mockResolvedValue({ id: "actor-1", role: "SUPER_ADMIN" });
    await reconcilePaymentAction("payment-1");
    expect(mocks.resolveCaptureOutcomeAndConverge).toHaveBeenCalledWith("payment-1");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "actor-1", action: "payment.admin_reconcile_triggered", entityId: "payment-1" })
    );
  });

  it("a demoted/deactivated SUPER_ADMIN (stale session, fresh check denies) never reaches Stripe reconciliation", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(reconcilePaymentAction("payment-1")).rejects.toThrow("FORBIDDEN");
    expect(mocks.resolveCaptureOutcomeAndConverge).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("a plain ADMIN (never eligible for this SUPER_ADMIN-only action) is denied by the same fresh gate", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "actor-2", role: "ADMIN" } });
    mocks.requireSuperAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(reconcilePaymentAction("payment-1")).rejects.toThrow("FORBIDDEN");
    expect(mocks.resolveCaptureOutcomeAndConverge).not.toHaveBeenCalled();
  });
});
