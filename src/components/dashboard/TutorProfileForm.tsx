"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { subjects } from "@/content/subjects";
import { updateTutorProfileAction } from "@/lib/actions/tutorProfile";
import type { TutorApplicationStatus } from "@/generated/prisma/enums";

const levelSlugs = [
  "elementary",
  "middleSchool",
  "highSchool",
  "cegepCollege",
  "university",
  "adultLearner",
] as const;

const languageOptions = ["en", "fr"] as const;

export interface TutorProfileFormValues {
  headline: string;
  bio: string;
  subjectSlugs: string[];
  levelSlugs: string[];
  languages: string[];
  yearsExperience: number | "";
  city: string;
  province: string;
  learningMode: "ONLINE" | "IN_PERSON" | "BOTH" | "";
}

function CheckboxGroup({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-navy has-[:checked]:border-blue has-[:checked]:bg-blue/5 has-[:checked]:text-blue"
        >
          <input
            type="checkbox"
            name={name}
            value={option.value}
            defaultChecked={defaultValue.includes(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function TutorProfileForm({
  values,
  applicationStatus,
}: {
  values: TutorProfileFormValues;
  applicationStatus: TutorApplicationStatus;
}) {
  const t = useTranslations("tutorProfileForm");
  const tSubjects = useTranslations("subjects.items");
  const tLevels = useTranslations("gradeLevels");
  const tLanguages = useTranslations("languages");
  const tMode = useTranslations("tutorCard.mode");
  const tStatus = useTranslations("dashboard.tutor.applicationStatus");
  const [state, formAction, pending] = useActionState(updateTutorProfileAction, undefined);

  const canSubmit = applicationStatus === "DRAFT";

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

      <div>
        <label htmlFor="headline" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("headlineLabel")}
        </label>
        <Input id="headline" name="headline" defaultValue={values.headline} maxLength={120} required />
      </div>

      <div>
        <label htmlFor="bio" className="mb-1.5 block text-sm font-semibold text-navy">
          {t("bioLabel")}
        </label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={values.bio}
          rows={5}
          maxLength={2000}
          required
          className="w-full rounded-md border border-neutral-300 bg-white px-4 py-3 text-[15px] text-navy outline-none transition-colors focus:border-blue"
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-navy">{t("subjectsLabel")}</p>
        <CheckboxGroup
          name="subjectSlugs"
          defaultValue={values.subjectSlugs}
          options={subjects.map((s) => ({ value: s.slug, label: tSubjects(s.slug) }))}
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-navy">{t("levelsLabel")}</p>
        <CheckboxGroup
          name="levelSlugs"
          defaultValue={values.levelSlugs}
          options={levelSlugs.map((slug) => ({ value: slug, label: tLevels(slug) }))}
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-navy">{t("languagesLabel")}</p>
        <CheckboxGroup
          name="languages"
          defaultValue={values.languages}
          options={languageOptions.map((lang) => ({ value: lang, label: tLanguages(lang) }))}
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-navy">{t("modeLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {(["ONLINE", "IN_PERSON", "BOTH"] as const).map((mode) => (
            <label
              key={mode}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-navy has-[:checked]:border-blue has-[:checked]:bg-blue/5 has-[:checked]:text-blue"
            >
              <input
                type="radio"
                name="learningMode"
                value={mode}
                defaultChecked={values.learningMode === mode}
                required
                className="sr-only"
              />
              {tMode(mode === "ONLINE" ? "online" : mode === "IN_PERSON" ? "in-person" : "both")}
            </label>
          ))}
        </div>
      </div>

      <p className="rounded-md bg-blue/5 px-4 py-3 text-sm text-slate">{t("pricingNote")}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="yearsExperience" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("experienceLabel")}
          </label>
          <Input
            id="yearsExperience"
            name="yearsExperience"
            type="number"
            min={0}
            max={60}
            defaultValue={values.yearsExperience}
            required
          />
        </div>
        <div>
          <label htmlFor="city" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("cityLabel")}
          </label>
          <Input id="city" name="city" defaultValue={values.city} required />
        </div>
        <div>
          <label htmlFor="province" className="mb-1.5 block text-sm font-semibold text-navy">
            {t("provinceLabel")}
          </label>
          <Input id="province" name="province" defaultValue={values.province} required />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-6">
        <Button type="submit" name="intent" value="save" variant="outline" disabled={pending}>
          {t("saveDraft")}
        </Button>
        {canSubmit ? (
          <Button type="submit" name="intent" value="submit" disabled={pending}>
            {t("submitForReview")}
          </Button>
        ) : (
          <Badge variant={applicationStatus === "APPROVED" ? "mint" : "outline"}>
            {tStatus(applicationStatus)}
          </Badge>
        )}
      </div>
    </form>
  );
}
