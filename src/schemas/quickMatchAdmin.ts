import { z } from "zod";

export const tutorRankingSettingsSchema = z
  .object({
    responseWindowMinutes: z.coerce.number().int().min(1),
    sequentialInvitationCount: z.coerce.number().int().min(0),
    parallelBatchSize: z.coerce.number().int().min(0),
    maxDispatchAttempts: z.coerce.number().int().min(1),
    tutorScoreWeight: z.coerce.number().min(0).max(1),
    bookingReliabilityWeight: z.coerce.number().min(0).max(1),
    invitationResponsivenessWeight: z.coerce.number().min(0).max(1),
    tutorTierWeight: z.coerce.number().min(0).max(1),
    minInvitationsForReliabilityData: z.coerce.number().int().min(0),
    rankingVersion: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    // Same sanity check the dispatch loop itself asserts at read time
    // (§6 of the Phase F plan) — surfaced here too so an admin gets
    // immediate feedback instead of a silently-inconsistent config.
    if (data.sequentialInvitationCount + data.parallelBatchSize > data.maxDispatchAttempts) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sequentialInvitationCount + parallelBatchSize must not exceed maxDispatchAttempts",
        path: ["maxDispatchAttempts"],
      });
    }
    const weightSum =
      data.tutorScoreWeight + data.bookingReliabilityWeight + data.invitationResponsivenessWeight + data.tutorTierWeight;
    if (Math.abs(weightSum - 1) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ranking weights must sum to 1.0",
        path: ["tutorScoreWeight"],
      });
    }
  });

export type TutorRankingSettingsInput = z.infer<typeof tutorRankingSettingsSchema>;
