import { z } from "zod";
import { parseStrictCalendarDate } from "./auth";

/** Phase H.4 — child creation. Reuses H.3's strict calendar-date parsing
 * (parseStrictCalendarDate) rather than duplicating it. No min/max age is
 * enforced here, matching H.3's own DOB policy — that's an unmade product
 * decision, not a data-validity concern. */
export const createChildSchema = z
  .object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    dateOfBirth: z.string().trim(),
    academicLevelId: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const parsed = parseStrictCalendarDate(data.dateOfBirth);
    if (!parsed) {
      ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "invalid" });
      return;
    }
    if (parsed.getTime() > Date.now()) {
      ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "future" });
    }
  });

export type CreateChildInput = z.infer<typeof createChildSchema>;

export const inviteGuardianSchema = z.object({
  studentProfileId: z.string().trim().min(1),
  invitedEmail: z.string().trim().toLowerCase().email(),
});

export const approveInvitationSchema = z.object({
  invitationId: z.string().trim().min(1),
});

export const rejectInvitationSchema = z.object({
  invitationId: z.string().trim().min(1),
});

export const revokeGuardianSchema = z.object({
  relationshipId: z.string().trim().min(1),
});

export const claimInvitationSchema = z.object({
  token: z.string().trim().min(1),
});

/** Used only on the claim page's new-account-creation branch (§19 of the
 * H.4 prompt) — email is intentionally NOT part of this schema, since it is
 * always bound to the invitation's own invitedEmailNormalized, never taken
 * from client input. */
export const claimNewAccountSchema = z.object({
  token: z.string().trim().min(1),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  password: z.string().min(8).max(72),
});
