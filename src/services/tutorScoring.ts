import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Indicative starting weights (the user's own numbers) — not hard-coded
 * inline at each call site so a future re-weighting is a one-line change.
 * Distinct from the full ongoing-score weights (reviews, reliability,
 * acceptance rate) that only make sense once real session/booking history
 * exists — this is the pre-marketplace "should we approve this tutor at
 * all" score only.
 */
export const INITIAL_SCORE_WEIGHTS = {
  academicQualification: 0.4,
  interview: 0.3,
  exam: 0.3,
};

export const INITIAL_SCORE_VERSION = "INITIAL_V1";

interface ScoreBreakdown {
  academicQualification: {
    score: number;
    hasVerifiedEducation: boolean;
    verifiedCertificationCount: number;
    hasRelevantVerifiedQualification: boolean;
    yearsExperience: number;
  };
  interview: { score: number; criteriaAverage: number };
  exam: { score: number; examId: string | null; attemptId: string | null };
  weights: typeof INITIAL_SCORE_WEIGHTS;
}

/**
 * Reads verified qualification RECORDS (TutorEducation/TutorCertification
 * with verificationStatus: VERIFIED), never the number of supporting
 * TutorDocuments — a tutor proving one degree with five documents scores
 * identically to one proving the same degree with two, because both end up
 * with exactly one VERIFIED TutorEducation row.
 */
async function calculateAcademicQualificationScore(tutorProfileId: string) {
  const [tutor, verifiedEducation, verifiedCertifications] = await Promise.all([
    db.tutorProfile.findUniqueOrThrow({ where: { id: tutorProfileId }, select: { yearsExperience: true } }),
    db.tutorEducation.findMany({ where: { tutorProfileId, verificationStatus: "VERIFIED" } }),
    db.tutorCertification.findMany({ where: { tutorProfileId, verificationStatus: "VERIFIED" } }),
  ]);

  const hasVerifiedEducation = verifiedEducation.length > 0;
  const verifiedCertificationCount = verifiedCertifications.length;
  const hasRelevantVerifiedQualification = [...verifiedEducation, ...verifiedCertifications].some(
    (record) => record.isRelevantToSubjects === true
  );
  const yearsExperience = tutor.yearsExperience ?? 0;

  const score =
    (hasVerifiedEducation ? 40 : 0) +
    Math.min(verifiedCertificationCount, 2) * 10 +
    (hasRelevantVerifiedQualification ? 20 : 0) +
    Math.min(yearsExperience, 10) * 2;

  return {
    score: Math.min(score, 100),
    hasVerifiedEducation,
    verifiedCertificationCount,
    hasRelevantVerifiedQualification,
    yearsExperience,
  };
}

async function calculateInterviewScore(tutorProfileId: string) {
  const interview = await db.tutorInterview.findFirst({
    where: { tutorProfileId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    include: { evaluations: true },
  });
  if (!interview || interview.evaluations.length === 0) {
    return { score: 0, criteriaAverage: 0 };
  }
  const average = interview.evaluations.reduce((sum, e) => sum + e.score, 0) / interview.evaluations.length;
  return { score: Math.round((average / 5) * 100), criteriaAverage: average };
}

async function calculateExamScore(tutorProfileId: string) {
  const attempt = await db.tutorExamAttempt.findFirst({
    where: { tutorProfileId, passed: true },
    orderBy: { attemptNumber: "desc" },
  });
  return { score: attempt?.score ?? 0, examId: attempt?.tutorExamId ?? null, attemptId: attempt?.id ?? null };
}

export async function calculateInitialTutorScore(tutorProfileId: string) {
  const [academic, interview, exam] = await Promise.all([
    calculateAcademicQualificationScore(tutorProfileId),
    calculateInterviewScore(tutorProfileId),
    calculateExamScore(tutorProfileId),
  ]);

  const totalScore = Math.round(
    academic.score * INITIAL_SCORE_WEIGHTS.academicQualification +
      interview.score * INITIAL_SCORE_WEIGHTS.interview +
      exam.score * INITIAL_SCORE_WEIGHTS.exam
  );

  const breakdown = {
    academicQualification: academic,
    interview,
    exam,
    weights: INITIAL_SCORE_WEIGHTS,
  } satisfies ScoreBreakdown as unknown as Prisma.InputJsonValue;

  const calculatedAt = new Date();
  // No session/review history exists yet for a newly-approved tutor, so
  // confidence is always LOW for an initial score.
  const confidence = "LOW" as const;

  const [score] = await db.$transaction([
    db.tutorScore.upsert({
      where: { tutorProfileId_scopeType_scopeKey: { tutorProfileId, scopeType: "OVERALL", scopeKey: "OVERALL" } },
      create: {
        tutorProfileId,
        scopeType: "OVERALL",
        scopeKey: "OVERALL",
        score: totalScore,
        confidence,
        scoreVersion: INITIAL_SCORE_VERSION,
        breakdown,
        calculatedAt,
      },
      update: { score: totalScore, confidence, scoreVersion: INITIAL_SCORE_VERSION, breakdown, calculatedAt },
    }),
    db.tutorScoreSnapshot.create({
      data: {
        tutorProfileId,
        scopeType: "OVERALL",
        scopeKey: "OVERALL",
        score: totalScore,
        confidence,
        scoreVersion: INITIAL_SCORE_VERSION,
        breakdown,
        calculatedAt,
      },
    }),
  ]);

  return score;
}
