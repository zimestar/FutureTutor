"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { acknowledgeTrainingModuleAction } from "@/lib/actions/tutorTraining";

export function TrainingModuleCard({
  moduleId,
  title,
  description,
  durationMinutes,
  completed,
}: {
  moduleId: string;
  title: string;
  description: string;
  durationMinutes: number | null;
  completed: boolean;
}) {
  const t = useTranslations("tutorTraining");
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <p className="font-semibold text-navy">{title}</p>
      {durationMinutes && <p className="mt-1 text-xs text-slate">{t("duration", { minutes: durationMinutes })}</p>}
      <p className="mt-2 text-sm text-slate">{description}</p>
      <div className="mt-4">
        {completed ? (
          <span className="text-sm font-semibold text-success">{t("completed")}</span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => startTransition(() => acknowledgeTrainingModuleAction(moduleId))}
          >
            {pending ? t("acknowledging") : t("acknowledge")}
          </Button>
        )}
      </div>
    </div>
  );
}
