import type { Prisma } from "@/generated/prisma/client";
import type { TutorApplicationStatus } from "@/generated/prisma/enums";

/**
 * RW-03 — the single definition of "a tutor who may receive NEW tutoring
 * commitments" (direct booking, Quick Match dispatch/accept, public
 * discovery, marketplace supply). Two independent conditions, both required:
 *
 *  - TutorProfile.applicationStatus === "APPROVED". Tutor suspension today
 *    sets applicationStatus = "SUSPENDED" (tutorApplicationWorkflow.ts's
 *    suspendTutor), so this is the operative gate.
 *  - User.deactivatedAt === null. The platform-wide account kill-switch
 *    (already enforced for login, messaging, and learner/payer authority).
 *    No application path sets it on a tutor account today, so this is
 *    defense in depth — it guarantees a deactivated tutor account can never
 *    be booked if one is ever deactivated (by future tooling or by hand).
 *
 * Deliberately NOT part of this rule: tutorAgreementAcceptedAt. It is set at
 * application submit, not at approval, so it is not evidence of
 * bookability; it remains its own separate FG-LEGAL2 gate where it applies.
 * Also not part of it: anything about a suspended tutor's EXISTING bookings —
 * this rule governs new commitments only.
 */
export const BOOKABLE_TUTOR_WHERE = {
  applicationStatus: "APPROVED",
  user: { deactivatedAt: null },
} as const satisfies Prisma.TutorProfileWhereInput;

export interface TutorBookabilityFacts {
  applicationStatus: TutorApplicationStatus | null | undefined;
  /** The tutor's own User.deactivatedAt. `undefined` means "not loaded" and
   * fails closed — a caller must explicitly load it to get a `true`. */
  userDeactivatedAt: Date | null | undefined;
}

/** In-memory form of BOOKABLE_TUTOR_WHERE. Fails closed on any missing fact. */
export function isTutorBookable(facts: TutorBookabilityFacts): boolean {
  return facts.applicationStatus === "APPROVED" && facts.userDeactivatedAt === null;
}
