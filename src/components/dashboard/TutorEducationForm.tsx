"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveTutorEducationAction } from "@/lib/actions/tutorEducation";

export interface EducationRow {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startYear: string;
  endYear: string;
}

export interface CertificationRow {
  name: string;
  issuer: string;
  issueYear: string;
  credentialUrl: string;
}

const emptyEducationRow: EducationRow = { institution: "", degree: "", fieldOfStudy: "", startYear: "", endYear: "" };
const emptyCertificationRow: CertificationRow = { name: "", issuer: "", issueYear: "", credentialUrl: "" };

export function TutorEducationForm({
  initialEducation,
  initialCertifications,
}: {
  initialEducation: EducationRow[];
  initialCertifications: CertificationRow[];
}) {
  const t = useTranslations("tutorEducationForm");
  const [state, formAction, pending] = useActionState(saveTutorEducationAction, undefined);
  const [education, setEducation] = useState<EducationRow[]>(
    initialEducation.length > 0 ? initialEducation : [emptyEducationRow]
  );
  const [certifications, setCertifications] = useState<CertificationRow[]>(initialCertifications);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state?.error && (
        <p role="alert" className="rounded-md bg-error-light px-4 py-3 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md bg-success-light px-4 py-3 text-sm font-semibold text-success">
          {t("saved")}
        </p>
      )}

      <input type="hidden" name="educationCount" value={education.length} />
      <input type="hidden" name="certificationCount" value={certifications.length} />

      <div>
        <p className="mb-3 text-sm font-semibold text-navy">{t("educationLabel")}</p>
        <div className="flex flex-col gap-4">
          {education.map((row, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-2">
              <Input
                name={`education-${i}-institution`}
                placeholder={t("institutionPlaceholder")}
                defaultValue={row.institution}
              />
              <Input name={`education-${i}-degree`} placeholder={t("degreePlaceholder")} defaultValue={row.degree} />
              <Input
                name={`education-${i}-fieldOfStudy`}
                placeholder={t("fieldOfStudyPlaceholder")}
                defaultValue={row.fieldOfStudy}
              />
              <div className="flex gap-3">
                <Input
                  name={`education-${i}-startYear`}
                  type="number"
                  placeholder={t("startYearPlaceholder")}
                  defaultValue={row.startYear}
                />
                <Input
                  name={`education-${i}-endYear`}
                  type="number"
                  placeholder={t("endYearPlaceholder")}
                  defaultValue={row.endYear}
                />
              </div>
              <button
                type="button"
                onClick={() => setEducation(education.filter((_, idx) => idx !== i))}
                className="justify-self-start text-sm font-semibold text-error sm:col-span-2"
              >
                {t("removeRow")}
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setEducation([...education, emptyEducationRow])}
          className="mt-3 text-sm font-semibold text-blue"
        >
          {t("addEducation")}
        </button>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-navy">{t("certificationsLabel")}</p>
        <div className="flex flex-col gap-4">
          {certifications.map((row, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-2">
              <Input name={`certification-${i}-name`} placeholder={t("certNamePlaceholder")} defaultValue={row.name} />
              <Input
                name={`certification-${i}-issuer`}
                placeholder={t("issuerPlaceholder")}
                defaultValue={row.issuer}
              />
              <Input
                name={`certification-${i}-issueYear`}
                type="number"
                placeholder={t("issueYearPlaceholder")}
                defaultValue={row.issueYear}
              />
              <Input
                name={`certification-${i}-credentialUrl`}
                placeholder={t("credentialUrlPlaceholder")}
                defaultValue={row.credentialUrl}
              />
              <button
                type="button"
                onClick={() => setCertifications(certifications.filter((_, idx) => idx !== i))}
                className="justify-self-start text-sm font-semibold text-error sm:col-span-2"
              >
                {t("removeRow")}
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCertifications([...certifications, emptyCertificationRow])}
          className="mt-3 text-sm font-semibold text-blue"
        >
          {t("addCertification")}
        </button>
      </div>

      <div className="border-t border-neutral-200 pt-6">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
