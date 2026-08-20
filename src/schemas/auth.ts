import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** L1-01A — Secure Account Recovery. The single authoritative
 * password-strength contract, shared by signup (registerSchema below) and
 * password reset (resetPasswordSchema) so the two flows can never silently
 * drift into two different standards. */
export const passwordPolicySchema = z.string().min(8).max(72);

/** Parses a strict YYYY-MM-DD date string, rejecting calendar overflow (e.g.
 * "2024-02-30" silently rolling into March) that `new Date(...)` alone would
 * accept. Returns null for anything that isn't a real calendar date.
 * Exported (Phase H.4) so the child-creation DOB validation can reuse this
 * exact logic instead of duplicating it — see src/services/familyManagement.ts. */
export function parseStrictCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    email: z.string().trim().toLowerCase().email(),
    password: passwordPolicySchema,
    role: z.enum(["STUDENT", "TUTOR", "PARENT"]),
    // Phase H.3 — required only for STUDENT signups (see superRefine below).
    // No minimum/maximum age is enforced here: that's an unmade product
    // policy decision, not a data-validity concern. Only genuinely
    // impossible values (unparseable, future, non-existent calendar dates)
    // are rejected.
    dateOfBirth: z.preprocess(
      (value) => (value === null || value === "" ? undefined : value),
      z.string().trim().optional()
    ),
  })
  .superRefine((data, ctx) => {
    if (data.role !== "STUDENT") return;
    if (!data.dateOfBirth) {
      ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "required" });
      return;
    }
    const parsed = parseStrictCalendarDate(data.dateOfBirth);
    if (!parsed) {
      ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "invalid" });
      return;
    }
    if (parsed.getTime() > Date.now()) {
      ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "future" });
    }
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/** L1-01A — request body for "forgot password." Deliberately just an email
 * — never a userId, never anything else the client could use to target a
 * specific account record directly (see the task's security contract §I). */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** L1-01A — request body for "reset password." Only the raw reset token and
 * the new plaintext password are ever accepted from the client — never a
 * userId, target password hash, expiry, or token state (security contract
 * §I). `password` reuses passwordPolicySchema so reset can never enforce a
 * different strength standard than signup. */
export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1),
  password: passwordPolicySchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
