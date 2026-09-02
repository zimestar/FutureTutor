"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Input, Select } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { registerAction } from "@/lib/actions/auth";
import { CANADIAN_PROVINCES_AND_TERRITORIES } from "@/lib/canadianProvinces";

export function SignupForm() {
  const t = useTranslations("auth.signup");
  // BETA-UX-PROVINCES1 — display-only full names for the canonical
  // AB/BC/... codes; the <option value> (submitted/stored) stays the
  // abbreviation, only the visible label changes.
  const tProvinces = useTranslations("provinces");
  const [state, formAction, pending] = useActionState(registerAction, undefined);
  const [role, setRole] = useState<"STUDENT" | "TUTOR" | "PARENT">("STUDENT");

  const roleLabels: Record<"STUDENT" | "TUTOR" | "PARENT", string> = {
    STUDENT: t("roleStudent"),
    PARENT: t("roleParent"),
    TUTOR: t("roleTutor"),
  };
  const roleDescriptions: Record<"STUDENT" | "TUTOR" | "PARENT", string> = {
    STUDENT: t("roleStudentDescription"),
    PARENT: t("roleParentDescription"),
    TUTOR: t("roleTutorDescription"),
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && (
        <p role="alert" className="rounded-md bg-error-light px-4 py-3 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}

      <div role="radiogroup" aria-label={t("roleLabel")} className="grid grid-cols-3 gap-3">
        {(["STUDENT", "PARENT", "TUTOR"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={role === option}
            onClick={() => setRole(option)}
            className={cn(
              "min-h-20 rounded-xl border px-3 py-3 text-left text-sm transition-colors",
              role === option
                ? "border-blue bg-blue/5 text-blue"
                : "border-neutral-300 text-slate hover:border-neutral-400"
            )}
          >
            <span className="block font-bold">{roleLabels[option]}</span>
            <span className="mt-1 block text-xs leading-4 opacity-75">{roleDescriptions[option]}</span>
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
          {state?.fieldErrors?.firstName && <p role="alert" className="mt-1 text-sm text-error">{state.fieldErrors.firstName}</p>}
        </div>
        <div>
          <label htmlFor="lastName" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("lastNameLabel")}
          </label>
          <Input id="lastName" name="lastName" autoComplete="family-name" required />
          {state?.fieldErrors?.lastName && <p role="alert" className="mt-1 text-sm text-error">{state.fieldErrors.lastName}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("emailLabel")}
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        {state?.fieldErrors?.email && <p role="alert" className="mt-1 text-sm text-error">{state.fieldErrors.email}</p>}
      </div>

      {role === "STUDENT" && (
        <div>
          <label htmlFor="dateOfBirth" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("dateOfBirthLabel")}
          </label>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" required />
          {state?.fieldErrors?.dateOfBirth && <p role="alert" className="mt-1 text-sm text-error">{state.fieldErrors.dateOfBirth}</p>}
        </div>
      )}

      {role === "STUDENT" && (
        <div>
          <label htmlFor="province" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("provinceLabel")}
          </label>
          <Select id="province" name="province" required defaultValue="">
            <option value="" disabled>{t("provincePlaceholder")}</option>
            {CANADIAN_PROVINCES_AND_TERRITORIES.map((province) => (
              <option key={province} value={province}>{tProvinces(province)}</option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-slate">{t("provinceHint")}</p>
          {state?.fieldErrors?.province && <p role="alert" className="mt-1 text-sm text-error">{state.fieldErrors.province}</p>}
        </div>
      )}

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("passwordLabel")}
        </label>
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} maxLength={72} required />
        <p className="mt-1.5 text-xs text-slate">{t("passwordHint")}</p>
        {state?.fieldErrors?.password && <p role="alert" className="mt-1 text-sm text-error">{state.fieldErrors.password}</p>}
      </div>

      <label className="flex items-start gap-2.5 text-sm text-slate">
        <input
          type="checkbox"
          name="termsAccepted"
          value="true"
          required
          className="mt-0.5 size-4 shrink-0 accent-blue"
        />
        <span>
          {t("termsAcceptancePrefix")}{" "}
          <Link href="/terms" target="_blank" className="font-semibold text-blue hover:text-blue-hover">
            {t("termsAcceptanceLink")}
          </Link>{" "}
          {t("privacyAcknowledgementPrefix")}{" "}
          <Link href="/privacy" target="_blank" className="font-semibold text-blue hover:text-blue-hover">
            {t("privacyAcknowledgementLink")}
          </Link>
          .
        </span>
      </label>
      {state?.fieldErrors?.termsAccepted && <p role="alert" className="text-sm text-error">{state.fieldErrors.termsAccepted}</p>}

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
