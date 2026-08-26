import { readFileSync } from "node:fs";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { passwordConfirmationMatches } from "./accountRecoveryPresentation";

const loginForm = readFileSync("src/components/marketing/LoginForm.tsx", "utf8");
const forgotForm = readFileSync("src/components/marketing/ForgotPasswordForm.tsx", "utf8");
const resetForm = readFileSync("src/components/marketing/ResetPasswordForm.tsx", "utf8");
const forgotPage = readFileSync("src/app/[locale]/forgot-password/page.tsx", "utf8");
const resetPage = readFileSync("src/app/[locale]/reset-password/page.tsx", "utf8");
const authShell = readFileSync("src/components/marketing/AuthExperienceShell.tsx", "utf8");
const authActions = readFileSync("src/lib/actions/auth.ts", "utf8");

describe("L1-01C account recovery presentation", () => {
  it("adds the locale-aware Forgot Password login entry point", () => {
    expect(loginForm).toContain('href="/forgot-password"');
    expect(loginForm).toContain('t("forgotPasswordLink")');
    expect(loginForm).toContain("min-h-11");
  });

  it("provides localized forgot/reset route shells with one H1 each", () => {
    expect(forgotPage).toContain("ForgotPasswordForm");
    expect(resetPage).toContain("ResetPasswordForm");
    expect(forgotPage).toContain('title={t("title")}');
    expect(resetPage).toContain('title={t("title")}');
    expect(authShell.match(/<h1/g)).toHaveLength(1);
  });

  it("reads the authoritative URL token without decoding or duplicating it into server props", () => {
    expect(resetPage).toContain("Suspense");
    expect(resetPage).not.toContain("searchParams");
    expect(resetForm).toContain("useSearchParams().get(\"token\")");
    expect(`${resetPage}\n${resetForm}`).not.toMatch(/atob|jwt|decode|userId|expiresAt/);
  });

  it("never renders or logs the raw token and removes it from the URL after success", () => {
    expect(resetForm).not.toMatch(/<input[\s\S]+name=["']token["']/);
    expect(resetForm).not.toMatch(/console\.|localStorage|sessionStorage/);
    expect(resetForm).toContain('request.set("token", token)');
    expect(resetForm).toContain("window.history.replaceState");
  });

  it("uses one generic submitted state for every forgot-password request", () => {
    expect(forgotForm).toContain("state?.submitted");
    expect(forgotForm).not.toMatch(/account not found|no user exists|found your account/i);
    expect(authActions).toContain("return { submitted: true }");
  });

  it("blocks double submit and preserves the entered email", () => {
    expect(forgotForm).toContain("disabled={pending}");
    expect(forgotForm).toContain("value={email}");
    expect(resetForm).toContain("disabled={pending}");
  });

  it("validates password confirmation without changing the backend contract", () => {
    expect(passwordConfirmationMatches("TestPass123!", "TestPass123!")).toBe(true);
    expect(passwordConfirmationMatches("TestPass123!", "different")).toBe(false);
    expect(resetForm).toContain("password_mismatch");
  });

  it("reuses signup password guidance and never claims session revocation or auto-login", () => {
    expect(resetForm).toContain('useTranslations("auth.signup")');
    expect(resetForm).toContain('tSignup("passwordHint")');
    expect(`${resetForm}\n${JSON.stringify(en.auth.resetPassword)}\n${JSON.stringify(fr.auth.resetPassword)}`).not.toMatch(
      /all devices|tous les appareils|signed out|déconnectés de tous/i
    );
    expect(resetForm).not.toContain("signIn(");
  });

  it.each([["en", en], ["fr-CA", fr]] as const)("resolves every recovery key in %s", (locale, messages) => {
    const forgot = createTranslator({ locale, messages, namespace: "auth.forgotPassword", onError: (error) => { throw error; } });
    const reset = createTranslator({ locale, messages, namespace: "auth.resetPassword", onError: (error) => { throw error; } });
    const translateForgot = forgot as unknown as (key: string) => string;
    const translateReset = reset as unknown as (key: string) => string;
    for (const key of Object.keys(messages.auth.forgotPassword)) expect(translateForgot(key)).not.toContain(`auth.forgotPassword.${key}`);
    for (const key of Object.keys(messages.auth.resetPassword)) expect(translateReset(key)).not.toContain(`auth.resetPassword.${key}`);
  });

  it("keeps the existing role-aware login redirect contract", () => {
    expect(authActions).toContain('redirect({ href: homePathForRole(user?.role ?? "STUDENT"), locale })');
  });
});
