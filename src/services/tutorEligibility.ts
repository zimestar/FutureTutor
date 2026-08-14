import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { TutoringMode } from "@/generated/prisma/enums";
import { isTutorFreeAt } from "@/lib/availability";
import { normalizeCity } from "@/lib/normalizeCity";

export interface EligibilityRequest {
  // TutoringRequest id — when given, excludes tutors who already hold *any*
  // invitation (any status) for this exact request, so a tutor who already
  // declined/timed-out in an earlier dispatch round is never re-selected in
  // a later one, and so a tutor can never hold two PENDING invitations for
  // the same request.
  id?: string;
  subjectId: string;
  academicLevelId?: string | null;
  tutoringMode: TutoringMode;
  requestedStartAt: Date;
  durationMinutes: number;
  // Required by src/schemas/tutoringRequest.ts whenever tutoringMode is
  // IN_PERSON — see the city-eligibility gate below. Deliberately does NOT
  // read addressLine1/addressLine2/postalCode: eligibility only needs city,
  // never the full address (see Booking-location-tiers discussion).
  city?: string | null;
}

function isModeCompatible(tutorMode: TutoringMode, requestMode: TutoringMode): boolean {
  if (tutorMode === "BOTH" || requestMode === "BOTH") return true;
  return tutorMode === requestMode;
}

/**
 * Hard pass/fail eligibility filter for Quick Match dispatch — no scoring
 * here (see tutorRanking.ts for the soft, weighted pass over whatever this
 * returns). Reuses getSupplySignal's exact subject/level filter shape
 * (Phase E, src/services/marketplaceSupply.ts) for the DB-level candidate
 * query; the remaining checks (mode, availability point-check, in-person
 * city match, already-invited guard) run in application code because they
 * can't all be expressed as one indexed WHERE clause.
 *
 * TutorScore is deliberately NOT a hard constraint here — every APPROVED
 * tutor already passed the gates that produced their score; a second
 * minimum-score gate would be redundant with approval itself and would
 * arbitrarily exclude tutors admins already vouched for. validationVersion
 * is likewise not checked (Phase D's own decision that it's informational,
 * not a gate — preserved here).
 */
export async function getEligibleTutors(tx: Prisma.TransactionClient, request: EligibilityRequest) {
  const candidates = await tx.tutorProfile.findMany({
    where: {
      applicationStatus: "APPROVED",
      subjects: { some: { subjectId: request.subjectId } },
      ...(request.academicLevelId ? { levels: { some: { academicLevelId: request.academicLevelId } } } : {}),
    },
  });

  const alreadyInvitedTutorIds = request.id
    ? new Set(
        (
          await tx.tutorInvitation.findMany({
            where: { tutoringRequestId: request.id },
            select: { tutorProfileId: true },
          })
        ).map((invitation) => invitation.tutorProfileId)
      )
    : new Set<string>();

  const eligible: typeof candidates = [];
  for (const tutor of candidates) {
    if (alreadyInvitedTutorIds.has(tutor.id)) continue;
    if (!isModeCompatible(tutor.learningMode ?? "BOTH", request.tutoringMode)) continue;
    // In-person only, per the Phase F plan's honest-simplification framing —
    // an exact, normalized city match, never a real distance calculation.
    if (request.tutoringMode === "IN_PERSON" && normalizeCity(tutor.city) !== normalizeCity(request.city)) {
      continue;
    }

    const free = await isTutorFreeAt(tutor.id, request.requestedStartAt, request.durationMinutes, tx);
    if (!free) continue;

    eligible.push(tutor);
  }

  return eligible;
}

/**
 * Single-tutor re-check, used at accept time (see acceptTutorInvitationAction
 * in tutorInvitations.ts, §7b items 5/6 of the Phase F plan) — a tutor's own
 * offerings or applicationStatus could have changed since they were ranked
 * and dispatched. Deliberately does NOT check the already-invited guard
 * (item 8) — at accept time we already know this exact tutor holds the
 * PENDING invitation being accepted. Shares every other rule with
 * getEligibleTutors so there is one definition of "eligible," not two.
 */
export async function isTutorEligibleForRequest(
  tx: Prisma.TransactionClient,
  tutorProfileId: string,
  request: EligibilityRequest
): Promise<boolean> {
  const tutor = await tx.tutorProfile.findUnique({ where: { id: tutorProfileId } });
  if (!tutor || tutor.applicationStatus !== "APPROVED") return false;

  const hasSubject = await tx.tutorSubject.findFirst({ where: { tutorProfileId, subjectId: request.subjectId } });
  if (!hasSubject) return false;

  if (request.academicLevelId) {
    const hasLevel = await tx.tutorLevel.findFirst({ where: { tutorProfileId, academicLevelId: request.academicLevelId } });
    if (!hasLevel) return false;
  }

  if (!isModeCompatible(tutor.learningMode ?? "BOTH", request.tutoringMode)) return false;
  if (request.tutoringMode === "IN_PERSON" && normalizeCity(tutor.city) !== normalizeCity(request.city)) return false;

  return isTutorFreeAt(tutorProfileId, request.requestedStartAt, request.durationMinutes, tx);
}
