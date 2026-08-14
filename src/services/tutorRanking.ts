import "server-only";
import type { Prisma, TutorProfile } from "@/generated/prisma/client";
import type { TutorTier } from "@/generated/prisma/enums";

export interface RankedCandidate {
  tutorProfileId: string;
  rankScore: number;
  rankBreakdown: Prisma.InputJsonValue;
  rankingVersion: string;
}

// Ordinal map for the tier tie-breaker factor — TutorTier is an
// admin-set label (Phase E), not derived from any scoring history.
const TIER_ORDINAL: Record<TutorTier, number> = { NEW: 0, VERIFIED: 0.33, SENIOR: 0.67, ELITE: 1 };

/**
 * Four-factor weighted ranking, all weights/thresholds read from
 * TutorRankingSettings so they're admin-tunable without a migration. No
 * distance/travel-time term exists here at all this phase — see the Phase F
 * plan's §3a: no real geographic distance calculation exists yet, and
 * pretending a fixed 1.0 "distanceFactor" is a real weighted signal would be
 * fabricating precision the data can't support. Public rating is excluded
 * for the same reason (always 0 — Review has zero rows anywhere in the app).
 *
 * Every candidate's full breakdown is returned so the caller (
 * quickMatchDispatch.ts) can snapshot it onto the TutorInvitation row that
 * dispatch actually produces — identical inputs always reproduce the same
 * score, and any past dispatch decision is fully explainable after the
 * fact.
 */
export async function rankCandidates(
  tx: Prisma.TransactionClient,
  candidates: TutorProfile[]
): Promise<RankedCandidate[]> {
  const settings = await tx.tutorRankingSettings.findFirst();
  if (!settings) throw new Error("TutorRankingSettings is not seeded — run prisma db seed");

  const ranked: RankedCandidate[] = [];

  for (const candidate of candidates) {
    // Tutor Score — every APPROVED tutor has one (Phase D calculates it at
    // approval time); 0 is a defensive fallback only, never expected in
    // practice for an eligible candidate.
    const score = await tx.tutorScore.findUnique({
      where: {
        tutorProfileId_scopeType_scopeKey: { tutorProfileId: candidate.id, scopeType: "OVERALL", scopeKey: "OVERALL" },
      },
      select: { score: true },
    });
    const tutorScoreRaw = score?.score ?? 0;
    const tutorScoreNorm = tutorScoreRaw / 100;

    // Booking reliability — real Booking.status/cancelledByUserId history
    // where this tutor is the cancelling party. Neutral 1.0 for a tutor
    // with no booking history yet — never penalize for lack of history.
    const totalBookings = await tx.booking.count({ where: { tutorProfileId: candidate.id } });
    const tutorCancelledBookings =
      totalBookings === 0
        ? 0
        : await tx.booking.count({
            where: { tutorProfileId: candidate.id, status: "CANCELLED", cancelledByUserId: candidate.userId },
          });
    const bookingReliabilityFactor =
      totalBookings === 0 ? 1 : Math.max(0, 1 - tutorCancelledBookings / totalBookings);

    // Invitation responsiveness — real TutorInvitation accept/decline/
    // timeout history. Neutral 1.0 below the configured minimum sample
    // size, so a tutor new to Quick Match isn't penalized for having no
    // dispatch history yet.
    const respondedOrExpiredCount = await tx.tutorInvitation.count({
      where: { tutorProfileId: candidate.id, status: { in: ["ACCEPTED", "DECLINED", "EXPIRED"] } },
    });
    const acceptedCount =
      respondedOrExpiredCount === 0
        ? 0
        : await tx.tutorInvitation.count({ where: { tutorProfileId: candidate.id, status: "ACCEPTED" } });
    const invitationResponsivenessFactor =
      respondedOrExpiredCount < settings.minInvitationsForReliabilityData ? 1 : acceptedCount / respondedOrExpiredCount;

    // Tutor tier — small tie-breaker only.
    const tierFactor = TIER_ORDINAL[candidate.payoutTier];

    const tutorScoreContribution = settings.tutorScoreWeight * tutorScoreNorm;
    const bookingReliabilityContribution = settings.bookingReliabilityWeight * bookingReliabilityFactor;
    const invitationResponsivenessContribution = settings.invitationResponsivenessWeight * invitationResponsivenessFactor;
    const tierContribution = settings.tutorTierWeight * tierFactor;

    const rankScore =
      tutorScoreContribution + bookingReliabilityContribution + invitationResponsivenessContribution + tierContribution;

    ranked.push({
      tutorProfileId: candidate.id,
      rankScore,
      rankingVersion: settings.rankingVersion,
      rankBreakdown: {
        tutorScore: { raw: tutorScoreRaw, normalized: tutorScoreNorm, weight: settings.tutorScoreWeight, contribution: tutorScoreContribution },
        bookingReliability: {
          totalBookings,
          tutorCancelledBookings,
          normalized: bookingReliabilityFactor,
          weight: settings.bookingReliabilityWeight,
          contribution: bookingReliabilityContribution,
        },
        invitationResponsiveness: {
          respondedOrExpiredCount,
          acceptedCount,
          usedNeutralDefault: respondedOrExpiredCount < settings.minInvitationsForReliabilityData,
          normalized: invitationResponsivenessFactor,
          weight: settings.invitationResponsivenessWeight,
          contribution: invitationResponsivenessContribution,
        },
        tutorTier: {
          tier: candidate.payoutTier,
          normalized: tierFactor,
          weight: settings.tutorTierWeight,
          contribution: tierContribution,
        },
      },
    });
  }

  return ranked.sort((a, b) => b.rankScore - a.rankScore);
}
