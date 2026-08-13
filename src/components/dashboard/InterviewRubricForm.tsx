"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { saveInterviewRubricAction } from "@/lib/actions/tutorInterview";

const CRITERIA = [
  "COMMUNICATION",
  "PEDAGOGY",
  "PROFESSIONALISM",
  "SUBJECT_CONFIDENCE",
  "STUDENT_INTERACTION",
  "MOTIVATION_ALIGNMENT",
] as const;

export function InterviewRubricForm({
  tutorInterviewId,
  existingScores,
}: {
  tutorInterviewId: string;
  existingScores: Record<string, { score: number; notes: string | null }>;
}) {
  const t = useTranslations("admin.tutorDetail.interview");
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => saveInterviewRubricAction(tutorInterviewId, formData))}
      className="flex flex-col gap-4"
    >
      {CRITERIA.map((criterion) => (
        <div key={criterion} className="rounded-lg border border-neutral-200 p-3">
          <p className="mb-2 text-sm font-semibold text-navy">{t(`criteria.${criterion}`)}</p>
          <div className="flex items-center gap-4">
            <select
              name={`criterion-${criterion}-score`}
              defaultValue={existingScores[criterion]?.score ?? ""}
              className="h-10 rounded-md border border-neutral-300 px-2 text-sm"
            >
              <option value="" disabled>
                {t("selectScore")}
              </option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input
              type="text"
              name={`criterion-${criterion}-notes`}
              defaultValue={existingScores[criterion]?.notes ?? ""}
              placeholder={t("notesPlaceholder")}
              className="h-10 flex-1 rounded-md border border-neutral-300 px-3 text-sm"
            />
          </div>
        </div>
      ))}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("saving") : t("saveRubric")}
      </Button>
    </form>
  );
}
