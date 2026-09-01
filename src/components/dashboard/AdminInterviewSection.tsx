"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InterviewRubricForm } from "@/components/dashboard/InterviewRubricForm";
import { scheduleInterviewAction } from "@/lib/actions/tutorInterview";
import type { TutorInterviewCriterion, TutorInterviewStatus } from "@/generated/prisma/enums";

const CRITERIA: TutorInterviewCriterion[] = [
  "COMMUNICATION",
  "PEDAGOGY",
  "PROFESSIONALISM",
  "SUBJECT_CONFIDENCE",
  "STUDENT_INTERACTION",
  "MOTIVATION_ALIGNMENT",
];
export const MAX_SCORE_PER_CRITERION = 5;

export interface AdminInterviewSectionInterview {
  id: string;
  // ISO strings — serialized by the Server Component caller, never raw Date
  // objects across the client/server boundary.
  scheduledAt: string | null;
  completedAt: string | null;
  status: TutorInterviewStatus;
  evaluations: { criterion: TutorInterviewCriterion; score: number; notes: string | null }[];
}

export interface AdminInterviewSectionProps {
  tutorProfileId: string;
  /** Mirrors the page's existing gate: status === "INTERVIEW_REQUIRED" || an interview already exists. */
  showInitial: boolean;
  interview: AdminInterviewSectionInterview | null;
  locale: string;
}

/**
 * PROD-TUTOR1 — presentation-only fix. Before this component existed, the
 * Interview section always rendered the same editable 6-criteria form
 * regardless of TutorInterview.status, so a genuinely successful
 * "Save rubric" (which DOES correctly persist scores and, once all 6 are
 * present, transition the interview to COMPLETED and the tutor's
 * applicationStatus onward — verified directly against production data,
 * no backend defect) looked identical to an untouched form. This component
 * makes that real, already-correct backend state visible.
 */
export function AdminInterviewSection({ tutorProfileId, showInitial, interview, locale }: AdminInterviewSectionProps) {
  const t = useTranslations("admin.tutorDetail");
  const [editing, setEditing] = useState(false);

  if (!showInitial) {
    return <p className="text-sm text-slate">{t("interviewNotYet")}</p>;
  }

  const isCompleted = interview?.status === "COMPLETED";
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  if (interview && isCompleted && !editing) {
    const evaluationByCriterion = Object.fromEntries(interview.evaluations.map((e) => [e.criterion, e]));
    const totalScore = interview.evaluations.reduce((sum, e) => sum + e.score, 0);
    const maxScore = CRITERIA.length * MAX_SCORE_PER_CRITERION;

    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="mint">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t("interview.completedBadge")}
          </Badge>
          <p className="text-sm font-semibold text-navy">{t("interview.completedMessage")}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          {interview.completedAt && (
            <p className="text-sm text-slate">{t("interview.completedOn", { date: dateFormatter.format(new Date(interview.completedAt)) })}</p>
          )}
          <p className="text-xl font-extrabold text-navy">{t("interview.finalScore", { score: totalScore, max: maxScore })}</p>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {CRITERIA.map((criterion) => {
            const evaluation = evaluationByCriterion[criterion];
            return (
              <div key={criterion} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-neutral-200 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy">{t(`interview.criteria.${criterion}`)}</p>
                  {evaluation?.notes && <p className="mt-1 text-sm text-slate">{evaluation.notes}</p>}
                </div>
                <span className="shrink-0 text-sm font-semibold text-navy">
                  {t("interview.criterionScore", { score: evaluation?.score ?? 0, max: MAX_SCORE_PER_CRITERION })}
                </span>
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setEditing(true)}
        >
          {t("interview.editInterview")}
        </Button>
      </div>
    );
  }

  // Not yet completed (nothing scheduled, scheduled-but-not-done), or an
  // admin has explicitly opted into editing an already-completed interview.
  // The schedule/reschedule control is deliberately never shown once
  // completed, even in edit mode — rescheduling would reset
  // TutorInterview.status back to SCHEDULED, which is a real state change
  // this presentation-only pass does not introduce a UI path to invoke by
  // accident. The interview date remains visible as plain metadata instead.
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      {isCompleted && interview?.completedAt && (
        <p className="mb-3 text-sm text-slate">{t("interview.completedOn", { date: dateFormatter.format(new Date(interview.completedAt)) })}</p>
      )}
      {!isCompleted && (
        <>
          {interview?.scheduledAt && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t(`interview.status.${interview.status}`)}</Badge>
              <p className="text-sm text-slate">{dateFormatter.format(new Date(interview.scheduledAt))}</p>
            </div>
          )}
          <form action={scheduleInterviewAction.bind(null, tutorProfileId)} className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              name="scheduledAt"
              defaultValue={interview?.scheduledAt ? interview.scheduledAt.slice(0, 16) : undefined}
              className="h-9 rounded-md border border-neutral-300 px-2 text-sm"
            />
            <Button type="submit" variant="outline" size="sm">
              {t(interview?.scheduledAt ? "interview.rescheduleInterview" : "scheduleInterview")}
            </Button>
          </form>
        </>
      )}
      {interview && (
        <div className="mt-4">
          <InterviewRubricForm
            tutorInterviewId={interview.id}
            existingScores={Object.fromEntries(interview.evaluations.map((e) => [e.criterion, { score: e.score, notes: e.notes }]))}
          />
          {isCompleted && (
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setEditing(false)}>
              {t("interview.cancelEdit")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
