"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  startDocumentReview,
  requireInterview,
  sendToFinalReview,
  approveTutor,
  rejectTutor,
  suspendTutor,
  reactivateTutor,
} from "@/services/tutorApplicationWorkflow";

async function requireAdmin() {
  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

export async function startDocumentReviewAction(tutorProfileId: string) {
  const admin = await requireAdmin();
  if (!admin) return;
  await startDocumentReview(tutorProfileId, admin.id);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
  revalidatePath("/admin/tutors");
}

export async function requireInterviewAction(tutorProfileId: string) {
  const admin = await requireAdmin();
  if (!admin) return;
  await requireInterview(tutorProfileId, admin.id);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
}

export async function sendToFinalReviewAction(tutorProfileId: string) {
  const admin = await requireAdmin();
  if (!admin) return;
  await sendToFinalReview(tutorProfileId, admin.id);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
}

export async function approveTutorAction(tutorProfileId: string) {
  const admin = await requireAdmin();
  if (!admin) return;
  await approveTutor(tutorProfileId, admin.id);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
  revalidatePath("/admin/tutors");
}

export async function rejectTutorAction(tutorProfileId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await rejectTutor(tutorProfileId, admin.id, reason);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
  revalidatePath("/admin/tutors");
}

export async function suspendTutorAction(tutorProfileId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await suspendTutor(tutorProfileId, admin.id, reason);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
  revalidatePath("/admin/tutors");
}

export async function reactivateTutorAction(tutorProfileId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await reactivateTutor(tutorProfileId, admin.id, reason);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
  revalidatePath("/admin/tutors");
}
