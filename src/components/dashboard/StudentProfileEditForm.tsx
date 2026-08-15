"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { updateStudentProfileAction } from "@/lib/actions/profile";
import type { StudentProfileGuardianField } from "@/services/profileManagement";

export interface StudentProfileEditFormValues {
  firstName: string;
  lastName: string;
  province: string | null;
  city: string | null;
  academicLevelId: string | null;
  tutoringMode: "ONLINE" | "IN_PERSON" | "BOTH";
  preferredLanguage: string;
  dateOfBirth: string | null;
}

/**
 * Phase H.6 (§21) — server-side field authorization drives what renders as
 * editable vs. read-only here; this component never decides authorization
 * itself, it only reflects `editableFields` (computed server-side by
 * resolveEditableStudentProfileFields and passed down from the page). Even
 * if this rendering were somehow bypassed, updateStudentProfileForActor
 * independently re-validates every submitted field against a fresh H.2
 * read — this form's conditional rendering is UX only (§40).
 *
 * dateOfBirth is never in `editableFields` (it's not a member of any
 * editable field set at all — see profileManagement.ts) and is always
 * shown read-only with a correction note, never a form input.
 */
export function StudentProfileEditForm({
  studentProfileId,
  initialValues,
  editableFields,
  academicLevels,
}: {
  studentProfileId: string;
  initialValues: StudentProfileEditFormValues;
  editableFields: readonly StudentProfileGuardianField[];
  academicLevels: { id: string; label: string }[];
}) {
  const t = useTranslations("profile.studentForm");
  const [state, formAction, pending] = useActionState(updateStudentProfileAction, undefined);

  const canEdit = (field: StudentProfileGuardianField) => editableFields.includes(field);

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="student-profile-edit-form">
      <input type="hidden" name="studentProfileId" value={studentProfileId} />

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
        <ProfileField label={t("firstNameLabel")} editable={canEdit("firstName")} testId="field-firstName">
          {canEdit("firstName") ? (
            <Input name="firstName" defaultValue={initialValues.firstName} required maxLength={50} />
          ) : (
            <ReadOnlyValue>{initialValues.firstName}</ReadOnlyValue>
          )}
        </ProfileField>

        <ProfileField label={t("lastNameLabel")} editable={canEdit("lastName")} testId="field-lastName">
          {canEdit("lastName") ? (
            <Input name="lastName" defaultValue={initialValues.lastName} required maxLength={50} />
          ) : (
            <ReadOnlyValue>{initialValues.lastName}</ReadOnlyValue>
          )}
        </ProfileField>
      </div>

      <ProfileField label={t("dateOfBirthLabel")} editable={false} testId="field-dateOfBirth">
        <ReadOnlyValue>{initialValues.dateOfBirth ?? t("notSet")}</ReadOnlyValue>
        <p className="mt-1 text-xs text-slate">{t("dateOfBirthReadOnlyNote")}</p>
      </ProfileField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ProfileField label={t("provinceLabel")} editable={canEdit("province")} testId="field-province">
          {canEdit("province") ? (
            <Input name="province" defaultValue={initialValues.province ?? ""} maxLength={100} />
          ) : (
            <ReadOnlyValue>{initialValues.province ?? t("notSet")}</ReadOnlyValue>
          )}
        </ProfileField>

        <ProfileField label={t("cityLabel")} editable={canEdit("city")} testId="field-city">
          {canEdit("city") ? (
            <Input name="city" defaultValue={initialValues.city ?? ""} maxLength={100} />
          ) : (
            <ReadOnlyValue>{initialValues.city ?? t("notSet")}</ReadOnlyValue>
          )}
        </ProfileField>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ProfileField label={t("academicLevelLabel")} editable={canEdit("academicLevelId")} testId="field-academicLevelId">
          {canEdit("academicLevelId") ? (
            <Select name="academicLevelId" defaultValue={initialValues.academicLevelId ?? ""}>
              <option value="">{t("anyLevel")}</option>
              {academicLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.label}
                </option>
              ))}
            </Select>
          ) : (
            <ReadOnlyValue>
              {academicLevels.find((l) => l.id === initialValues.academicLevelId)?.label ?? t("notSet")}
            </ReadOnlyValue>
          )}
        </ProfileField>

        <ProfileField label={t("tutoringModeLabel")} editable={canEdit("tutoringMode")} testId="field-tutoringMode">
          {canEdit("tutoringMode") ? (
            <Select name="tutoringMode" defaultValue={initialValues.tutoringMode}>
              <option value="ONLINE">{t("tutoringMode.ONLINE")}</option>
              <option value="IN_PERSON">{t("tutoringMode.IN_PERSON")}</option>
              <option value="BOTH">{t("tutoringMode.BOTH")}</option>
            </Select>
          ) : (
            <ReadOnlyValue>{t(`tutoringMode.${initialValues.tutoringMode}`)}</ReadOnlyValue>
          )}
        </ProfileField>
      </div>

      <ProfileField label={t("preferredLanguageLabel")} editable={canEdit("preferredLanguage")} testId="field-preferredLanguage">
        {canEdit("preferredLanguage") ? (
          <Select name="preferredLanguage" defaultValue={initialValues.preferredLanguage}>
            <option value="en">{t("preferredLanguage.en")}</option>
            <option value="fr">{t("preferredLanguage.fr")}</option>
          </Select>
        ) : (
          <ReadOnlyValue>{t(`preferredLanguage.${initialValues.preferredLanguage}`)}</ReadOnlyValue>
        )}
      </ProfileField>

      {editableFields.length > 0 && (
        <div>
          <Button type="submit" disabled={pending} data-testid="submit-profile-update">
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      )}
    </form>
  );
}

function ProfileField({
  label,
  editable,
  testId,
  children,
}: {
  label: string;
  editable: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId} data-editable={editable}>
      <label className="mb-1.5 block text-sm font-semibold text-navy">{label}</label>
      {children}
    </div>
  );
}

function ReadOnlyValue({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-[15px] text-slate">{children}</p>;
}
