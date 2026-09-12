import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { acceptAdminInvitation, createAdminInvitation, previewAdminInvitation, resendAdminInvitation } from "./adminInvitation";
import { replaceAdminPermissions, requireAdminPermission, requireActiveAdmin, requireSuperAdmin } from "./adminPermissions";

const stamp = `admin-management-${Date.now()}`;
const ids: string[] = [];
let ownerId = "";
let adminId = "";

describe("Admin Management integration", () => {
  beforeAll(async () => {
    const owner = await db.user.create({ data: { email: `${stamp}-owner@example.test`, name: "Owner", role: "SUPER_ADMIN" } });
    const admin = await db.user.create({ data: { email: `${stamp}-admin@example.test`, name: "Admin", role: "ADMIN" } });
    ownerId = owner.id; adminId = admin.id; ids.push(owner.id, admin.id);
  });

  afterAll(async () => {
    await db.adminInvitation.deleteMany({ where: { OR: [{ invitedById: { in: ids } }, { acceptedUserId: { in: ids } }] } });
    await db.adminPermissionAssignment.deleteMany({ where: { OR: [{ userId: { in: ids } }, { grantedById: { in: ids } }] } });
    await db.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("creates, resends, revokes and invalidates invitation tokens", async () => {
    const first = await createAdminInvitation(db, { firstName: "Invite", lastName: "One", email: `${stamp}-invite@example.test`, invitedById: ownerId, rolePreset: "OPERATIONS" });
    expect(first.invitation.tokenHash).not.toContain(first.rawToken);
    expect(first.invitation.expiresAt.getTime() - first.invitation.createdAt.getTime()).toBeGreaterThanOrEqual(72 * 60 * 60 * 1000 - 1000);
    const second = await resendAdminInvitation(db, first.invitation.id, ownerId);
    expect(await previewAdminInvitation(db, first.rawToken)).toBeNull();
    expect(await previewAdminInvitation(db, second.rawToken)).toMatchObject({ id: second.invitation.id });
    await db.adminInvitation.update({ where: { id: second.invitation.id }, data: { revokedAt: new Date() } });
    expect(await previewAdminInvitation(db, second.rawToken)).toBeNull();
  });

  it("activates atomically, persists permissions and rejects replay", async () => {
    const created = await createAdminInvitation(db, { firstName: "Active", lastName: "Admin", email: `${stamp}-active@example.test`, invitedById: ownerId, rolePreset: "FINANCE_READ_ONLY" });
    const result = await acceptAdminInvitation(db, created.rawToken, "Safe-test-password-123!"); ids.push(result.userId);
    const activated = await db.user.findUniqueOrThrow({ where: { id: result.userId }, include: { adminPermissions: true, adminInvitationAccepted: true } });
    expect(activated.role).toBe("ADMIN");
    expect(activated.adminPermissions.map((row) => row.permission)).toContain("ADMIN_PAYMENTS_READ");
    expect(activated.adminPermissions.map((row) => row.permission)).not.toContain("ADMIN_PRICING_MANAGE");
    expect(activated.adminInvitationAccepted?.acceptedAt).toBeTruthy();
    await expect(acceptAdminInvitation(db, created.rawToken, "Safe-test-password-123!")).rejects.toThrow("INVALID_INVITATION");
  });

  it("rolls back failed activation and leaves the invitation recoverable", async () => {
    const existing = await db.user.create({ data: { email: `${stamp}-duplicate@example.test`, role: "STUDENT" } }); ids.push(existing.id);
    const created = await createAdminInvitation(db, { firstName: "Duplicate", lastName: "Email", email: existing.email, invitedById: ownerId, rolePreset: "OPERATIONS" });
    await expect(acceptAdminInvitation(db, created.rawToken, "Safe-test-password-123!")).rejects.toThrow("EMAIL_EXISTS");
    expect(await previewAdminInvitation(db, created.rawToken)).not.toBeNull();
  });

  it("updates permissions and immediately denies a suspended Admin", async () => {
    await replaceAdminPermissions(adminId, ["ADMIN_DASHBOARD_VIEW", "ADMIN_TUTORS_READ"], ownerId);
    await expect(requireAdminPermission({ user: { id: adminId, role: "ADMIN" } }, "ADMIN_TUTORS_READ")).resolves.toMatchObject({ id: adminId });
    await expect(requireAdminPermission({ user: { id: adminId, role: "ADMIN" } }, "ADMIN_PRICING_MANAGE")).rejects.toThrow("FORBIDDEN");
    await expect(replaceAdminPermissions(adminId, [], adminId)).rejects.toThrow("SELF_PERMISSION_CHANGE_DENIED");
    await db.user.update({ where: { id: adminId }, data: { deactivatedAt: new Date() } });
    await expect(requireAdminPermission({ user: { id: adminId, role: "ADMIN" } }, "ADMIN_TUTORS_READ")).rejects.toThrow("FORBIDDEN");
    await db.user.update({ where: { id: adminId }, data: { deactivatedAt: null } });
    await expect(requireAdminPermission({ user: { id: adminId, role: "ADMIN" } }, "ADMIN_TUTORS_READ")).resolves.toBeTruthy();
  });

  it("keeps non-admins denied and makes promoted Super Admin access role-authoritative", async () => {
    const student = await db.user.create({ data: { email: `${stamp}-student@example.test`, role: "STUDENT" } }); ids.push(student.id);
    await expect(requireAdminPermission({ user: { id: student.id, role: "STUDENT" } }, "ADMIN_DASHBOARD_VIEW")).rejects.toThrow("FORBIDDEN");
    await db.user.update({ where: { id: adminId }, data: { role: "SUPER_ADMIN" } });
    await expect(requireAdminPermission({ user: { id: adminId, role: "SUPER_ADMIN" } }, "ADMIN_ADMINS_MANAGE")).resolves.toBeTruthy();
  });
});

// ADMIN-AUTH-HARDENING1 — requireActiveAdmin / requireSuperAdmin, the two
// new primitives every stale-auth fix in this mission is built on. Each
// test uses a fresh, dedicated fixture (never the shared adminId/ownerId
// above) so ordering never matters and every scenario starts from a known,
// unambiguous state.
describe("requireActiveAdmin / requireSuperAdmin — DB-fresh admin authorization (ADMIN-AUTH-HARDENING1)", () => {
  const authHardeningIds: string[] = [];

  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { actorUserId: { in: authHardeningIds } } });
    await db.adminPermissionAssignment.deleteMany({ where: { userId: { in: authHardeningIds } } });
    await db.user.deleteMany({ where: { id: { in: authHardeningIds } } });
  });

  async function makeUser(role: "ADMIN" | "SUPER_ADMIN" | "STUDENT", suffix: string) {
    const user = await db.user.create({ data: { email: `${stamp}-hardening-${suffix}@example.test`, role } });
    authHardeningIds.push(user.id);
    return user;
  }

  it("1/7 — an active ADMIN and an active SUPER_ADMIN both pass requireActiveAdmin", async () => {
    const admin = await makeUser("ADMIN", "active-admin");
    const superAdmin = await makeUser("SUPER_ADMIN", "active-super");
    await expect(requireActiveAdmin({ user: { id: admin.id, role: "ADMIN" } })).resolves.toEqual({ id: admin.id, role: "ADMIN" });
    await expect(requireActiveAdmin({ user: { id: superAdmin.id, role: "SUPER_ADMIN" } })).resolves.toEqual({ id: superAdmin.id, role: "SUPER_ADMIN" });
  });

  it("3/13 — DEMOTION: a session that still claims ADMIN is denied the instant the DB role changes, with NO new session issued (two sequential calls against the SAME stale session object)", async () => {
    const admin = await makeUser("ADMIN", "demoted");
    const staleSession = { user: { id: admin.id, role: "ADMIN" } }; // never re-created — simulates an unrefreshed JWT
    await expect(requireActiveAdmin(staleSession)).resolves.toEqual({ id: admin.id, role: "ADMIN" }); // first request: still genuinely ADMIN
    await db.user.update({ where: { id: admin.id }, data: { role: "STUDENT" } }); // demoted out-of-band, e.g. by a SUPER_ADMIN
    await expect(requireActiveAdmin(staleSession)).rejects.toThrow("FORBIDDEN"); // second request: SAME stale session, now denied
  });

  it("4 — DEACTIVATION: a session that still claims ADMIN is denied the instant deactivatedAt is set, no session change", async () => {
    const admin = await makeUser("ADMIN", "deactivated");
    const staleSession = { user: { id: admin.id, role: "ADMIN" } };
    await expect(requireActiveAdmin(staleSession)).resolves.toBeTruthy();
    await db.user.update({ where: { id: admin.id }, data: { deactivatedAt: new Date() } });
    await expect(requireActiveAdmin(staleSession)).rejects.toThrow("FORBIDDEN");
  });

  it("5 — a session for a User row that no longer exists is denied, not thrown as an unhandled error", async () => {
    const admin = await makeUser("ADMIN", "to-delete");
    const staleSession = { user: { id: admin.id, role: "ADMIN" } };
    await db.auditLog.deleteMany({ where: { actorUserId: admin.id } });
    await db.user.delete({ where: { id: admin.id } });
    authHardeningIds.splice(authHardeningIds.indexOf(admin.id), 1);
    await expect(requireActiveAdmin(staleSession)).rejects.toThrow("FORBIDDEN");
  });

  it("8 — a session claiming SUPER_ADMIN is bounded by the CURRENT db role once downgraded to plain ADMIN: requireSuperAdmin denies, requireActiveAdmin still allows (as an ADMIN, not a SUPER_ADMIN)", async () => {
    const user = await makeUser("SUPER_ADMIN", "downgraded");
    const staleSession = { user: { id: user.id, role: "SUPER_ADMIN" } };
    await expect(requireSuperAdmin(staleSession)).resolves.toEqual({ id: user.id, role: "SUPER_ADMIN" });
    await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    await expect(requireSuperAdmin(staleSession)).rejects.toThrow("FORBIDDEN"); // no longer SUPER_ADMIN, even though the session still claims it
    await expect(requireActiveAdmin(staleSession)).resolves.toEqual({ id: user.id, role: "ADMIN" }); // still a genuinely active ADMIN, bounded to the current role
  });

  it("9 — a deactivated SUPER_ADMIN is denied by both requireSuperAdmin and requireActiveAdmin — never an undeactivatable SUPER_ADMIN", async () => {
    const user = await makeUser("SUPER_ADMIN", "deactivated-super");
    const staleSession = { user: { id: user.id, role: "SUPER_ADMIN" } };
    await db.user.update({ where: { id: user.id }, data: { deactivatedAt: new Date() } });
    await expect(requireSuperAdmin(staleSession)).rejects.toThrow("FORBIDDEN");
    await expect(requireActiveAdmin(staleSession)).rejects.toThrow("FORBIDDEN");
  });

  it("10 — a stale AdminPermissionAssignment row can never grant access once the user is no longer ADMIN/SUPER_ADMIN, even though the row itself was never deleted", async () => {
    const user = await makeUser("ADMIN", "stale-assignment");
    await db.adminPermissionAssignment.create({ data: { userId: user.id, permission: "ADMIN_TUTORS_READ", grantedById: user.id } });
    await expect(requireAdminPermission({ user: { id: user.id, role: "ADMIN" } }, "ADMIN_TUTORS_READ")).resolves.toBeTruthy();
    await db.user.update({ where: { id: user.id }, data: { role: "STUDENT" } }); // demoted — the AdminPermissionAssignment row is left behind, untouched
    const stillAssigned = await db.adminPermissionAssignment.findUnique({ where: { userId_permission: { userId: user.id, permission: "ADMIN_TUTORS_READ" } } });
    expect(stillAssigned).not.toBeNull(); // confirms the row really is still there
    await expect(requireAdminPermission({ user: { id: user.id, role: "STUDENT" } }, "ADMIN_TUTORS_READ")).rejects.toThrow("FORBIDDEN"); // yet access is still denied
  });

  it("12 — no session at all is denied by every primitive", async () => {
    await expect(requireActiveAdmin(null)).rejects.toThrow("FORBIDDEN");
    await expect(requireSuperAdmin(null)).rejects.toThrow("FORBIDDEN");
    await expect(requireAdminPermission(null, "ADMIN_DASHBOARD_VIEW")).rejects.toThrow("FORBIDDEN");
  });

  it("14 — concurrent requests around a deactivation: no request racing the write ever incorrectly succeeds AFTER it commits (no persistent stale-authorization cache anywhere in the path)", async () => {
    const admin = await makeUser("ADMIN", "concurrent");
    const staleSession = { user: { id: admin.id, role: "ADMIN" } };

    // A batch of concurrent reads before the deactivation all succeed.
    const before = await Promise.all(Array.from({ length: 5 }, () => requireActiveAdmin(staleSession)));
    for (const r of before) expect(r).toEqual({ id: admin.id, role: "ADMIN" });

    await db.user.update({ where: { id: admin.id }, data: { deactivatedAt: new Date() } });

    // Every request issued AFTER the write commits is denied — none of them
    // can observe a cached pre-deactivation result, because there is no
    // cache: each call is its own fresh db.user.findUnique.
    const after = await Promise.allSettled(Array.from({ length: 5 }, () => requireActiveAdmin(staleSession)));
    for (const r of after) expect(r.status).toBe("rejected");
  });
});
