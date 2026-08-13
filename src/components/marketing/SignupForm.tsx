"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { registerAction } from "@/lib/actions/auth";

export function SignupForm() {
  const t = useTranslations("auth.signup");
  const [state, formAction, pending] = useActionState(registerAction, undefined);
  const [role, setRole] = useState<"STUDENT" | "TUTOR">("STUDENT");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && (
        <p role="alert" className="rounded-md bg-error-light px-4 py-3 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}

      <div role="radiogroup" aria-label={t("roleLabel")} className="grid grid-cols-2 gap-3">
        {(["STUDENT", "TUTOR"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={role === option}
            onClick={() => setRole(option)}
            className={cn(
              "rounded-md border px-4 py-3 text-left text-sm font-semibold transition-colors",
              role === option
                ? "border-blue bg-blue/5 text-blue"
                : "border-neutral-300 text-slate hover:border-neutral-400"
            )}
          >
            {option === "STUDENT" ? t("roleStudent") : t("roleTutor")}
          </button>
        ))}
        <input type="hidden" name="role" value={role} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("firstNameLabel")}
          </label>
          <Input id="firstName" name="firstName" autoComplete="given-name" required />
        </div>
        <div>
          <label htmlFor="lastName" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("lastNameLabel")}
          </label>
          <Input id="lastName" name="lastName" autoComplete="family-name" required />
        </div>
      </div>

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
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <p className="mt-1.5 text-xs text-slate">{t("passwordHint")}</p>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? t("submitting") : t("submit")}
      </Button>

      <p className="text-center text-sm text-slate">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-blue hover:text-blue-hover">
          {t("loginLink")}
        </Link>
      </p>
    </form>
  );
}
