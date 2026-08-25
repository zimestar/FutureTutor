import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { acceptAdminInvitation, createAdminInvitation, previewAdminInvitation, resendAdminInvitation } from "./adminInvitation";
import { replaceAdminPermissions, requireAdminPermission } from "./adminPermissions";

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
