import { beforeEach, describe, expect, it, vi } from "vitest";

// ADMIN-AUTH-HARDENING1 — hasAdminPermission now delegates entirely to
// requireAdminPermission (src/services/adminPermissions.ts), the single
// DB-fresh authoritative admin check. Mocked at that boundary — this file
// tests hasAdminPermission's OWN contract (cheap stale-safe pre-filter,
// boolean return, never throws), not requireAdminPermission's internal DB
// logic, which has its own real-DB integration coverage in
// adminManagement.integration.test.ts.

const mocks = vi.hoisted(() => ({ requireAdminPermission: vi.fn() }));
vi.mock("@/services/adminPermissions", () => ({ requireAdminPermission: mocks.requireAdminPermission }));

import { hasAdminPermission } from "./adminPermission";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hasAdminPermission", () => {
  it("item 32 — an ADMIN the fresh check grants passes, delegating id/permission through unchanged", async () => {
    mocks.requireAdminPermission.mockResolvedValue({ id: "u2", role: "ADMIN" });
    const result = await hasAdminPermission({ id: "u2", role: "ADMIN" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(true);
    expect(mocks.requireAdminPermission).toHaveBeenCalledWith({ user: { id: "u2", role: "ADMIN" } }, "ADMIN_MESSAGE_REPORTS_READ");
  });

  it("item 33 — an ADMIN the fresh check denies (e.g. missing assignment) returns false, never throws", async () => {
    mocks.requireAdminPermission.mockRejectedValue(new Error("FORBIDDEN"));
    const result = await hasAdminPermission({ id: "u3", role: "ADMIN" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(false);
  });

  it("SUPER_ADMIN also goes through the fresh check — the SUPER_ADMIN bypass is no longer decided from the stale role alone", async () => {
    mocks.requireAdminPermission.mockResolvedValue({ id: "u1", role: "SUPER_ADMIN" });
    const result = await hasAdminPermission({ id: "u1", role: "SUPER_ADMIN" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(true);
    expect(mocks.requireAdminPermission).toHaveBeenCalledTimes(1);
  });

  it("a JWT claiming SUPER_ADMIN whose current DB role no longer qualifies is denied — the stale role never short-circuits to true", async () => {
    mocks.requireAdminPermission.mockRejectedValue(new Error("FORBIDDEN"));
    const result = await hasAdminPermission({ id: "u1", role: "SUPER_ADMIN" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(false);
  });

  it("item 34 — PARENT is denied by the cheap pre-filter alone, never reaching the DB-fresh check", async () => {
    const result = await hasAdminPermission({ id: "u4", role: "PARENT" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(false);
    expect(mocks.requireAdminPermission).not.toHaveBeenCalled();
  });

  it("item 35 — STUDENT is denied by the pre-filter alone", async () => {
    const result = await hasAdminPermission({ id: "u5", role: "STUDENT" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(false);
    expect(mocks.requireAdminPermission).not.toHaveBeenCalled();
  });

  it("item 36 — TUTOR is denied by the pre-filter alone", async () => {
    const result = await hasAdminPermission({ id: "u6", role: "TUTOR" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(false);
    expect(mocks.requireAdminPermission).not.toHaveBeenCalled();
  });

  it("a permission granted for a DIFFERENT permission does not satisfy this check — propagated straight from the fresh check's own exact-match denial", async () => {
    mocks.requireAdminPermission.mockRejectedValue(new Error("FORBIDDEN"));
    const result = await hasAdminPermission({ id: "u7", role: "ADMIN" }, "ADMIN_MESSAGE_REPORTS_MANAGE");
    expect(result).toBe(false);
  });
});
