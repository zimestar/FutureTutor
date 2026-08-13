"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { uploadDocumentAction } from "@/lib/actions/tutorDocuments";

const DOCUMENT_TYPES = ["TRANSCRIPT", "DIPLOMA", "DEGREE", "CERTIFICATE", "ENROLLMENT_PROOF", "OTHER"] as const;

export function TutorDocumentUploadForm() {
  const t = useTranslations("tutorDocuments");
  const [state, formAction, pending] = useActionState(uploadDocumentAction, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-4">
      {state?.error && (
        <p role="alert" className="w-full rounded-md bg-error-light px-4 py-3 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="w-full rounded-md bg-success-light px-4 py-3 text-sm font-semibold text-success">
          {t("uploadSuccess")}
        </p>
      )}
      <div>
        <label htmlFor="type" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("typeLabel")}
        </label>
        <Select id="type" name="type" required className="w-56">
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label htmlFor="file" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("fileLabel")}
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          required
          className="block text-sm text-navy"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("uploading") : t("upload")}
      </Button>
      <p className="w-full text-xs text-slate">{t("uploadHint")}</p>
    </form>
  );
}
