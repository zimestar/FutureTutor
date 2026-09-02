"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { verifyEmailAction } from "@/lib/actions/auth";

/**
 * BETA-EMAILVERIFY1 — mirrors ResetPasswordForm.tsx's token-handling shape
 * exactly (read `?token=` from search params, invalid-link fallback,
 * success/error states), with one deliberate difference: activation needs
 * no additional user input (no password to type), so instead of a form the
 * user fills out, this renders a single explicit "Activate my account"
 * button the user must click — nothing is consumed merely by the page
 * loading (a GET request, e.g. from an email client's link-scanning bot,
 * never triggers the Server Action; only an actual click does).
 */
export function ActivateAccountForm() {
  const t = useTranslations("auth.verifyEmail");
  const tokenParam = useSearchParams().get("token");
  const token = tokenParam?.trim() ? tokenParam : null;
  const [state, formAction, pending] = useActionState(verifyEmailAction, undefined);

  if (!token && !state) {
    return <InvalidActivationLink />;
  }

  if (state && "success" in state && state.success) {
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

  if (state && "error" in state) {
    return <InvalidActivationLink />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token ?? ""} />
      <p className="text-sm text-slate">{t("description")}</p>
      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending} className="mt-2">
        {pending ? t("activating") : t("activateCta")}
      </Button>
    </form>
  );
}

function InvalidActivationLink() {
  const t = useTranslations("auth.verifyEmail");
  return (
    <div className="flex flex-col gap-5">
      <div role="alert" className="rounded-md bg-error-light px-4 py-4 text-sm text-navy">
        <p className="font-semibold">{t("invalidTitle")}</p>
        <p className="mt-1 text-slate">{t("invalidDescription")}</p>
      </div>
      <Link
        href="/check-email"
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-5 text-sm font-semibold text-navy transition-colors hover:border-navy hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2"
      >
        {t("requestAnother")}
      </Link>
    </div>
  );
}
