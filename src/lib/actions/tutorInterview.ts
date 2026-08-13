"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { scheduleInterview, recordInterviewEvaluation, completeInterview } from "@/services/tutorApplicationWorkflow";
import type { TutorInterviewCriterion } from "@/generated/prisma/enums";

const CRITERIA: TutorInterviewCriterion[] = [
  "COMMUNICATION",
  "PEDAGOGY",
  "PROFESSIONALISM",
  "SUBJECT_CONFIDENCE",
  "STUDENT_INTERACTION",
  "MOTIVATION_ALIGNMENT",
];

async function requireAdmin() {
  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

export async function scheduleInterviewAction(tutorProfileId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  if (!scheduledAtRaw) return;
  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) return;

  await scheduleInterview(tutorProfileId, admin.id, { scheduledAt, interviewerUserId: admin.id });
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
}

export async function saveInterviewRubricAction(tutorInterviewId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;

  const interview = await db.tutorInterview.findUnique({ where: { id: tutorInterviewId } });
  if (!interview) return;

  for (const criterion of CRITERIA) {
    const scoreRaw = formData.get(`criterion-${criterion}-score`);
    const notes = formData.get(`criterion-${criterion}-notes`);
    const score = Number(scoreRaw);
    if (!scoreRaw || Number.isNaN(score) || score < 1 || score > 5) continue;
    await recordInterviewEvaluation(
      tutorInterviewId,
      admin.id,
      criterion,
      score,
      typeof notes === "string" && notes ? notes : undefined
    );
  }

  const evaluationCount = await db.tutorInterviewEvaluation.count({ where: { tutorInterviewId } });
  if (evaluationCount === CRITERIA.length) {
    try {
      await completeInterview(interview.tutorProfileId, admin.id);
    } catch {
      // Tutor may not be in INTERVIEW_REQUIRED yet (e.g. rubric saved twice) — the
      // rubric itself is still recorded; this just skips the redundant transition.
    }
  }

  revalidatePath(`/admin/tutors/${interview.tutorProfileId}`);
}
