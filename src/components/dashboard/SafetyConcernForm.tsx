"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { submitSafetyConcernAction } from "@/lib/actions/safetyConcernReports";
import {
  SAFETY_CONCERN_CATEGORIES,
  SAFETY_CONCERN_CONCERNING_MAX_LENGTH,
  SAFETY_CONCERN_DESCRIPTION_MAX_LENGTH,
  SAFETY_CONCERN_DESCRIPTION_MIN_LENGTH,
} from "@/schemas/safetyConcernReports";

/** SAFETY-REPORTS1 — the reporting form. Once sent, it shows the reference only. */
export function SafetyConcernForm() {
  const t = useTranslations("safetyReport");
  const [state, formAction, pending] = useActionState(submitSafetyConcernAction, undefined);
  const [immediateDanger, setImmediateDanger] = useState(false);

  if (state?.reportId) {
    return (
      <Alert tone="success" title={t("sentTitle")}>
        <p>{t("sentBody")}</p>
        <p className="mt-2 font-mono text-xs">
          {t("reference")} {state.reportId}
        </p>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate={false}>
      {state?.error && <Alert tone="error">{state.error}</Alert>}

      <div>
        <label htmlFor="safety-category" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("categoryLabel")}
        </label>
        <Select id="safety-category" name="category" required defaultValue="">
          <option value="" disabled>
            {t("categoryPlaceholder")}
          </option>
          {SAFETY_CONCERN_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(`categories.${category}`)}
            </option>
          ))}
        </Select>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <input
          type="checkbox"
          name="immediateDanger"
          className="mt-1 size-4"
          checked={immediateDanger}
          onChange={(event) => setImmediateDanger(event.target.checked)}
        />
        <span>
          <span className="block text-sm font-semibold text-navy">{t("immediateDangerLabel")}</span>
          <span className="block text-sm text-slate">{t("immediateDangerHelp")}</span>
        </span>
      </label>
      {immediateDanger && (
        <Alert tone="error" title={t("emergencyTitle")}>
          {t("emergencyBody")}
        </Alert>
      )}

      <div>
        <label htmlFor="safety-concerning" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("concerningLabel")}
        </label>
        <Input id="safety-concerning" name="concerning" maxLength={SAFETY_CONCERN_CONCERNING_MAX_LENGTH} placeholder={t("concerningPlaceholder")} />
      </div>

      <div>
        <label htmlFor="safety-description" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("descriptionLabel")}
        </label>
        <textarea
          id="safety-description"
          name="description"
          required
          minLength={SAFETY_CONCERN_DESCRIPTION_MIN_LENGTH}
          maxLength={SAFETY_CONCERN_DESCRIPTION_MAX_LENGTH}
          rows={7}
          placeholder={t("descriptionPlaceholder")}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-navy focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/20"
        />
        <p className="mt-1 text-xs text-slate">{t("descriptionHelp")}</p>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("sending") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
