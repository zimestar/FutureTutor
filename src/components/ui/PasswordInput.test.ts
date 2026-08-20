import { readFileSync } from "node:fs";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { passwordInputType } from "@/lib/passwordVisibility";

const passwordInputSource = readFileSync("src/components/ui/PasswordInput.tsx", "utf8");
const loginSource = readFileSync("src/components/marketing/LoginForm.tsx", "utf8");
const signupSource = readFileSync("src/components/marketing/SignupForm.tsx", "utf8");
const resetSource = readFileSync("src/components/marketing/ResetPasswordForm.tsx", "utf8");

describe("PasswordInput visibility", () => {
  it("is hidden by default, can show, and can hide again", () => {
    expect(passwordInputType(false)).toBe("password");
    expect(passwordInputType(true)).toBe("text");
    expect(passwordInputType(false)).toBe("password");
    expect(passwordInputSource).toContain("React.useState(false)");
  });

  it("uses a non-submitting, keyboard-accessible button with an updating screen-reader label", () => {
    expect(passwordInputSource).toContain('type="button"');
    expect(passwordInputSource).toContain("onClick={() => setVisible");
    expect(passwordInputSource).toContain("aria-label={label}");
    expect(passwordInputSource).toContain("aria-pressed={visible}");
    expect(passwordInputSource).toContain("min-h-11 min-w-11");
  });

  it("changes only the input type and never copies, stores, logs, or resets its value", () => {
    expect(passwordInputSource).toContain("type={passwordInputType(visible)}");
    expect(passwordInputSource).not.toMatch(/value=|defaultValue=|localStorage|sessionStorage|console\.|analytics/);
  });

  it("is shared by login, signup, and both reset-password fields", () => {
    expect(loginSource.match(/<PasswordInput/g)).toHaveLength(1);
    expect(signupSource.match(/<PasswordInput/g)).toHaveLength(1);
    expect(resetSource.match(/<PasswordInput/g)).toHaveLength(2);
  });

  it("preserves current-password and new-password autocomplete semantics", () => {
    expect(loginSource).toContain('autoComplete="current-password"');
    expect(signupSource).toContain('autoComplete="new-password"');
    expect(resetSource.match(/autoComplete="new-password"/g)).toHaveLength(2);
  });

  it.each([["en", en], ["fr-CA", fr]] as const)("resolves Show/Hide labels in %s", (locale, messages) => {
    const t = createTranslator({ locale, messages, namespace: "auth.passwordVisibility", onError: (error) => { throw error; } });
    expect(t("show")).not.toContain("auth.passwordVisibility");
    expect(t("hide")).not.toContain("auth.passwordVisibility");
  });

  it("never renders a password value outside the input", () => {
    expect(passwordInputSource).not.toMatch(/children.*password|\{props\.value\}/i);
  });
});
