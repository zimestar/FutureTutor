"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui/Input";
import { createTutoringRequestAction } from "@/lib/actions/tutoringRequests";
import { LocationForm, TutoringModeSelector, type RequestTutoringMode } from "@/components/dashboard/InPersonTutoringLocation";
import { resolveInitialAcademicLevel } from "@/lib/pricingLevelSelection";

export interface QuickMatchOption {
  id: string;
  label: string;
}

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

/** Phase H.7 — `studentProfileId` is the server-resolved, already-
 * authorized learner for this request (see dashboard/quick-match/page.tsx:
 * for a Student it's always their own profile; for a Parent it's whichever
 * child the page-level selector currently has selected). Passed as a fixed
 * hidden field, not chosen inside this form — the learner selector, when
 * there is more than one eligible child, lives at the page level (a link
 * per child, matching §56's explicit non-inference requirement), so the
 * whole page (including any in-flight request status) stays scoped to one
 * explicit child at a time rather than this form silently re-targeting a
 * different learner than what the rest of the page is showing. */
export function QuickMatchRequestForm({
  subjects,
  levels,
  studentProfileId,
  initialAcademicLevelId = null,
  betaOnlineOnly = false,
}: {
  subjects: QuickMatchOption[];
  levels: QuickMatchOption[];
  studentProfileId: string;
  /** BETA-PRICINGFIX1 — the learner's own canonical academic level
   * (StudentProfile.academicLevelId), resolved server-side by the caller
   * (dashboard/quick-match/page.tsx, from the already-authorized
   * `selectedStudent`). Used to preselect the level field instead of
   * defaulting to an unpriced "Any level" state — see
   * FutureTutor_BETA_PRICINGGAP_AUDIT1_REPORT.md. Not a second source of
   * truth: read once from the same StudentProfile row the page already
   * resolved, never re-derived here. */
  initialAcademicLevelId?: string | null;
  /** BETA-HARDEN1 — computed server-side via closedBetaOnlineOnlyActive().
   * When true, the mode selector never offers IN_PERSON, so the location
   * fields it would otherwise reveal are unreachable through this form. */
  betaOnlineOnly?: boolean;
}) {
  const t = useTranslations("quickMatch");
  const [state, formAction, pending] = useActionState(createTutoringRequestAction, undefined);
  const [tutoringMode, setTutoringMode] = useState<RequestTutoringMode>("ONLINE");
  const defaultAcademicLevelId = resolveInitialAcademicLevel(initialAcademicLevelId, levels);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6">
      <input type="hidden" name="studentProfileId" value={studentProfileId} />
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
        <Select id="academicLevelId" name="academicLevelId" required defaultValue={defaultAcademicLevelId}>
          {/* BETA-PRICINGFIX1 — a real, priceable level must be chosen
              explicitly; this placeholder is never itself a valid, submittable
              selection (native `required` + the server-side schema both
              reject it — see src/schemas/tutoringRequest.ts). */}
          <option value="" disabled>
            {t("form.selectLevelPlaceholder")}
          </option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label}
            </option>
          ))}
        </Select>
      </div>

      <TutoringModeSelector value={tutoringMode} onChange={setTutoringMode} betaOnlineOnly={betaOnlineOnly} />

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

      {tutoringMode === "IN_PERSON" && <LocationForm />}

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
