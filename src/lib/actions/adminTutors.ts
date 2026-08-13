"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    return null;
  }
  return user;
}

export async function approveTutorAction(tutorProfileId: string) {
  const admin = await requireAdmin();
  if (!admin) return;

  await db.$transaction([
    db.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "APPROVED" },
    }),
    db.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: "tutor.approved",
        entityType: "TutorProfile",
        entityId: tutorProfileId,
      },
    }),
  ]);

  revalidatePath("/admin/tutors");
}

export async function rejectTutorAction(tutorProfileId: string) {
  const admin = await requireAdmin();
  if (!admin) return;

  await db.$transaction([
    db.tutorProfile.update({
      where: { id: tutorProfileId },
      data: { applicationStatus: "REJECTED" },
    }),
    db.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: "tutor.rejected",
        entityType: "TutorProfile",
        entityId: tutorProfileId,
      },
    }),
  ]);

  revalidatePath("/admin/tutors");
}
