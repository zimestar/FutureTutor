"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { loginAction } from "@/lib/actions/auth";

export function LoginForm() {
  const t = useTranslations("auth.login");
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && (
        <p role="alert" className="rounded-md bg-error-light px-4 py-3 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("emailLabel")}
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("passwordLabel")}
        </label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? t("submitting") : t("submit")}
      </Button>

      <p className="text-center text-sm text-slate">
        {t("noAccount")}{" "}
        <Link href="/signup" className="font-semibold text-blue hover:text-blue-hover">
          {t("signupLink")}
        </Link>
      </p>
    </form>
  );
}
