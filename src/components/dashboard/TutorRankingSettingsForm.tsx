"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveTutorRankingSettingsAction } from "@/lib/actions/quickMatchAdmin";

export interface TutorRankingSettingsValues {
  responseWindowMinutes: number;
  sequentialInvitationCount: number;
  parallelBatchSize: number;
  maxDispatchAttempts: number;
  tutorScoreWeight: number;
  bookingReliabilityWeight: number;
  invitationResponsivenessWeight: number;
  tutorTierWeight: number;
  minInvitationsForReliabilityData: number;
  rankingVersion: string;
}

const NUMBER_FIELDS: { name: keyof TutorRankingSettingsValues; step?: string }[] = [
  { name: "responseWindowMinutes" }, { name: "sequentialInvitationCount" }, { name: "parallelBatchSize" }, { name: "maxDispatchAttempts" }, { name: "tutorScoreWeight", step: "0.01" }, { name: "bookingReliabilityWeight", step: "0.01" }, { name: "invitationResponsivenessWeight", step: "0.01" }, { name: "tutorTierWeight", step: "0.01" }, { name: "minInvitationsForReliabilityData" },
];

export function TutorRankingSettingsForm({ values }: { values: TutorRankingSettingsValues }) {
  const t = useTranslations("admin.quickMatch");
  const [state, formAction, pending] = useActionState(saveTutorRankingSettingsAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-3">
      {state?.error && <p className="col-span-full text-sm font-semibold text-error">{state.error}</p>}
      {state?.success && <p className="col-span-full text-sm font-semibold text-success">{t("saved")}</p>}
      {NUMBER_FIELDS.map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name} className="mb-1 block text-xs font-semibold text-slate">
            {t(`fields.${field.name}`)}
          </label>
          <Input
            id={field.name}
            name={field.name}
            type="number"
            step={field.step}
            defaultValue={values[field.name]}
            required
          />
        </div>
      ))}
      <div>
        <label htmlFor="rankingVersion" className="mb-1 block text-xs font-semibold text-slate">
          {t("rankingVersion")}
        </label>
        <Input id="rankingVersion" name="rankingVersion" defaultValue={values.rankingVersion} required />
      </div>
      <Button type="submit" size="sm" disabled={pending} className="sm:col-span-3">
        {t("saveSettings")}
      </Button>
    </form>
  );
}
