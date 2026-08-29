import "server-only";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

/**
 * BETA-OPS1 — admin suspension for Student and Parent accounts, reusing the
 * same `User.deactivatedAt` field already wired into login (auth.ts) and
 * password reset (passwordReset.ts) for Tutor/Admin — see the mission's
 * explicit instruction not to create a second, competing status source.
 * Suspension is reversible (never a delete), blocks NEW authority
 * (financial/account-management, via studentAuthorization.ts's
 * actorDeactivatedAt gate) while preserving historical/view access, and is
 * scoped to exactly the targeted individual account — never cascaded to a
 * sibling StudentProfile or to the guardian relationship itself.
 */

class AccountSuspensionError extends Error {}

async function suspendUser(userId: string, adminId: string, reason: string, action: string, entityType: "StudentProfile" | "ParentProfile", entityId: string) {
  await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true } });
    if (!target) throw new AccountSuspensionError("TARGET_NOT_FOUND");
    if (target.deactivatedAt) throw new AccountSuspensionError("ALREADY_SUSPENDED");
    await tx.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } });
    await writeAuditLog({ actorUserId: adminId, action, entityType, entityId, metadata: { reason, targetUserId: userId } }, tx);
  });
}

async function reactivateUser(userId: string, adminId: string, reason: string, action: string, entityType: "StudentProfile" | "ParentProfile", entityId: string) {
  await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true } });
    if (!target) throw new AccountSuspensionError("TARGET_NOT_FOUND");
    if (!target.deactivatedAt) throw new AccountSuspensionError("NOT_SUSPENDED");
    await tx.user.update({ where: { id: userId }, data: { deactivatedAt: null } });
    await writeAuditLog({ actorUserId: adminId, action, entityType, entityId, metadata: { reason, targetUserId: userId } }, tx);
  });
}

/** Suspends a Student's own login (self-managed learners, or a
 * guardian-managed student's own restricted login if one exists). No-op
 * target error if the StudentProfile has no linked User at all — nothing to
 * suspend, and guardian-managed access is governed by the guardian's own
 * account instead (see suspendParentAccount). */
export async function suspendStudentAccount(studentProfileId: string, adminId: string, reason: string) {
  const student = await db.studentProfile.findUnique({ where: { id: studentProfileId }, select: { userId: true } });
  if (!student) throw new AccountSuspensionError("STUDENT_NOT_FOUND");
  if (!student.userId) throw new AccountSuspensionError("STUDENT_HAS_NO_LOGIN");
  await suspendUser(student.userId, adminId, reason, "student.suspended", "StudentProfile", studentProfileId);
}

export async function reactivateStudentAccount(studentProfileId: string, adminId: string, reason: string) {
  const student = await db.studentProfile.findUnique({ where: { id: studentProfileId }, select: { userId: true } });
  if (!student) throw new AccountSuspensionError("STUDENT_NOT_FOUND");
  if (!student.userId) throw new AccountSuspensionError("STUDENT_HAS_NO_LOGIN");
  await reactivateUser(student.userId, adminId, reason, "student.reactivated", "StudentProfile", studentProfileId);
}

/** Suspends a Parent/guardian's own login. Deliberately does NOT touch any
 * ParentStudentRelationship row or any linked child's own account/status —
 * a suspended guardian simply loses financial/management authority for
 * every child they manage (enforced by studentAuthorization.ts's
 * actorDeactivatedAt gate), without freeing the child to self-manage or
 * affecting sibling accounts. */
export async function suspendParentAccount(parentProfileId: string, adminId: string, reason: string) {
  const parent = await db.parentProfile.findUnique({ where: { id: parentProfileId }, select: { userId: true } });
  if (!parent) throw new AccountSuspensionError("PARENT_NOT_FOUND");
  await suspendUser(parent.userId, adminId, reason, "parent.suspended", "ParentProfile", parentProfileId);
}

export async function reactivateParentAccount(parentProfileId: string, adminId: string, reason: string) {
  const parent = await db.parentProfile.findUnique({ where: { id: parentProfileId }, select: { userId: true } });
  if (!parent) throw new AccountSuspensionError("PARENT_NOT_FOUND");
  await reactivateUser(parent.userId, adminId, reason, "parent.reactivated", "ParentProfile", parentProfileId);
}
