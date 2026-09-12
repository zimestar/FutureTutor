import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hasAdminPermission } from "./adminPermission";

// ADMIN-AUTH-HARDENING1 — real, unmocked, end-to-end proof that
// hasAdminPermission's delegation to requireAdminPermission (services/
// adminPermissions.ts) genuinely re-reads current DB state, against a real
// database — not just the mocked contract test in adminPermission.test.ts.

const stamp = `admin-permission-it-${Date.now()}`;
const ids: string[] = [];

afterAll(async () => {
  await db.adminPermissionAssignment.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

async function makeUser(role: "ADMIN" | "SUPER_ADMIN" | "STUDENT", suffix: string) {
  const user = await db.user.create({ data: { email: `${stamp}-${suffix}@example.test`, role } });
  ids.push(user.id);
  return user;
}

describe("hasAdminPermission — real DB (ADMIN-AUTH-HARDENING1)", () => {
  it("an ADMIN with a real AdminPermissionAssignment row passes", async () => {
    const admin = await makeUser("ADMIN", "granted");
    await db.adminPermissionAssignment.create({ data: { userId: admin.id, permission: "ADMIN_TUTORS_READ", grantedById: admin.id } });
    await expect(hasAdminPermission({ id: admin.id, role: "ADMIN" }, "ADMIN_TUTORS_READ")).resolves.toBe(true);
  });

  it("an ADMIN without the assignment is denied", async () => {
    const admin = await makeUser("ADMIN", "ungranted");
    await expect(hasAdminPermission({ id: admin.id, role: "ADMIN" }, "ADMIN_TUTORS_READ")).resolves.toBe(false);
  });

  it("DEMOTION: an ADMIN with a granted permission loses it the instant the DB role changes, same stale role passed in every call", async () => {
    const admin = await makeUser("ADMIN", "demoted-hasperm");
    await db.adminPermissionAssignment.create({ data: { userId: admin.id, permission: "ADMIN_TUTORS_READ", grantedById: admin.id } });
    const staleUser = { id: admin.id, role: "ADMIN" };
    await expect(hasAdminPermission(staleUser, "ADMIN_TUTORS_READ")).resolves.toBe(true);
    await db.user.update({ where: { id: admin.id }, data: { role: "STUDENT" } });
    await expect(hasAdminPermission(staleUser, "ADMIN_TUTORS_READ")).resolves.toBe(false);
  });

  it("DEACTIVATION: a deactivated ADMIN is denied even with a granted permission, no new session", async () => {
    const admin = await makeUser("ADMIN", "deactivated-hasperm");
    await db.adminPermissionAssignment.create({ data: { userId: admin.id, permission: "ADMIN_TUTORS_READ", grantedById: admin.id } });
    const staleUser = { id: admin.id, role: "ADMIN" };
    await expect(hasAdminPermission(staleUser, "ADMIN_TUTORS_READ")).resolves.toBe(true);
    await db.user.update({ where: { id: admin.id }, data: { deactivatedAt: new Date() } });
    await expect(hasAdminPermission(staleUser, "ADMIN_TUTORS_READ")).resolves.toBe(false);
  });

  it("a real SUPER_ADMIN passes any permission with zero AdminPermissionAssignment rows", async () => {
    const superAdmin = await makeUser("SUPER_ADMIN", "real-super");
    await expect(hasAdminPermission({ id: superAdmin.id, role: "SUPER_ADMIN" }, "ADMIN_ADMINS_MANAGE")).resolves.toBe(true);
  });

  it("a stale SUPER_ADMIN role in the passed-in user object cannot preserve authority once the DB no longer agrees", async () => {
    const superAdmin = await makeUser("SUPER_ADMIN", "downgraded-super-hasperm");
    const staleUser = { id: superAdmin.id, role: "SUPER_ADMIN" };
    await expect(hasAdminPermission(staleUser, "ADMIN_ADMINS_MANAGE")).resolves.toBe(true);
    await db.user.update({ where: { id: superAdmin.id }, data: { role: "ADMIN" } });
    await expect(hasAdminPermission(staleUser, "ADMIN_ADMINS_MANAGE")).resolves.toBe(false); // no assignment row, and no longer SUPER_ADMIN
  });
});
