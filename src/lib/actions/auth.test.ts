import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createUserForSignup: vi.fn(),
  signIn: vi.fn(),
  redirect: vi.fn(),
  hash: vi.fn(),
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
vi.mock("@/lib/auth", () => ({ signIn: mocks.signIn, signOut: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/services/signup", () => ({ createUserForSignup: mocks.createUserForSignup }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));

import { registerAction } from "./auth";
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
