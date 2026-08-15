import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

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
    password: z.string().min(8).max(72),
    role: z.enum(["STUDENT", "TUTOR", "PARENT"]),
    // Phase H.3 — required only for STUDENT signups (see superRefine below).
    // No minimum/maximum age is enforced here: that's an unmade product
    // policy decision, not a data-validity concern. Only genuinely
    // impossible values (unparseable, future, non-existent calendar dates)
    // are rejected.
    dateOfBirth: z.string().trim().optional(),
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
