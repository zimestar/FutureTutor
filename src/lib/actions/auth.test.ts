import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InvalidOrExpiredResetTokenError extends Error {}
  class ResetPasswordPolicyError extends Error {}
  return {
    findUnique: vi.fn(),
    createUserForSignup: vi.fn(),
    signIn: vi.fn(),
    redirect: vi.fn(),
    hash: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    getAppBaseUrl: vi.fn(),
    resolveSendPasswordResetEmail: vi.fn(),
    consoleDevSendPasswordResetEmail: vi.fn(),
    InvalidOrExpiredResetTokenError,
    ResetPasswordPolicyError,
  };
});

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
vi.mock("@/lib/auth", () => ({ signIn: mocks.signIn, signOut: vi.fn() }));
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
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));

import { registerAction, forgotPasswordAction, resetPasswordAction } from "./auth";
import { signInResultHasError } from "@/services/signupAuthResult";

function parentForm(email = "parent.qa@futuretutor.local") {
  const form = new FormData();
  form.set("firstName", "Pat");
  form.set("lastName", "Parent");
  form.set("email", email);
  form.set("password", "LocalTestPassword123!");
  form.set("role", "PARENT");
  return form;
}

describe("registerAction — Parent signup hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("test-hash");
    mocks.createUserForSignup.mockResolvedValue({ id: "parent-user" });
    mocks.signIn.mockResolvedValue("http://localhost:3100/en/signup");
  });

  it("accepts a real Parent FormData payload where dateOfBirth is absent", async () => {
    await registerAction(undefined, parentForm());

    expect(mocks.createUserForSignup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: "PARENT", dateOfBirth: undefined })
    );
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/dashboard", locale: "en" });
  });

  it("returns an actionable field error without exposing raw Zod details", async () => {
    const result = await registerAction(undefined, parentForm("not-an-email"));

    expect(result).toEqual({ error: "invalidInput", fieldErrors: { email: "emailInvalid" } });
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
  });

  it("preserves the created account and returns recovery guidance when Auth.js returns a failure URL", async () => {
    mocks.signIn.mockResolvedValue("http://localhost:3100/login?error=CredentialsSignin&code=credentials");

    const result = await registerAction(undefined, parentForm());

    expect(result).toEqual({ error: "accountCreatedSignInFailed", accountCreated: true });
    expect(mocks.createUserForSignup).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not create a duplicate profile when signup is retried after create-success/sign-in-failure", async () => {
    mocks.signIn.mockResolvedValue("http://localhost:3100/login?error=CredentialsSignin");
    await registerAction(undefined, parentForm());
    mocks.findUnique.mockResolvedValue({ id: "parent-user", role: "PARENT" });

    const retry = await registerAction(undefined, parentForm());

    expect(retry).toEqual({ error: "emailTaken" });
    expect(mocks.createUserForSignup).toHaveBeenCalledTimes(1);
  });

  it("returns the same recovery guidance when automatic sign-in throws", async () => {
    mocks.signIn.mockRejectedValue(new Error("sign-in unavailable"));

    const result = await registerAction(undefined, parentForm());

    expect(result).toEqual({ error: "accountCreatedSignInFailed", accountCreated: true });
    expect(mocks.createUserForSignup).toHaveBeenCalledTimes(1);
  });
});

describe("signInResultHasError", () => {
  it("recognizes Auth.js error URLs and fails closed for unexpected results", () => {
    expect(signInResultHasError("/login?error=CredentialsSignin")).toBe(true);
    expect(signInResultHasError("http://localhost:3100/en/signup")).toBe(false);
    expect(signInResultHasError(undefined)).toBe(true);
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
});

describe("resetPasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
