import type { Prisma } from "@/generated/prisma/client";
import type { TutoringMode } from "@/generated/prisma/enums";

export interface SupplySignal {
  qualifiedTutorCount: number;
  scarcityBand: "NORMAL" | "LOW";
}

/**
 * A real, cheap query against existing schema — not a fabricated demand
 * signal. Counts APPROVED tutors who teach the subject (and level/mode, when
 * given). Accepts a Prisma transaction client so it can run inside the
 * coherent-configuration-snapshot read block (see customerPricing.ts).
 */
export async function getSupplySignal(
  tx: Prisma.TransactionClient,
  params: { subjectId: string; academicLevelId?: string | null; mode: TutoringMode },
  lowSupplyThresholdCount: number
): Promise<SupplySignal> {
  const qualifiedTutorCount = await tx.tutorProfile.count({
    where: {
      applicationStatus: "APPROVED",
      subjects: { some: { subjectId: params.subjectId } },
      ...(params.academicLevelId ? { levels: { some: { academicLevelId: params.academicLevelId } } } : {}),
      ...(params.mode !== "BOTH" ? { OR: [{ learningMode: params.mode }, { learningMode: "BOTH" }] } : {}),
    },
  });

  return {
    qualifiedTutorCount,
    scarcityBand: qualifiedTutorCount < lowSupplyThresholdCount ? "LOW" : "NORMAL",
  };
}
