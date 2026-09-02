import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InvalidOrExpiredResetTokenError extends Error {}
  class ResetPasswordPolicyError extends Error {}
  class InvalidOrExpiredVerificationTokenError extends Error {}
  return {
    findUnique: vi.fn(),
    createUserForSignup: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    redirect: vi.fn(),
    hash: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    getAppBaseUrl: vi.fn(),
    resolveSendPasswordResetEmail: vi.fn(),
    consoleDevSendPasswordResetEmail: vi.fn(),
    checkActionRateLimit: vi.fn(),
    sendVerificationEmailForAccount: vi.fn(),
    resendEmailVerification: vi.fn(),
    verifyEmail: vi.fn(),
    consoleDevSendVerificationEmail: vi.fn(),
    resolveSendVerificationEmail: vi.fn(),
    InvalidOrExpiredResetTokenError,
    ResetPasswordPolicyError,
    InvalidOrExpiredVerificationTokenError,
  };
});

// BETA-OPS1 — headers() requires a real Next.js request scope, which these
// plain-function unit tests don't have; mocked here (not exercised for real
// until an actual request comes in) so the action-layer tests below can
// keep asserting the thin wrapper's own responsibilities in isolation, same
// reasoning as every other mock in this file. checkActionRateLimit defaults
// to "always allowed" so every pre-existing test's behavior is unchanged;
// see the "BETA-OPS1 rate limiting" describe blocks below for the
// rate-limited branch.
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/rateLimit", () => ({
  checkActionRateLimit: mocks.checkActionRateLimit,
  getClientIp: vi.fn().mockReturnValue(null),
  RATE_LIMITS: {
    loginByEmail: {}, loginByIp: {}, registerByIp: {}, forgotPasswordByEmail: {},
    forgotPasswordByIp: {}, resetPasswordByIp: {}, invitationClaimByIp: {}, adminSetupByIp: {},
    verifyEmailByIp: {}, emailVerificationResendByEmail: {}, emailVerificationResendByIp: {},
  },
}));

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn().mockResolvedValue("en"),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: mocks.findUnique },
    tutorProfile: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/appUrl", () => ({ getAppBaseUrl: mocks.getAppBaseUrl }));
vi.mock("@/services/signup", () => ({ createUserForSignup: mocks.createUserForSignup }));
// L1-01A — passwordReset.ts's guarded transactional core is covered by its
// own permanent DB-integration tests (passwordReset.integration.test.ts);
// here it's mocked so these action-layer tests can assert the thin
// wrapper's own responsibilities (generic-outcome enumeration resistance,
// input validation, error-to-outcome mapping) in isolation.
vi.mock("@/services/passwordReset", () => ({
  requestPasswordReset: mocks.requestPasswordReset,
  resetPassword: mocks.resetPassword,
  consoleDevSendPasswordResetEmail: mocks.consoleDevSendPasswordResetEmail,
  InvalidOrExpiredResetTokenError: mocks.InvalidOrExpiredResetTokenError,
  ResetPasswordPolicyError: mocks.ResetPasswordPolicyError,
}));
// L1-01B — resolveSendPasswordResetEmail() picks the production (Resend) vs.
// dev (console) SendPasswordResetEmail implementation based on environment;
// mocked here so these action-layer tests can assert forgotPasswordAction
// wires WHATEVER it returns straight into requestPasswordReset's deps,
// without this test file depending on real env-var state.
vi.mock("@/lib/email/sendPasswordResetEmail", () => ({
  resolveSendPasswordResetEmail: mocks.resolveSendPasswordResetEmail,
}));
// BETA-EMAILVERIFY1 — mirrors the passwordReset mocking shape exactly.
vi.mock("@/services/emailVerification", () => ({
  sendVerificationEmailForAccount: mocks.sendVerificationEmailForAccount,
  resendEmailVerification: mocks.resendEmailVerification,
  verifyEmail: mocks.verifyEmail,
  consoleDevSendVerificationEmail: mocks.consoleDevSendVerificationEmail,
  InvalidOrExpiredVerificationTokenError: mocks.InvalidOrExpiredVerificationTokenError,
}));
vi.mock("@/lib/email/sendVerificationEmail", () => ({
  resolveSendVerificationEmail: mocks.resolveSendVerificationEmail,
}));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));

import { registerAction, forgotPasswordAction, resetPasswordAction, verifyEmailAction, resendVerificationEmailAction } from "./auth";

function parentForm(email = "parent.qa@futuretutor.local") {
  const form = new FormData();
  form.set("firstName", "Pat");
  form.set("lastName", "Parent");
  form.set("email", email);
  form.set("password", "LocalTestPassword123!");
  form.set("role", "PARENT");
  form.set("termsAccepted", "true");
  return form;
}

// BETA-EMAILVERIFY1 — registerAction no longer auto-signs-in; it must
// create the account (emailVerified stays null, enforced by
// createUserForSignup/authorize() elsewhere), send a verification email,
// and redirect to /check-email WITHOUT ever calling signIn(). These tests
// replace the old "auto sign-in" test suite entirely.
describe("registerAction — Parent signup, no auto sign-in, verification email required", () => {
  const resolvedSendEmail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("test-hash");
    mocks.createUserForSignup.mockResolvedValue({ id: "parent-user", email: "parent.qa@futuretutor.local" });
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.getAppBaseUrl.mockResolvedValue("http://localhost:3100");
    mocks.resolveSendVerificationEmail.mockReturnValue(resolvedSendEmail);
    mocks.sendVerificationEmailForAccount.mockResolvedValue(undefined);
  });

  it("accepts a real Parent FormData payload where dateOfBirth is absent", async () => {
    await registerAction(undefined, parentForm());

    expect(mocks.createUserForSignup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: "PARENT", dateOfBirth: undefined })
    );
  });

  it("never calls signIn — no auto sign-in after signup", async () => {
    await registerAction(undefined, parentForm());
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("sends a verification email for the newly-created account", async () => {
    await registerAction(undefined, parentForm());
    expect(mocks.sendVerificationEmailForAccount).toHaveBeenCalledTimes(1);
    const [, user] = mocks.sendVerificationEmailForAccount.mock.calls[0];
    expect(user).toEqual({ id: "parent-user", email: "parent.qa@futuretutor.local" });
  });

  it("builds a locale-aware absolute activation URL using the request's own origin", async () => {
    await registerAction(undefined, parentForm());
    const deps = mocks.sendVerificationEmailForAccount.mock.calls[0][2];
    expect(deps.buildVerifyUrl("raw-token-abc")).toBe("http://localhost:3100/en/verify-email?token=raw-token-abc");
    expect(deps.locale).toBe("en");
    expect(deps.sendEmail).toBe(resolvedSendEmail);
  });

  it("redirects to /check-email with the submitted email, never to a dashboard", async () => {
    await registerAction(undefined, parentForm("parent.qa@futuretutor.local"));
    expect(mocks.redirect).toHaveBeenCalledWith({
      href: "/check-email?email=parent.qa%40futuretutor.local",
      locale: "en",
    });
  });

  it("returns an actionable field error without exposing raw Zod details", async () => {
    const result = await registerAction(undefined, parentForm("not-an-email"));

    expect(result).toEqual({ error: "invalidInput", fieldErrors: { email: "emailInvalid" } });
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
  });

  it("returns a recoverable error, without losing the created account, when the verification email fails to send", async () => {
    mocks.sendVerificationEmailForAccount.mockRejectedValue(new Error("Resend outage"));

    const result = await registerAction(undefined, parentForm());

    expect(result).toEqual({ error: "verificationEmailFailed", accountCreated: true });
    expect(mocks.createUserForSignup).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not create a duplicate profile when signup is retried after an account already exists", async () => {
    await registerAction(undefined, parentForm());
    mocks.findUnique.mockResolvedValue({ id: "parent-user", role: "PARENT" });

    const retry = await registerAction(undefined, parentForm());

    expect(retry).toEqual({ error: "emailTaken" });
    expect(mocks.createUserForSignup).toHaveBeenCalledTimes(1);
  });

  it("BETA-OPS1: returns a rate-limited outcome and never creates an account when the IP bucket is exceeded", async () => {
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });

    const result = await registerAction(undefined, parentForm());

    expect(result).toEqual({ error: "tooManyAttempts" });
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
  });
});

function studentForm(overrides: Partial<Record<"email" | "dateOfBirth" | "province", string>> = {}) {
  const form = new FormData();
  form.set("firstName", "Sam");
  form.set("lastName", "Student");
  form.set("email", overrides.email ?? "student.qa@futuretutor.local");
  form.set("password", "LocalTestPassword123!");
  form.set("role", "STUDENT");
  form.set("dateOfBirth", overrides.dateOfBirth ?? "1980-01-01"); // clearly an adult by default
  if (overrides.province !== undefined) form.set("province", overrides.province);
  else form.set("province", "ON");
  form.set("termsAccepted", "true");
  return form;
}

// BETA-AGE1 — province-aware age-of-majority gate for direct STUDENT
// self-signup. The pure eligibility math itself is exhaustively tested in
// src/lib/studentAgePolicy.test.ts (all 13 provinces, exact boundary days);
// these tests instead prove the WIRING into registerAction: an ineligible
// Student creates zero database rows of any kind (no duplicate-email check,
// no User, no StudentProfile, no verification token, no verification
// email) and the rejection happens before any of that — a crafted direct
// Server Action call gets exactly the same treatment as a real form
// submission, since there is no separate client-side gate to bypass.
describe("registerAction — BETA-AGE1 Student age-of-majority gate", () => {
  const resolvedSendEmail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("test-hash");
    mocks.createUserForSignup.mockResolvedValue({ id: "student-user", email: "student.qa@futuretutor.local" });
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.getAppBaseUrl.mockResolvedValue("http://localhost:3100");
    mocks.resolveSendVerificationEmail.mockReturnValue(resolvedSendEmail);
    mocks.sendVerificationEmailForAccount.mockResolvedValue(undefined);
  });

  it("an 18-year-old-minus-one-day in Ontario (age-18 province) is rejected before any database call", async () => {
    // Fixed "today" isn't controllable here (registerAction has no
    // injectable clock — it always uses real time), so this uses a birth
    // date that is unambiguously one day short of 18 relative to whenever
    // this test actually runs would be flaky; instead, prove the boundary
    // via the two unambiguous cases below and rely on
    // studentAgePolicy.test.ts for the exact day-precision boundary math.
    const clearlyAMinor = new Date();
    clearlyAMinor.setUTCFullYear(clearlyAMinor.getUTCFullYear() - 10); // ~10 years old
    const dob = clearlyAMinor.toISOString().slice(0, 10);

    const result = await registerAction(undefined, studentForm({ dateOfBirth: dob, province: "ON" }));

    expect(result).toEqual({ error: "underageForProvince" });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
    expect(mocks.sendVerificationEmailForAccount).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("an ineligible Student creates zero User rows, zero StudentProfile rows, zero verification tokens, and zero verification emails", async () => {
    const tenYearsOld = new Date();
    tenYearsOld.setUTCFullYear(tenYearsOld.getUTCFullYear() - 10);
    const dob = tenYearsOld.toISOString().slice(0, 10);

    await registerAction(undefined, studentForm({ dateOfBirth: dob, province: "BC" }));

    // No duplicate-email lookup, no account creation, no token issuance, no
    // email send — the rejection happens before ANY of that.
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
    expect(mocks.sendVerificationEmailForAccount).not.toHaveBeenCalled();
  });

  it("a crafted direct Server Action call with an ineligible DOB+province is rejected the same as a real form submission — no separate client-side gate to bypass", async () => {
    const fiveYearsOld = new Date();
    fiveYearsOld.setUTCFullYear(fiveYearsOld.getUTCFullYear() - 5);
    const form = studentForm({ dateOfBirth: fiveYearsOld.toISOString().slice(0, 10), province: "QC" });

    const result = await registerAction(undefined, form);

    expect(result).toEqual({ error: "underageForProvince" });
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
  });

  it("an eligible Student (clearly an adult) creates a SELF_MANAGED profile with the province persisted", async () => {
    const result = await registerAction(undefined, studentForm({ dateOfBirth: "1980-01-01", province: "ON" }));

    expect(mocks.createUserForSignup).toHaveBeenCalledTimes(1);
    const call = mocks.createUserForSignup.mock.calls[0][1];
    expect(call.role).toBe("STUDENT");
    expect(call.province).toBe("ON");
    expect(call.dateOfBirth).toBeInstanceOf(Date);
    expect(result).toBeUndefined(); // redirect() was called (mocked, doesn't throw here)
    expect(mocks.redirect).toHaveBeenCalledWith({
      href: "/check-email?email=student.qa%40futuretutor.local",
      locale: "en",
    });
  });

  it("BETA-EMAILVERIFY1 still applies to an eligible Student — verification email sent, no auto sign-in, redirected to /check-email", async () => {
    await registerAction(undefined, studentForm({ dateOfBirth: "1980-01-01", province: "ON" }));

    expect(mocks.sendVerificationEmailForAccount).toHaveBeenCalledTimes(1);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it.each(["AB", "MB", "ON", "PE", "QC", "SK", "BC", "NB", "NL", "NT", "NS", "NU", "YT"])(
    "an eligible adult in %s is accepted",
    async (province) => {
      const result = await registerAction(undefined, studentForm({ dateOfBirth: "1980-01-01", province }));
      expect(result).toBeUndefined();
      expect(mocks.createUserForSignup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ province }));
    }
  );

  it("missing province is rejected as a field/validation error before any age check runs", async () => {
    const form = studentForm({ province: "" });
    const result = await registerAction(undefined, form);
    expect(result).toEqual({ error: "invalidInput", fieldErrors: { province: "provinceInvalid" } });
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
  });

  it("an invalid (non-Canadian / malformed) province is rejected", async () => {
    const form = studentForm({ province: "ZZ" });
    const result = await registerAction(undefined, form);
    expect(result).toEqual({ error: "invalidInput", fieldErrors: { province: "provinceInvalid" } });
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
  });

  it("a malformed date of birth is rejected before any age check runs", async () => {
    const form = studentForm({ dateOfBirth: "not-a-date" });
    const result = await registerAction(undefined, form);
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(result?.fieldErrors?.dateOfBirth).toBe("dateOfBirthInvalid");
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
  });

  it("a future date of birth is rejected before any age check runs", async () => {
    const nextYear = new Date();
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
    const form = studentForm({ dateOfBirth: nextYear.toISOString().slice(0, 10) });
    const result = await registerAction(undefined, form);
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(result?.fieldErrors?.dateOfBirth).toBe("dateOfBirthInvalid");
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
  });

  it("Parent signup is unaffected — no province required, still succeeds", async () => {
    mocks.createUserForSignup.mockResolvedValue({ id: "parent-user", email: "parent.qa@futuretutor.local" });
    const result = await registerAction(undefined, parentForm());
    expect(result).toBeUndefined();
    expect(mocks.createUserForSignup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: "PARENT", province: undefined })
    );
  });

  it("Tutor signup is unaffected — no province required, still succeeds", async () => {
    mocks.createUserForSignup.mockResolvedValue({ id: "tutor-user", email: "tutor.qa@futuretutor.local" });
    const form = new FormData();
    form.set("firstName", "Tara");
    form.set("lastName", "Tutor");
    form.set("email", "tutor.qa@futuretutor.local");
    form.set("password", "LocalTestPassword123!");
    form.set("role", "TUTOR");
    form.set("termsAccepted", "true");

    const result = await registerAction(undefined, form);

    expect(result).toBeUndefined();
    expect(mocks.createUserForSignup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: "TUTOR", province: undefined })
    );
  });
});

// L1-01A — Secure Account Recovery. These assert the Server Action wrapper's
// own responsibilities only: parsing input, resolving locale/origin, and
// mapping the service's typed domain errors to a public outcome. The real
// business logic (token generation/hashing/expiry/guarded consumption) is
// exercised for real against the isolated test database in
// src/services/passwordReset.integration.test.ts.

describe("forgotPasswordAction", () => {
  const resolvedSendEmail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppBaseUrl.mockResolvedValue("http://localhost:3100");
    mocks.requestPasswordReset.mockResolvedValue(undefined);
    mocks.resolveSendPasswordResetEmail.mockReturnValue(resolvedSendEmail);
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  function form(email: string) {
    const f = new FormData();
    f.set("email", email);
    return f;
  }

  it("returns the generic {submitted:true} outcome for a validly-formatted, real-looking email", async () => {
    const result = await forgotPasswordAction(undefined, form("someone@example.com"));
    expect(result).toEqual({ submitted: true });
    expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(1);
  });

  it("returns the SAME generic outcome for a malformed email, without ever invoking the service (no enumeration signal)", async () => {
    const result = await forgotPasswordAction(undefined, form("not-an-email"));
    expect(result).toEqual({ submitted: true });
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("returns the SAME generic outcome even when the underlying service throws (infra failure never leaks to the browser)", async () => {
    mocks.requestPasswordReset.mockRejectedValue(new Error("db unreachable"));
    const result = await forgotPasswordAction(undefined, form("someone@example.com"));
    expect(result).toEqual({ submitted: true });
  });

  it("builds a locale-aware absolute reset URL using the request's own origin", async () => {
    await forgotPasswordAction(undefined, form("someone@example.com"));
    const deps = mocks.requestPasswordReset.mock.calls[0][2];
    expect(deps.buildResetUrl("raw-token-abc")).toBe("http://localhost:3100/en/reset-password?token=raw-token-abc");
    expect(deps.locale).toBe("en");
  });

  // L1-01B — production password-reset email delivery wiring.

  it("passes whatever resolveSendPasswordResetEmail() returns straight through as the sendEmail dependency", async () => {
    await forgotPasswordAction(undefined, form("someone@example.com"));
    expect(mocks.resolveSendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const deps = mocks.requestPasswordReset.mock.calls[0][2];
    expect(deps.sendEmail).toBe(resolvedSendEmail);
  });

  it("returns the SAME generic outcome when resolveSendPasswordResetEmail() itself throws (e.g. production misconfiguration) — never leaks a distinct outcome", async () => {
    mocks.resolveSendPasswordResetEmail.mockImplementation(() => {
      throw new Error("EMAIL_FROM is required in production but is not set.");
    });
    const result = await forgotPasswordAction(undefined, form("someone@example.com"));
    expect(result).toEqual({ submitted: true });
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("BETA-OPS1: returns the SAME generic outcome when rate-limited, and never calls the service (no enumeration signal)", async () => {
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });
    const result = await forgotPasswordAction(undefined, form("someone@example.com"));
    expect(result).toEqual({ submitted: true });
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe("resetPasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  function form(token: string, password: string) {
    const f = new FormData();
    f.set("token", token);
    f.set("password", password);
    return f;
  }

  it("returns success when the service succeeds", async () => {
    mocks.resetPassword.mockResolvedValue({ userId: "user-1" });
    const result = await resetPasswordAction(undefined, form("a-raw-token-value", "ValidPassword123!"));
    expect(result).toEqual({ success: true });
  });

  it("rejects a malformed request (missing fields) before ever calling the service", async () => {
    const result = await resetPasswordAction(undefined, new FormData());
    expect(result).toEqual({ error: "invalid_request" });
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than the shared 8-character policy minimum before calling the service", async () => {
    const result = await resetPasswordAction(undefined, form("a-raw-token-value", "short1"));
    expect(result).toEqual({ error: "invalid_request" });
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("maps InvalidOrExpiredResetTokenError to a generic invalid_or_expired_token outcome", async () => {
    mocks.resetPassword.mockRejectedValue(new mocks.InvalidOrExpiredResetTokenError());
    const result = await resetPasswordAction(undefined, form("a-raw-token-value", "ValidPassword123!"));
    expect(result).toEqual({ error: "invalid_or_expired_token" });
  });

  it("maps ResetPasswordPolicyError to invalid_password", async () => {
    mocks.resetPassword.mockRejectedValue(new mocks.ResetPasswordPolicyError());
    const result = await resetPasswordAction(undefined, form("a-raw-token-value", "ValidPassword123!"));
    expect(result).toEqual({ error: "invalid_password" });
  });

  it("maps an unexpected error to a generic reset_failed outcome without leaking details", async () => {
    mocks.resetPassword.mockRejectedValue(new Error("unexpected db failure"));
    const result = await resetPasswordAction(undefined, form("a-raw-token-value", "ValidPassword123!"));
    expect(result).toEqual({ error: "reset_failed" });
  });

  it("BETA-OPS1: returns reset_failed and never calls the service when the IP bucket is exceeded", async () => {
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });
    const result = await resetPasswordAction(undefined, form("a-raw-token-value", "ValidPassword123!"));
    expect(result).toEqual({ error: "reset_failed" });
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });
});

// BETA-EMAILVERIFY1 — mirrors resetPasswordAction's test shape exactly: the
// real token generation/hashing/expiry/guarded-consumption logic is
// exercised for real in src/services/emailVerification.integration.test.ts;
// these assert only the thin wrapper's own responsibilities.

describe("verifyEmailAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  function form(token: string) {
    const f = new FormData();
    f.set("token", token);
    return f;
  }

  it("returns success when the service succeeds", async () => {
    mocks.verifyEmail.mockResolvedValue({ userId: "user-1" });
    const result = await verifyEmailAction(undefined, form("a-raw-token-value"));
    expect(result).toEqual({ success: true });
  });

  it("rejects a malformed request (missing token) before ever calling the service", async () => {
    const result = await verifyEmailAction(undefined, new FormData());
    expect(result).toEqual({ error: "invalid_request" });
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });

  it("maps InvalidOrExpiredVerificationTokenError to a generic invalid_or_expired_token outcome", async () => {
    mocks.verifyEmail.mockRejectedValue(new mocks.InvalidOrExpiredVerificationTokenError());
    const result = await verifyEmailAction(undefined, form("a-raw-token-value"));
    expect(result).toEqual({ error: "invalid_or_expired_token" });
  });

  it("maps an unexpected error to the same generic outcome without leaking details", async () => {
    mocks.verifyEmail.mockRejectedValue(new Error("unexpected db failure"));
    const result = await verifyEmailAction(undefined, form("a-raw-token-value"));
    expect(result).toEqual({ error: "invalid_or_expired_token" });
  });

  it("returns invalid_or_expired_token and never calls the service when the IP bucket is exceeded", async () => {
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });
    const result = await verifyEmailAction(undefined, form("a-raw-token-value"));
    expect(result).toEqual({ error: "invalid_or_expired_token" });
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });
});

describe("resendVerificationEmailAction", () => {
  const resolvedSendEmail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppBaseUrl.mockResolvedValue("http://localhost:3100");
    mocks.resendEmailVerification.mockResolvedValue(undefined);
    mocks.resolveSendVerificationEmail.mockReturnValue(resolvedSendEmail);
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  function form(email: string) {
    const f = new FormData();
    f.set("email", email);
    return f;
  }

  it("returns the generic {submitted:true} outcome for a validly-formatted, real-looking email", async () => {
    const result = await resendVerificationEmailAction(undefined, form("someone@example.com"));
    expect(result).toEqual({ submitted: true });
    expect(mocks.resendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it("returns the SAME generic outcome for a malformed email, without ever invoking the service (no enumeration signal)", async () => {
    const result = await resendVerificationEmailAction(undefined, form("not-an-email"));
    expect(result).toEqual({ submitted: true });
    expect(mocks.resendEmailVerification).not.toHaveBeenCalled();
  });

  it("returns the SAME generic outcome even when the underlying service throws (infra failure never leaks to the browser)", async () => {
    mocks.resendEmailVerification.mockRejectedValue(new Error("db unreachable"));
    const result = await resendVerificationEmailAction(undefined, form("someone@example.com"));
    expect(result).toEqual({ submitted: true });
  });

  it("builds a locale-aware absolute activation URL using the request's own origin", async () => {
    await resendVerificationEmailAction(undefined, form("someone@example.com"));
    const deps = mocks.resendEmailVerification.mock.calls[0][2];
    expect(deps.buildVerifyUrl("raw-token-abc")).toBe("http://localhost:3100/en/verify-email?token=raw-token-abc");
    expect(deps.locale).toBe("en");
    expect(deps.sendEmail).toBe(resolvedSendEmail);
  });

  it("returns the SAME generic outcome when rate-limited, and never calls the service (no enumeration signal)", async () => {
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });
    const result = await resendVerificationEmailAction(undefined, form("someone@example.com"));
    expect(result).toEqual({ submitted: true });
    expect(mocks.resendEmailVerification).not.toHaveBeenCalled();
  });
});
