"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createChildAction } from "@/lib/actions/family";

export interface AcademicLevelOption {
  id: string;
  label: string;
}

export function AddChildForm({ academicLevels }: { academicLevels: AcademicLevelOption[] }) {
  const t = useTranslations("family");
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createChildAction, undefined);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)} data-testid="open-add-child">
        {t("addChildCta")}
      </Button>
    );
  }

  return (
    <form
      // Remounts (clearing the uncontrolled inputs) after a successful
      // submission instead of resetting state from an effect — useActionState
      // has no built-in reset, and setting local state synchronously inside
      // an effect just to close/reset the form is exactly the cascading-render
      // pattern React's own lint rule warns against.
      key={state?.success ? "after-success" : "form"}
      action={formAction}
      className="mt-4 flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6"
      data-testid="add-child-form"
    >
      <p className="text-lg font-bold text-navy">{t("addChildForm.title")}</p>

      {state?.success && (
        <p className="rounded-md bg-success-light px-3 py-2 text-sm font-semibold text-success">
          {t("addChildForm.addedConfirmation")}
        </p>
      )}

      {state?.error && (
        <p role="alert" className="rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="child-firstName" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("addChildForm.firstNameLabel")}
          </label>
          <Input id="child-firstName" name="firstName" required />
          {state?.fieldErrors?.firstName && (
            <p role="alert" className="mt-1 text-sm text-error">
              {state.fieldErrors.firstName}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="child-lastName" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("addChildForm.lastNameLabel")}
          </label>
          <Input id="child-lastName" name="lastName" required />
          {state?.fieldErrors?.lastName && (
            <p role="alert" className="mt-1 text-sm text-error">
              {state.fieldErrors.lastName}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="child-dateOfBirth" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("addChildForm.dateOfBirthLabel")}
        </label>
        <Input id="child-dateOfBirth" name="dateOfBirth" type="date" required data-testid="child-dob" />
        {state?.fieldErrors?.dateOfBirth && (
          <p role="alert" className="mt-1 text-sm text-error">
            {state.fieldErrors.dateOfBirth}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="child-academicLevelId" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("addChildForm.academicLevelLabel")}
        </label>
        <Select id="child-academicLevelId" name="academicLevelId" defaultValue="">
          <option value="">{t("addChildForm.anyLevel")}</option>
          {academicLevels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label}
            </option>
          ))}
        </Select>
        {state?.fieldErrors?.academicLevelId && (
          <p role="alert" className="mt-1 text-sm text-error">
            {state.fieldErrors.academicLevelId}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending} data-testid="submit-add-child">
          {pending ? t("addChildForm.submitting") : t("addChildForm.submit")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          {t("addChildForm.cancel")}
        </Button>
      </div>
    </form>
  );
}
