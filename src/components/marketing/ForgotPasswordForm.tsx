"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { forgotPasswordAction } from "@/lib/actions/auth";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState(forgotPasswordAction, undefined);

  if (state?.submitted) {
    return (
      <div className="flex flex-col gap-5">
        <div role="status" aria-live="polite" className="rounded-md bg-success-light px-4 py-4 text-sm text-navy">
          <p className="font-semibold">{t("submittedTitle")}</p>
          <p className="mt-1 text-slate">{t("submittedDescription")}</p>
        </div>
        <p className="text-sm text-slate">{t("submittedPrivacy")}</p>
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
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="recovery-email" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("emailLabel")}
        </label>
        <Input
          id="recovery-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending} className="mt-2">
        {pending ? t("submitting") : t("submit")}
      </Button>
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-blue hover:text-blue-hover focus-visible:outline-2 focus-visible:outline-blue focus-visible:outline-offset-2"
      >
        {t("backToLogin")}
      </Link>
    </form>
  );
}
