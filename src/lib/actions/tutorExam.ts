"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordExamAttempt, requireExam, completeExam } from "@/services/tutorApplicationWorkflow";
import { PLATFORM_EXAM_QUESTIONS } from "@/lib/exam/examQuestions";
import { scoreExam } from "@/lib/exam/examAnswerKey.server";

export type ExamActionState = { error?: string; success?: boolean; score?: number; passed?: boolean } | undefined;

async function requireTutorProfile() {
  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") return null;
  return db.tutorProfile.findUnique({ where: { userId: session.user.id } });
}

async function requireAdmin() {
  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  return user;
}

async function getOrCreatePlatformExam() {
  const existing = await db.tutorExam.findFirst({ where: { type: "PLATFORM" } });
  if (existing) return existing;
  return db.tutorExam.create({
    data: { type: "PLATFORM", title: "FutureTutor Platform Exam", passingScore: 80 },
  });
}

export async function submitPlatformExamAction(
  _prevState: ExamActionState,
  formData: FormData
): Promise<ExamActionState> {
  const t = await getTranslations("tutorExam.errors");
  const tutorProfile = await requireTutorProfile();
  if (!tutorProfile) return { error: t("notATutor") };

  const startedAtRaw = formData.get("startedAt");
  const startedAt = typeof startedAtRaw === "string" && startedAtRaw ? new Date(startedAtRaw) : new Date();

  const answers: Record<string, string> = {};
  for (const question of PLATFORM_EXAM_QUESTIONS) {
    answers[question.id] = String(formData.get(`answer-${question.id}`) ?? "");
  }

  const { score, passed } = scoreExam(answers);
  const exam = await getOrCreatePlatformExam();
  await recordExamAttempt(tutorProfile.id, exam.id, score, passed, startedAt);

  if (passed && tutorProfile.applicationStatus === "EXAM_REQUIRED") {
    try {
      await completeExam(tutorProfile.id, tutorProfile.userId);
    } catch {
      // Non-fatal — admin can still advance manually from the detail view.
    }
  }

  revalidatePath("/tutor/exam");
  return { success: true, score, passed };
}

export async function requireExamAction(tutorProfileId: string) {
  const admin = await requireAdmin();
  if (!admin) return;
  await requireExam(tutorProfileId, admin.id);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
}
