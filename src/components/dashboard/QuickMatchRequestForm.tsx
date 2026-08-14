"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui/Input";
import { createTutoringRequestAction } from "@/lib/actions/tutoringRequests";

export interface QuickMatchOption {
  id: string;
  label: string;
}

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

export function QuickMatchRequestForm({ subjects, levels }: { subjects: QuickMatchOption[]; levels: QuickMatchOption[] }) {
  const t = useTranslations("quickMatch");
  const [state, formAction, pending] = useActionState(createTutoringRequestAction, undefined);
  const [tutoringMode, setTutoringMode] = useState<"ONLINE" | "IN_PERSON" | "BOTH">("ONLINE");
  const requiresAddress = tutoringMode !== "ONLINE";

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6">
      {state && !state.success && state.error && (
        <p role="alert" className="rounded-md bg-error-light px-3 py-2 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="subjectId" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("form.subjectLabel")}
        </label>
        <Select id="subjectId" name="subjectId" required defaultValue={subjects[0]?.id ?? ""}>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label htmlFor="academicLevelId" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("form.levelLabel")}
        </label>
        <Select id="academicLevelId" name="academicLevelId" defaultValue="">
          <option value="">{t("form.anyLevel")}</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label htmlFor="tutoringMode" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("form.modeLabel")}
        </label>
        <Select
          id="tutoringMode"
          name="tutoringMode"
          value={tutoringMode}
          onChange={(e) => setTutoringMode(e.target.value as "ONLINE" | "IN_PERSON" | "BOTH")}
        >
          <option value="ONLINE">{t("form.modeOnline")}</option>
          <option value="IN_PERSON">{t("form.modeInPerson")}</option>
          <option value="BOTH">{t("form.modeBoth")}</option>
        </Select>
      </div>

      <div>
        <label htmlFor="durationMinutes" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("form.durationLabel")}
        </label>
        <Select id="durationMinutes" name="durationMinutes" defaultValue="60">
          {DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t("form.durationOption", { minutes })}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label htmlFor="requestedStartAt" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("form.startAtLabel")}
        </label>
        <Input id="requestedStartAt" name="requestedStartAt" type="datetime-local" required data-testid="requested-start-at" />
      </div>

      {requiresAddress && (
        <div className="flex flex-col gap-3 rounded-md border border-neutral-200 bg-off-white p-4">
          <p className="text-sm font-semibold text-navy">{t("form.addressTitle")}</p>
          <Input name="addressLine1" placeholder={t("form.addressLine1Placeholder")} required data-testid="address-line1" />
          <Input name="addressLine2" placeholder={t("form.addressLine2Placeholder")} />
          <div className="grid grid-cols-2 gap-3">
            <Input name="city" placeholder={t("form.cityPlaceholder")} required data-testid="address-city" />
            <Input name="province" placeholder={t("form.provincePlaceholder")} required />
          </div>
          <Input name="postalCode" placeholder={t("form.postalCodePlaceholder")} required />
        </div>
      )}

      <div>
        <label htmlFor="notes" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("form.notesLabel")}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="w-full rounded-md border border-neutral-300 bg-white px-4 py-3 text-[15px] text-navy outline-none transition-colors focus:border-blue"
          placeholder={t("form.notesPlaceholder")}
        />
      </div>

      <button
        type="submit"
        data-testid="get-price"
        disabled={pending}
        className="h-12 w-full rounded-md bg-blue text-[15px] font-bold text-white transition-colors hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t("form.submitting") : t("form.submitCta")}
      </button>
    </form>
  );
}
