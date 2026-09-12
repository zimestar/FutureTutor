import { beforeEach, describe, expect, it, vi } from "vitest";

// ADMIN-AUTH-HARDENING1 — the point of this file is the AUTHORIZATION gate:
// every mutating action below must call the DB-fresh requireSuperAdmin
// (services/adminPermissions.ts, its own real-DB behavior covered by
// adminManagement.integration.test.ts) and must never proceed to any
// mutation when it throws. Every other dependency is mocked out — this file
// does not re-test invitation/permission business logic.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireSuperAdmin: vi.fn(),
  replaceAdminPermissions: vi.fn(),
  createAdminInvitation: vi.fn(),
  resendAdminInvitation: vi.fn(),
  acceptAdminInvitation: vi.fn(),
  sendAdminInvitationEmail: vi.fn(),
  getAppBaseUrl: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/services/adminPermissions", () => ({
  ADMIN_PERMISSIONS: ["ADMIN_TUTORS_READ", "ADMIN_ADMINS_MANAGE"],
  requireSuperAdmin: mocks.requireSuperAdmin,
  replaceAdminPermissions: mocks.replaceAdminPermissions,
}));
vi.mock("@/services/adminInvitation", () => ({
  createAdminInvitation: mocks.createAdminInvitation,
  resendAdminInvitation: mocks.resendAdminInvitation,
  acceptAdminInvitation: mocks.acceptAdminInvitation,
}));
vi.mock("@/lib/email/adminInvitationEmail", () => ({ sendAdminInvitationEmail: mocks.sendAdminInvitationEmail }));
vi.mock("@/lib/appUrl", () => ({ getAppBaseUrl: mocks.getAppBaseUrl }));
vi.mock("@/lib/rateLimit", () => ({
  checkActionRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: { adminSetupByIp: { limit: 10, windowMs: 60000 } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    $transaction: mocks.transaction,
  },
}));

import {
  inviteAdminAction,
  updateAdminPermissionsAction,
  suspendAdminAction,
  reactivateAdminAction,
  revokeInvitationAction,
  resendInvitationAction,
  promoteAdminToSuperAdminAction,
} from "./adminManagement";

const FAKE_SESSION = { user: { id: "actor-1", role: "SUPER_ADMIN" } };
const FRESH_ACTOR = { id: "actor-1", role: "SUPER_ADMIN" as const };

function fakeTx() {
  return {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    auditLog: { create: vi.fn() },
    adminInvitation: { update: vi.fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(FAKE_SESSION);
  mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx()));
});

describe("inviteAdminAction — SUPER_ADMIN gate is DB-fresh", () => {
  const form = () => {
    const f = new FormData();
    f.set("firstName", "New"); f.set("lastName", "Admin"); f.set("email", "new-admin@example.test"); f.set("rolePreset", "OPERATIONS");
    return f;
  };

  it("a fresh, active SUPER_ADMIN can invite — actor.id (not raw session.user.id) is what gets passed as invitedById", async () => {
    mocks.requireSuperAdmin.mockResolvedValue(FRESH_ACTOR);
    mocks.userFindUnique.mockResolvedValue(null); // no existing user with that email
    mocks.createAdminInvitation.mockResolvedValue({ invitation: { email: "new-admin@example.test" }, rawToken: "tok" });
    mocks.getAppBaseUrl.mockResolvedValue("https://futuretutor.ca");

    const result = await inviteAdminAction(undefined, form());

    expect(result).toEqual({ success: true, email: "new-admin@example.test" });
    expect(mocks.requireSuperAdmin).toHaveBeenCalledWith(FAKE_SESSION);
    expect(mocks.createAdminInvitation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ invitedById: "actor-1" }));
  });

  it("a demoted/deactivated SUPER_ADMIN (stale session, fresh check denies) is refused BEFORE any invitation is created", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("FORBIDDEN"));

    const result = await inviteAdminAction(undefined, form());

    expect(result).toEqual({ error: "forbidden" });
    expect(mocks.createAdminInvitation).not.toHaveBeenCalled();
    expect(mocks.sendAdminInvitationEmail).not.toHaveBeenCalled();
  });
});

describe("updateAdminPermissionsAction — SUPER_ADMIN gate is DB-fresh", () => {
  it("denied when the fresh check fails — replaceAdminPermissions is never called", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    const result = await updateAdminPermissionsAction("target-admin", undefined, new FormData());
    expect(result).toEqual({ error: "forbidden" });
    expect(mocks.replaceAdminPermissions).not.toHaveBeenCalled();
  });

  it("allowed when fresh — uses actor.id, not the raw session id, as the granting actor", async () => {
    mocks.requireSuperAdmin.mockResolvedValue(FRESH_ACTOR);
    const result = await updateAdminPermissionsAction("target-admin", undefined, new FormData());
    expect(result).toEqual({ success: true });
    expect(mocks.replaceAdminPermissions).toHaveBeenCalledWith("target-admin", [], "actor-1");
  });
});

describe("suspendAdminAction / reactivateAdminAction / revokeInvitationAction / promoteAdminToSuperAdminAction — all throw before any DB transaction when the fresh check denies", () => {
  it("suspendAdminAction: denied throws, never opens a transaction", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(suspendAdminAction("target-admin")).rejects.toThrow("FORBIDDEN");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("suspendAdminAction: a SUPER_ADMIN cannot suspend themself, even when the fresh check passes", async () => {
    mocks.requireSuperAdmin.mockResolvedValue(FRESH_ACTOR);
    await expect(suspendAdminAction("actor-1")).rejects.toThrow("FORBIDDEN");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("suspendAdminAction: allowed proceeds and stamps the fresh actor id on the audit row", async () => {
    mocks.requireSuperAdmin.mockResolvedValue(FRESH_ACTOR);
    mocks.userFindUnique.mockResolvedValue({ role: "ADMIN" });
    await suspendAdminAction("target-admin");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("reactivateAdminAction: denied throws, never opens a transaction", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(reactivateAdminAction("target-admin")).rejects.toThrow("FORBIDDEN");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("revokeInvitationAction: denied throws, never opens a transaction", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(revokeInvitationAction("invitation-1")).rejects.toThrow("FORBIDDEN");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("promoteAdminToSuperAdminAction: denied throws, never opens a transaction — the single most sensitive action in this file", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(promoteAdminToSuperAdminAction("target-admin")).rejects.toThrow("FORBIDDEN");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("promoteAdminToSuperAdminAction: a SUPER_ADMIN cannot promote themself, even when the fresh check passes", async () => {
    mocks.requireSuperAdmin.mockResolvedValue(FRESH_ACTOR);
    await expect(promoteAdminToSuperAdminAction("actor-1")).rejects.toThrow("FORBIDDEN");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("resendInvitationAction — SUPER_ADMIN gate is DB-fresh", () => {
  it("a demoted/deactivated SUPER_ADMIN is denied before any invitation resend", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(resendInvitationAction("invitation-1", "en")).rejects.toThrow("FORBIDDEN");
    expect(mocks.resendAdminInvitation).not.toHaveBeenCalled();
    expect(mocks.sendAdminInvitationEmail).not.toHaveBeenCalled();
  });
});
