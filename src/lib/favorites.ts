import type { Session } from "next-auth";
import { db } from "@/lib/db";

/** Set of tutorProfileIds the signed-in student has favorited, or `undefined` if the viewer isn't a student (no favorite button should render at all). */
export async function getFavoritedTutorIds(session: Session | null): Promise<Set<string> | undefined> {
  if (!session?.user || session.user.role !== "STUDENT") return undefined;

  const studentProfile = await db.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!studentProfile) return undefined;

  const favorites = await db.tutorFavorite.findMany({
    where: { studentProfileId: studentProfile.id },
    select: { tutorProfileId: true },
  });
  return new Set(favorites.map((f) => f.tutorProfileId));
}
