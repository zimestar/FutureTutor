"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TIMEZONE_OPTIONS } from "@/schemas/tutorAvailability";
import { saveTutorAvailabilityAction } from "@/lib/actions/tutorAvailability";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export interface TutorAvailabilityFormValues {
  timezone: (typeof TIMEZONE_OPTIONS)[number];
  days: { enabled: boolean; startTime: string; endTime: string }[];
}

export function TutorAvailabilityForm({ values }: { values: TutorAvailabilityFormValues }) {
  const t = useTranslations("tutorAvailability");
  const [state, formAction, pending] = useActionState(saveTutorAvailabilityAction, undefined);

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

      <div className="max-w-xs">
        <label htmlFor="timezone" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("timezoneLabel")}
        </label>
        <Select id="timezone" name="timezone" defaultValue={values.timezone} required>
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>
              {t(`timezones.${tz}`)}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {DAY_KEYS.map((dayKey, i) => {
          const day = values.days[i];
          return (
            <div key={dayKey} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <label className="flex w-32 shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold text-navy">
                <input type="checkbox" name={`day-${i}-enabled`} defaultChecked={day.enabled} className="h-4 w-4" />
                {t(`days.${dayKey}`)}
              </label>
              <Input
                type="time"
                name={`day-${i}-startTime`}
                defaultValue={day.startTime}
                className="w-36"
              />
              <span className="text-sm text-slate">{t("to")}</span>
              <Input type="time" name={`day-${i}-endTime`} defaultValue={day.endTime} className="w-36" />
            </div>
          );
        })}
      </div>

      <div className="border-t border-neutral-200 pt-6">
        <Button type="submit" data-testid="save-availability" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
