import { describe, it, expect } from "vitest";
import { registerSchema } from "./auth";

// Phase H.3 — permanent unit tests for the signup schema's two new
// responsibilities: (1) the server-side role whitelist (STUDENT/TUTOR/PARENT
// only — ADMIN/SUPER_ADMIN and any forged value must never validate, even if
// a client-manipulated form somehow submitted one), and (2) date-of-birth
// validation for STUDENT signups (required, must be a real calendar date,
// never in the future — but with no invented minimum/maximum age, since
// that's an unmade product policy decision, not a data-validity concern).

const BASE = {
  firstName: "Alex",
  lastName: "Example",
  email: "alex@example.com",
  password: "correcthorsebattery",
  termsAccepted: "true",
};

describe("registerSchema — role whitelist", () => {
  it("1. accepts STUDENT with a valid past date of birth", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "STUDENT", dateOfBirth: "2010-05-14", province: "ON" });
    expect(result.success).toBe(true);
  });

  it("2. accepts TUTOR with no date of birth supplied", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "TUTOR" });
    expect(result.success).toBe(true);
  });

  it("3. accepts PARENT with no date of birth supplied", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "PARENT" });
    expect(result.success).toBe(true);
  });

  it("3a. accepts PARENT when an absent form field is represented as null", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "PARENT", dateOfBirth: null });
    expect(result.success).toBe(true);
  });

  it("3b. accepts TUTOR when an absent form field is represented as null", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "TUTOR", dateOfBirth: null });
    expect(result.success).toBe(true);
  });

  it("4. rejects ADMIN — not a public self-signup role", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "ADMIN" });
    expect(result.success).toBe(false);
  });

  it("5. rejects SUPER_ADMIN — not a public self-signup role", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "SUPER_ADMIN" });
    expect(result.success).toBe(false);
  });

  it("6. rejects an arbitrary/forged role string", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "SOMETHING_ELSE" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema — date of birth (STUDENT only)", () => {
  it("7. rejects STUDENT with a missing date of birth", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "STUDENT" });
    expect(result.success).toBe(false);
  });

  it("8. rejects STUDENT with a future date of birth", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
    const futureStr = future.toISOString().slice(0, 10);
    const result = registerSchema.safeParse({ ...BASE, role: "STUDENT", dateOfBirth: futureStr });
    expect(result.success).toBe(false);
  });

  it("9. rejects STUDENT with a non-existent calendar date (Feb 30)", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "STUDENT", dateOfBirth: "2020-02-30" });
    expect(result.success).toBe(false);
  });

  it("10. rejects STUDENT with an unparseable date string", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "STUDENT", dateOfBirth: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("11. accepts STUDENT with a very old date of birth — no arbitrary max-age policy is enforced", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "STUDENT", dateOfBirth: "1930-01-01", province: "ON" });
    expect(result.success).toBe(true);
  });

  it("12. accepts STUDENT with a very recent (infant) date of birth — no arbitrary min-age policy is enforced", () => {
    // Note: registerSchema itself imposes no min-age rule (that's this test's
    // point) — the separate BETA-AGE1 age-of-majority gate lives in
    // registerAction, not in this schema, so an infant DOB still passes
    // schema-level validation as long as province is present and valid.
    const yesterday = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString().slice(0, 10);
    const result = registerSchema.safeParse({ ...BASE, role: "STUDENT", dateOfBirth: yesterday, province: "ON" });
    expect(result.success).toBe(true);
  });
});

describe("registerSchema — FG-LEGAL1A Terms acceptance", () => {
  it("13. rejects when termsAccepted is missing entirely, for every role", () => {
    const { termsAccepted: _omit, ...withoutTerms } = BASE;
    for (const role of ["STUDENT", "TUTOR", "PARENT"] as const) {
      const result = registerSchema.safeParse({ ...withoutTerms, role, dateOfBirth: "2010-05-14" });
      expect(result.success, `role ${role} should require termsAccepted`).toBe(false);
    }
  });

  it("14. rejects when termsAccepted is an empty string (unchecked checkbox represented as empty)", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "PARENT", termsAccepted: "" });
    expect(result.success).toBe(false);
  });

  it("15. rejects when termsAccepted is submitted as null (form field genuinely absent)", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "PARENT", termsAccepted: null });
    expect(result.success).toBe(false);
  });

  it("16. accepts when termsAccepted is any non-empty string — the checkbox's mere presence in FormData is what matters", () => {
    const result = registerSchema.safeParse({ ...BASE, role: "PARENT", termsAccepted: "true" });
    expect(result.success).toBe(true);
  });
});
