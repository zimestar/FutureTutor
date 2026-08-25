"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireAdminPermission } from "@/services/adminPermissions";
import {
  startDocumentReview,
  requireInterview,
  sendToFinalReview,
  approveTutor,
  rejectTutor,
  suspendTutor,
  reactivateTutor,
} from "@/services/tutorApplicationWorkflow";

async function requireAdmin(permission: "ADMIN_TUTORS_REVIEW" | "ADMIN_TUTORS_APPROVE" | "ADMIN_TUTORS_SUSPEND") {
  const session = await auth();
  try { return await requireAdminPermission(session, permission); } catch { return null; }
}

export async function startDocumentReviewAction(tutorProfileId: string) {
  const admin = await requireAdmin("ADMIN_TUTORS_REVIEW");
  if (!admin) return;
  await startDocumentReview(tutorProfileId, admin.id);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
  revalidatePath("/admin/tutors");
}

export async function requireInterviewAction(tutorProfileId: string) {
  const admin = await requireAdmin("ADMIN_TUTORS_REVIEW");
  if (!admin) return;
  await requireInterview(tutorProfileId, admin.id);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
}

export async function sendToFinalReviewAction(tutorProfileId: string) {
  const admin = await requireAdmin("ADMIN_TUTORS_REVIEW");
  if (!admin) return;
  await sendToFinalReview(tutorProfileId, admin.id);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
}

export async function approveTutorAction(tutorProfileId: string) {
  const admin = await requireAdmin("ADMIN_TUTORS_APPROVE");
  if (!admin) return;
  await approveTutor(tutorProfileId, admin.id);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
  revalidatePath("/admin/tutors");
}

export async function rejectTutorAction(tutorProfileId: string, formData: FormData) {
  const admin = await requireAdmin("ADMIN_TUTORS_APPROVE");
  if (!admin) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await rejectTutor(tutorProfileId, admin.id, reason);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
  revalidatePath("/admin/tutors");
}

export async function suspendTutorAction(tutorProfileId: string, formData: FormData) {
  const admin = await requireAdmin("ADMIN_TUTORS_SUSPEND");
  if (!admin) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await suspendTutor(tutorProfileId, admin.id, reason);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
  revalidatePath("/admin/tutors");
}

export async function reactivateTutorAction(tutorProfileId: string, formData: FormData) {
  const admin = await requireAdmin("ADMIN_TUTORS_SUSPEND");
  if (!admin) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await reactivateTutor(tutorProfileId, admin.id, reason);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
  revalidatePath("/admin/tutors");
}
