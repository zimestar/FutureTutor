"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { resendVerificationEmailAction } from "@/lib/actions/auth";

/**
 * BETA-EMAILVERIFY1 — dual-purpose page, mirroring ForgotPasswordForm.tsx's
 * shape: (a) landed on right after signup/claim, with `?email=` present —
 * shows "we sent an email to X" plus a pre-filled resend form; (b) reached
 * directly (e.g. from ActivateAccountForm's "request another" link, with no
 * query param) — shows a generic "enter your email" resend form. Either
 * way, resendVerificationEmailAction's own no-enumeration contract means
 * this page never learns or reveals whether a given email actually needs
 * verifying.
 */
export function CheckEmailForm() {
  const t = useTranslations("auth.checkEmail");
  const emailParam = useSearchParams().get("email");
  const knownEmail = emailParam?.trim() ? emailParam : null;
  const [state, formAction, pending] = useActionState(resendVerificationEmailAction, undefined);

  if (state?.submitted) {
    return (
      <div className="flex flex-col gap-5">
        <div role="status" aria-live="polite" className="rounded-md bg-success-light px-4 py-4 text-sm text-navy">
          <p className="font-semibold">{t("resendSubmittedTitle")}</p>
          <p className="mt-1 text-slate">{t("resendSubmittedDescription")}</p>
        </div>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-5 text-sm font-semibold text-navy transition-colors hover:border-navy hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2"
        >
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <p className="text-sm text-slate">
          {knownEmail ? t("withEmailDescription", { email: knownEmail }) : t("genericDescription")}
        </p>
        <div className="mt-4 rounded-md bg-off-white p-4 text-sm text-slate">
          <p className="font-semibold text-navy">{t("steps.title")}</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5">
            <li>{t("steps.check")}</li>
            <li>{t("steps.spam")}</li>
            <li>{t("steps.expiry")}</li>
            <li>{t("steps.resend")}</li>
          </ul>
        </div>
      </div>

      <form action={formAction} className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6">
        <p className="text-sm font-bold text-navy">{t("resendTitle")}</p>
        <div>
          <label htmlFor="resend-email" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("emailLabel")}
          </label>
          <Input id="resend-email" name="email" type="email" autoComplete="email" defaultValue={knownEmail ?? ""} required />
        </div>
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? t("resending") : t("resendCta")}
        </Button>
      </form>

      <Link
        href="/login"
        className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-blue hover:text-blue-hover focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2"
      >
        {t("backToLogin")}
      </Link>
    </div>
  );
}
