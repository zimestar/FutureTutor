"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { acknowledgeTrainingModule, requireTraining, completeTraining } from "@/services/tutorApplicationWorkflow";

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

export async function acknowledgeTrainingModuleAction(trainingModuleId: string) {
  const tutorProfile = await requireTutorProfile();
  if (!tutorProfile) return;

  await acknowledgeTrainingModule(tutorProfile.id, trainingModuleId);

  const [requiredModules, completedCount] = await Promise.all([
    db.trainingModule.count({ where: { isRequired: true, isActive: true } }),
    db.tutorTrainingProgress.count({
      where: { tutorProfileId: tutorProfile.id, completedAt: { not: null } },
    }),
  ]);
  if (requiredModules > 0 && completedCount >= requiredModules && tutorProfile.applicationStatus === "TRAINING_REQUIRED") {
    try {
      await completeTraining(tutorProfile.id, tutorProfile.userId);
    } catch {
      // Someone else may have already advanced it — safe to ignore.
    }
  }

  revalidatePath("/tutor/training");
}

export async function requireTrainingAction(tutorProfileId: string) {
  const admin = await requireAdmin();
  if (!admin) return;
  await requireTraining(tutorProfileId, admin.id);
  revalidatePath(`/admin/tutors/${tutorProfileId}`);
}
