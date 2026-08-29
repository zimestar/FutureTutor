"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireAdminPermission } from "@/services/adminPermissions";
import { suspendStudentAccount, reactivateStudentAccount, suspendParentAccount, reactivateParentAccount } from "@/services/accountSuspension";

async function requireAdmin(permission: "ADMIN_STUDENTS_SUSPEND" | "ADMIN_GUARDIANS_SUSPEND") {
  const session = await auth();
  try {
    return await requireAdminPermission(session, permission);
  } catch {
    return null;
  }
}

export async function suspendStudentAction(studentProfileId: string, formData: FormData) {
  const admin = await requireAdmin("ADMIN_STUDENTS_SUSPEND");
  if (!admin) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await suspendStudentAccount(studentProfileId, admin.id, reason);
  revalidatePath(`/admin/students/${studentProfileId}`);
  revalidatePath("/admin/students");
}

export async function reactivateStudentAction(studentProfileId: string, formData: FormData) {
  const admin = await requireAdmin("ADMIN_STUDENTS_SUSPEND");
  if (!admin) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await reactivateStudentAccount(studentProfileId, admin.id, reason);
  revalidatePath(`/admin/students/${studentProfileId}`);
  revalidatePath("/admin/students");
}

export async function suspendParentAction(parentProfileId: string, formData: FormData) {
  const admin = await requireAdmin("ADMIN_GUARDIANS_SUSPEND");
  if (!admin) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await suspendParentAccount(parentProfileId, admin.id, reason);
  revalidatePath(`/admin/parents/${parentProfileId}`);
  revalidatePath("/admin/parents");
}

export async function reactivateParentAction(parentProfileId: string, formData: FormData) {
  const admin = await requireAdmin("ADMIN_GUARDIANS_SUSPEND");
  if (!admin) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await reactivateParentAccount(parentProfileId, admin.id, reason);
  revalidatePath(`/admin/parents/${parentProfileId}`);
  revalidatePath("/admin/parents");
}
