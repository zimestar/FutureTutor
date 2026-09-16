import type { LifecycleJourneyState, LifecycleStatus } from "@/lib/lifecycle";
import { Surface } from "@/components/ui/Surface";
import { Badge } from "@/components/ui/Badge";

const STATUS_BADGE_VARIANT: Record<LifecycleStatus, "mint" | "blue" | "outline" | "neutral"> = {
  USER_ACTION_REQUIRED: "blue",
  WAITING_ON_FUTURETUTOR: "neutral",
  WAITING_ON_ADMIN: "neutral",
  WAITING_ON_GUARDIAN: "neutral",
  COMPLETED: "mint",
  REJECTED: "outline",
  SUSPENDED: "outline",
  INELIGIBLE: "outline",
  UNKNOWN: "outline",
};

/**
 * LIFECYCLE-1A Phase 12 — READ-ONLY admin observability. No mutation path:
 * no "send reminder" button, no bulk action, no state edit — this only
 * renders an already-computed LifecycleJourneyState (src/lib/lifecycle).
 * Reused identically across the Tutor/Parent/Student admin detail pages so
 * the three surfaces never drift into three different presentations of the
 * same underlying evaluator.
 */
export function LifecycleSummaryCard({
  state,
  t,
  locale,
}: {
  state: LifecycleJourneyState | null;
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: string;
}) {
  if (!state) {
    return (
      <Surface className="mt-5">
        <h2 className="font-extrabold">{t("lifecycle.title")}</h2>
        <p className="mt-3 text-sm text-text-secondary">{t("lifecycle.unavailable")}</p>
      </Surface>
    );
  }

  const inactiveDays = state.inactiveDurationMs !== null ? Math.floor(state.inactiveDurationMs / (24 * 60 * 60 * 1000)) : null;
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <Surface className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-extrabold">{t("lifecycle.title")}</h2>
        <Badge variant={STATUS_BADGE_VARIANT[state.status]}>{t(`lifecycle.statuses.${state.status}`)}</Badge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold">{t("lifecycle.stage")}</dt>
          <dd>{state.stage}</dd>
        </div>
        <div>
          <dt className="font-bold">{t("lifecycle.nextAction")}</dt>
          <dd>{state.nextAction ?? t("lifecycle.noNextAction")}</dd>
        </div>
        <div>
          <dt className="font-bold">{t("lifecycle.lastMeaningfulProgress")}</dt>
          <dd>{state.lastMeaningfulProgressAt ? dateFormatter.format(state.lastMeaningfulProgressAt) : "—"}</dd>
        </div>
        <div>
          <dt className="font-bold">
            {inactiveDays !== null && inactiveDays >= 1 ? t("lifecycle.inactiveForDays", { days: inactiveDays }) : t("lifecycle.inactiveForLessThanADay")}
          </dt>
          <dd>
            <Badge variant={state.reminderEligible ? "blue" : "neutral"}>
              {t(state.reminderEligible ? "lifecycle.reminderEligible" : "lifecycle.reminderNotEligible")}
            </Badge>
          </dd>
        </div>
        {state.suppressionReason && (
          <div className="sm:col-span-2">
            <dt className="font-bold">{t("lifecycle.suppressionReason")}</dt>
            <dd>{t(`lifecycle.suppressionReasons.${state.suppressionReason}`)}</dd>
          </div>
        )}
      </dl>
    </Surface>
  );
}
