"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { submitPlatformExamAction } from "@/lib/actions/tutorExam";
import type { ExamQuestion } from "@/lib/exam/examQuestions";

export function TutorExamForm({ questions }: { questions: ExamQuestion[] }) {
  const t = useTranslations("tutorExam");
  const [state, formAction, pending] = useActionState(submitPlatformExamAction, undefined);

  if (state?.success) {
    return (
      <div
        className={`rounded-md px-4 py-3 text-sm font-semibold ${
          state.passed ? "bg-success-light text-success" : "bg-error-light text-error"
        }`}
      >
        {state.passed ? t("passed", { score: state.score ?? 0 }) : t("failed", { score: state.score ?? 0 })}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="startedAt" value={new Date().toISOString()} />
      {state?.error && (
        <p role="alert" className="rounded-md bg-error-light px-4 py-3 text-sm font-semibold text-error">
          {state.error}
        </p>
      )}
      {questions.map((question, i) => (
        <fieldset key={question.id} className="rounded-lg border border-neutral-200 p-4">
          <legend className="px-1 text-sm font-semibold text-navy">
            {i + 1}. {question.text}
          </legend>
          <div className="mt-3 flex flex-col gap-2">
            {question.options.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-start gap-2 text-sm text-navy">
                <input
                  type="radio"
                  name={`answer-${question.id}`}
                  value={option.id}
                  required
                  className="mt-1"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <Button type="submit" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
