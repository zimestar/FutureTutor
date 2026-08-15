"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { updateParentProfileAction } from "@/lib/actions/profile";

export function ParentProfileEditForm({
  initialValues,
}: {
  initialValues: {
    firstName: string;
    lastName: string;
    province: string | null;
    city: string | null;
    preferredLanguage: string;
  };
}) {
  const t = useTranslations("profile.parentForm");
  const [state, formAction, pending] = useActionState(updateParentProfileAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="parent-profile-edit-form">
      {state?.success && (
        <p className="rounded-md bg-success-light px-3 py-2 text-sm font-semibold text-success" data-testid="profile-update-success">
          {t("updated")}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-navy">{t("firstNameLabel")}</label>
          <Input name="firstName" defaultValue={initialValues.firstName} required maxLength={50} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-navy">{t("lastNameLabel")}</label>
          <Input name="lastName" defaultValue={initialValues.lastName} required maxLength={50} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-navy">{t("provinceLabel")}</label>
          <Input name="province" defaultValue={initialValues.province ?? ""} maxLength={100} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-navy">{t("cityLabel")}</label>
          <Input name="city" defaultValue={initialValues.city ?? ""} maxLength={100} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-navy">{t("preferredLanguageLabel")}</label>
        <Select name="preferredLanguage" defaultValue={initialValues.preferredLanguage}>
          <option value="en">{t("preferredLanguage.en")}</option>
          <option value="fr">{t("preferredLanguage.fr")}</option>
        </Select>
      </div>

      <div>
        <Button type="submit" disabled={pending} data-testid="submit-profile-update">
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
