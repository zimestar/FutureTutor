import { Check, Circle, Clock3, LockKeyhole, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { TutorJourneyState, TutorJourneyStep } from "@/lib/tutorExperience";

const stateIcons = {
  complete: Check,
  current: Clock3,
  pending: Circle,
  blocked: LockKeyhole,
  needsAction: TriangleAlert,
};

const stateStyles: Record<TutorJourneyState, string> = {
  complete: "border-success/30 bg-success-light text-success",
  current: "border-blue/25 bg-blue/5 text-blue",
  pending: "border-border bg-surface-subtle text-text-muted",
  blocked: "border-border-strong bg-neutral-100 text-text-secondary",
  needsAction: "border-warning/35 bg-warning-light text-neutral-800",
};

export interface TutorApprovalJourneyItem {
  id: TutorJourneyStep;
  label: string;
  description: string;
  state: TutorJourneyState;
  stateLabel: string;
  action?: { href: string; label: string };
}

export function TutorApprovalJourney({
  title,
  label,
  items,
}: {
  title: string;
  label: string;
  items: TutorApprovalJourneyItem[];
}) {
  return (
    <section aria-labelledby="tutor-approval-journey-title">
      <h2 id="tutor-approval-journey-title" className="text-lg font-extrabold text-text-primary">
        {title}
      </h2>
      <ol aria-label={label} className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map((item) => {
          const Icon = stateIcons[item.state];
          const isCurrent = item.state === "current" || item.state === "needsAction";
          return (
            <li
              key={item.id}
              aria-current={isCurrent ? "step" : undefined}
              className={cn("rounded-lg border p-4", stateStyles[item.state])}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-current/25 bg-white/70">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-text-primary">{item.label}</h3>
                    <span className="text-xs font-bold uppercase tracking-[0.08em]">{item.stateLabel}</span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">{item.description}</p>
                  {item.action && (
                    <Button href={item.action.href} size="sm" variant="outline" className="mt-3">
                      {item.action.label}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
