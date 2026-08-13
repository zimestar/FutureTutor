"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function toggleFavoriteAction(
  tutorProfileId: string
): Promise<{ favorited: boolean } | { error: string }> {
  const session = await auth();
  const user = session?.user;
  if (!user || user.role !== "STUDENT") {
    return { error: "not-a-student" };
  }

  const studentProfile = await db.studentProfile.findUnique({ where: { userId: user.id } });
  if (!studentProfile) return { error: "no-profile" };

  const existing = await db.tutorFavorite.findUnique({
    where: {
      studentProfileId_tutorProfileId: {
        studentProfileId: studentProfile.id,
        tutorProfileId,
      },
    },
  });

  if (existing) {
    await db.tutorFavorite.delete({ where: { id: existing.id } });
    revalidatePath("/dashboard/favorites");
    return { favorited: false };
  }

  await db.tutorFavorite.create({
    data: { studentProfileId: studentProfile.id, tutorProfileId },
  });
  revalidatePath("/dashboard/favorites");
  return { favorited: true };
}
