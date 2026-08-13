import "server-only";
import { db } from "@/lib/db";

/**
 * Can this authenticated user create/consume a financial quote (pricing,
 * booking) on behalf of the given StudentProfile? Today this only covers an
 * independent student acting for their own profile. This is the single seam
 * a future parent-books-for-child flow extends (checking
 * ParentStudentRelationship) — callers never need to change, only this
 * function's body does.
 *
 * Split into its own server-only module (not authorization.ts) because that
 * file is imported by the client-side Header for role-based nav — pulling
 * `db` (and the Postgres driver) into it would leak Node-only code into the
 * browser bundle.
 */
export async function canActForStudent(userId: string, studentProfileId: string): Promise<boolean> {
  const studentProfile = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { userId: true },
  });
  return studentProfile?.userId === userId;
}
