"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
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
  // Immediate, transient feedback that the save itself succeeded — the
  // persistent completed-state summary (AdminInterviewSection, driven by
  // fresh server data after revalidatePath) is the durable signal a
  // returning admin sees; this local message is just the instant ack.
  const [justSaved, setJustSaved] = useState(false);

  return (
    <form
      action={(formData) => {
        setJustSaved(false);
        startTransition(async () => {
          await saveInterviewRubricAction(tutorInterviewId, formData);
          setJustSaved(true);
        });
      }}
      className="flex flex-col gap-4"
    >
      {justSaved && !pending && (
        <p role="status" className="rounded-md bg-success-light px-4 py-3 text-sm font-semibold text-success">
          {t("saveSuccess")}
        </p>
      )}
      {CRITERIA.map((criterion) => (
        <div key={criterion} className="rounded-lg border border-neutral-200 p-3">
          <p className="mb-2 text-sm font-semibold text-navy">{t(`criteria.${criterion}`)}</p>
          <div className="flex items-center gap-4">
            <Select
              name={`criterion-${criterion}-score`}
              defaultValue={existingScores[criterion]?.score ?? ""}
              className="h-10 text-sm"
              containerClassName="w-auto"
            >
              <option value="" disabled>
                {t("selectScore")}
              </option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
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
