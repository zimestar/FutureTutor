import { describe, it, expect, afterEach } from "vitest";
import { emailVerificationRequiredSince, isEmailVerificationRequiredForUser } from "./emailVerificationConfig";

// BETA-EMAILVERIFY1 — permanent unit tests for the migration-free rollout
// gate. Fails closed in the PERMISSIVE direction (the opposite of
// closedBetaConfig.ts) — see the module's own doc comment for why: the
// production user inventory found that EVERY existing user, including the
// only SUPER_ADMIN account, has emailVerified: null, so an accidentally
// strict default here would lock out the platform's own admin.

const ORIGINAL_CUTOFF = process.env.EMAIL_VERIFICATION_REQUIRED_SINCE;

afterEach(() => {
  if (ORIGINAL_CUTOFF === undefined) delete process.env.EMAIL_VERIFICATION_REQUIRED_SINCE;
  else process.env.EMAIL_VERIFICATION_REQUIRED_SINCE = ORIGINAL_CUTOFF;
});

describe("emailVerificationRequiredSince", () => {
  it("returns null when unset — the gate is fully inert by default", () => {
    delete process.env.EMAIL_VERIFICATION_REQUIRED_SINCE;
    expect(emailVerificationRequiredSince()).toBeNull();
  });

  it("returns null for an unparseable value, never throws", () => {
    process.env.EMAIL_VERIFICATION_REQUIRED_SINCE = "not-a-real-date";
    expect(() => emailVerificationRequiredSince()).not.toThrow();
    expect(emailVerificationRequiredSince()).toBeNull();
  });

  it("returns null for an empty string", () => {
    process.env.EMAIL_VERIFICATION_REQUIRED_SINCE = "";
    expect(emailVerificationRequiredSince()).toBeNull();
  });

  it("parses a valid ISO timestamp", () => {
    process.env.EMAIL_VERIFICATION_REQUIRED_SINCE = "2026-09-02T00:00:00.000Z";
    const cutoff = emailVerificationRequiredSince();
    expect(cutoff).toBeInstanceOf(Date);
    expect(cutoff?.toISOString()).toBe("2026-09-02T00:00:00.000Z");
  });
});

describe("isEmailVerificationRequiredForUser", () => {
  it("is never required for an already-verified account, regardless of createdAt or cutoff", () => {
    process.env.EMAIL_VERIFICATION_REQUIRED_SINCE = "2020-01-01T00:00:00.000Z";
    const user = { emailVerified: new Date("2019-01-01T00:00:00.000Z"), createdAt: new Date("2030-01-01T00:00:00.000Z") };
    expect(isEmailVerificationRequiredForUser(user)).toBe(false);
  });

  it("is never required when the cutoff is unset — every pre-existing/legacy account is grandfathered in", () => {
    delete process.env.EMAIL_VERIFICATION_REQUIRED_SINCE;
    const user = { emailVerified: null, createdAt: new Date() };
    expect(isEmailVerificationRequiredForUser(user)).toBe(false);
  });

  it("is NOT required for an account created BEFORE the cutoff (the legacy-grandfathering case, incl. the existing SUPER_ADMIN whose emailVerified is also null)", () => {
    process.env.EMAIL_VERIFICATION_REQUIRED_SINCE = "2026-09-02T00:00:00.000Z";
    const user = { emailVerified: null, createdAt: new Date("2026-09-01T23:59:59.999Z") };
    expect(isEmailVerificationRequiredForUser(user)).toBe(false);
  });

  it("IS required for an unverified account created AT the cutoff instant", () => {
    process.env.EMAIL_VERIFICATION_REQUIRED_SINCE = "2026-09-02T00:00:00.000Z";
    const user = { emailVerified: null, createdAt: new Date("2026-09-02T00:00:00.000Z") };
    expect(isEmailVerificationRequiredForUser(user)).toBe(true);
  });

  it("IS required for an unverified account created AFTER the cutoff", () => {
    process.env.EMAIL_VERIFICATION_REQUIRED_SINCE = "2026-09-02T00:00:00.000Z";
    const user = { emailVerified: null, createdAt: new Date("2026-09-02T00:00:00.001Z") };
    expect(isEmailVerificationRequiredForUser(user)).toBe(true);
  });

  it("is never required when the cutoff is an unparseable value, regardless of createdAt", () => {
    process.env.EMAIL_VERIFICATION_REQUIRED_SINCE = "garbage";
    const user = { emailVerified: null, createdAt: new Date() };
    expect(isEmailVerificationRequiredForUser(user)).toBe(false);
  });
});
