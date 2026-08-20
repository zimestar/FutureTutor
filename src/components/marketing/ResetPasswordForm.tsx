"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { resetPasswordAction, type ResetPasswordActionState } from "@/lib/actions/auth";
import { passwordConfirmationMatches } from "@/lib/accountRecoveryPresentation";

type ResetFormState = ResetPasswordActionState | { error: "password_mismatch" };

export function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const tSignup = useTranslations("auth.signup");
  const tokenParam = useSearchParams().get("token");
  const token = tokenParam?.trim() ? tokenParam : null;
  const [state, formAction, pending] = useActionState<ResetFormState, FormData>(
    async (_previousState, formData) => {
      const password = String(formData.get("password") ?? "");
      const confirmation = String(formData.get("passwordConfirmation") ?? "");
      if (!passwordConfirmationMatches(password, confirmation)) return { error: "password_mismatch" };
      if (!token) return { error: "invalid_request" };

      const request = new FormData();
      request.set("token", token);
      request.set("password", password);
      return resetPasswordAction(undefined, request);
    },
    undefined
  );
  const succeeded = Boolean(state && "success" in state && state.success);
  const error = state && "error" in state ? state.error : undefined;

  useEffect(() => {
    if (succeeded) window.history.replaceState(null, "", window.location.pathname);
  }, [succeeded]);

  if (!token && !state) {
    return <InvalidResetLink />;
  }

  if (succeeded) {
    return (
      <div className="flex flex-col gap-5">
        <div role="status" aria-live="polite" className="rounded-md bg-success-light px-4 py-4 text-sm text-navy">
          <p className="font-semibold">{t("successTitle")}</p>
          <p className="mt-1 text-slate">{t("successDescription")}</p>
        </div>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-hover focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2"
        >
          {t("loginAction")}
        </Link>
      </div>
    );
  }

  if (error === "invalid_request" || error === "invalid_or_expired_token") {
    return <InvalidResetLink />;
  }

  const passwordError = error === "invalid_password" ? t("passwordPolicyError") : undefined;
  const confirmationError = error === "password_mismatch" ? t("passwordMismatch") : undefined;
  const genericError = error === "reset_failed" ? t("genericError") : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {genericError && (
        <p role="alert" className="rounded-md bg-error-light px-4 py-3 text-sm font-semibold text-error">
          {genericError}
        </p>
      )}
      <div>
        <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("passwordLabel")}
        </label>
        <PasswordInput
          id="new-password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          aria-invalid={Boolean(passwordError)}
          aria-describedby="password-guidance"
        />
        <p id="password-guidance" className={passwordError ? "mt-1.5 text-sm text-error" : "mt-1.5 text-xs text-slate"}>
          {passwordError ?? tSignup("passwordHint")}
        </p>
      </div>
      <div>
        <label htmlFor="password-confirmation" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("confirmationLabel")}
        </label>
        <PasswordInput
          id="password-confirmation"
          name="passwordConfirmation"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          aria-invalid={Boolean(confirmationError)}
          aria-describedby={confirmationError ? "password-confirmation-error" : undefined}
        />
        {confirmationError && <p id="password-confirmation-error" role="alert" className="mt-1 text-sm text-error">{confirmationError}</p>}
      </div>
      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending} className="mt-2">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

function InvalidResetLink() {
  const t = useTranslations("auth.resetPassword");
  return (
    <div className="flex flex-col gap-5">
      <div role="alert" className="rounded-md bg-error-light px-4 py-4 text-sm text-navy">
        <p className="font-semibold">{t("invalidTitle")}</p>
        <p className="mt-1 text-slate">{t("invalidDescription")}</p>
      </div>
      <Link
        href="/forgot-password"
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-5 text-sm font-semibold text-navy transition-colors hover:border-navy hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2"
      >
        {t("requestAnother")}
      </Link>
    </div>
  );
}
