import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { adminPermissionAssignment: { findUnique: mocks.findUnique } } }));

import { hasAdminPermission } from "./adminPermission";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(null);
});

describe("hasAdminPermission", () => {
  it("item 31 — SUPER_ADMIN always passes, without querying the DB", async () => {
    const result = await hasAdminPermission({ id: "u1", role: "SUPER_ADMIN" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(true);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("item 32 — an ADMIN with the exact assignment passes", async () => {
    mocks.findUnique.mockResolvedValue({ id: "assignment-1" });
    const result = await hasAdminPermission({ id: "u2", role: "ADMIN" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(true);
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_permission: { userId: "u2", permission: "ADMIN_MESSAGE_REPORTS_READ" } } })
    );
  });

  it("item 33 — an ADMIN without the assignment is denied", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const result = await hasAdminPermission({ id: "u3", role: "ADMIN" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(false);
  });

  it("item 34 — PARENT is always denied, never queries the DB", async () => {
    const result = await hasAdminPermission({ id: "u4", role: "PARENT" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(false);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("item 35 — STUDENT is always denied", async () => {
    const result = await hasAdminPermission({ id: "u5", role: "STUDENT" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(false);
  });

  it("item 36 — TUTOR is always denied", async () => {
    const result = await hasAdminPermission({ id: "u6", role: "TUTOR" }, "ADMIN_MESSAGE_REPORTS_READ");
    expect(result).toBe(false);
  });

  it("a permission granted for a DIFFERENT permission does not satisfy this check (exact match only)", async () => {
    mocks.findUnique.mockResolvedValue(null); // simulates the compound-unique lookup finding nothing for THIS specific permission
    const result = await hasAdminPermission({ id: "u7", role: "ADMIN" }, "ADMIN_MESSAGE_REPORTS_MANAGE");
    expect(result).toBe(false);
  });
});
