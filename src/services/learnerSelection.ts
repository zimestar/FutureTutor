import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { canInitiatePaidBooking } from "@/services/studentAuthorization";

/**
 * Phase H.7 — Direct Booking + Quick Match Learner/Payer Wiring.
 *
 * The server-authoritative answer to "which StudentProfiles may this actor
 * financially book/quote/pay for right now" — never invented by a React
 * component, never inferred from role alone. Every candidate is
 * independently re-verified through H.2's `canInitiatePaidBooking`, the
 * same capability check every creation Server Action re-runs itself — this
 * function is a convenience for building a selector's option list, not a
 * second, divergent authorization path. If `canInitiatePaidBooking` denies
 * a candidate, it is silently omitted rather than surfaced with a reason
 * (no different from how it never appeared in the source relationship/
 * profile lookup in the first place, from the actor's point of view).
 *
 * Expected results:
 * - SELF_MANAGED Student: own profile only.
 * - ACTIVE Parent guardian: every linked GUARDIAN_MANAGED child with a
 *   currently-ACTIVE ParentStudentRelationship (REVOKED relationships are
 *   excluded at the query level, before any candidate is even considered).
 * - GUARDIAN_MANAGED Student's own restricted login: empty — their own
 *   linked profile IS considered as a candidate (they do have a `userId`
 *   link), but `canInitiatePaidBooking` correctly denies it (H.2:
 *   `canManageStudentAccount`/financial authority requires SELF_MANAGED
 *   self-authority or ACTIVE guardian authority, neither of which a
 *   restricted login's own relationship to itself satisfies).
 * - Tutor / unrelated actor: empty (no own StudentProfile, no ParentProfile).
 */
export async function listBookableStudentsForActor(client: PrismaClient, actorUserId: string) {
  const [ownProfile, parentProfile] = await Promise.all([
    client.studentProfile.findUnique({
      where: { userId: actorUserId },
      include: { academicLevel: { select: { slug: true } } },
    }),
    client.parentProfile.findUnique({ where: { userId: actorUserId } }),
  ]);

  const candidates = [];
  if (ownProfile) candidates.push(ownProfile);

  if (parentProfile) {
    const relationships = await client.parentStudentRelationship.findMany({
      where: { parentProfileId: parentProfile.id, status: "ACTIVE" },
      include: { studentProfile: { include: { academicLevel: { select: { slug: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    candidates.push(...relationships.map((rel) => rel.studentProfile));
  }

  const authorizedFlags = await Promise.all(
    candidates.map((candidate) => canInitiatePaidBooking(client, actorUserId, candidate.id))
  );

  return candidates.filter((_, index) => authorizedFlags[index]);
}
