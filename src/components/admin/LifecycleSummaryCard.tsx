import type { LifecycleJourneyState, LifecycleStatus } from "@/lib/lifecycle";
import type { LifecycleReminderStatus } from "@/generated/prisma/enums";
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

const REMINDER_STATUS_BADGE_VARIANT: Record<LifecycleReminderStatus, "mint" | "blue" | "outline" | "neutral"> = {
  PENDING: "neutral",
  PROCESSING: "neutral",
  SENT: "mint",
  FAILED_RETRYABLE: "outline",
  FAILED_FINAL: "outline",
  OBSOLETE: "outline",
  SUPPRESSED: "outline",
};

export interface LifecycleReminderRow {
  id: string;
  reminderNumber: number;
  status: LifecycleReminderStatus;
  relationship: "SELF" | "GUARDIAN";
  sentAt: Date | null;
  lastAttemptAt: Date | null;
  createdAt: Date;
  /** LIFECYCLE-1C — optional provider-truth summary (first/last
   * delivered/opened/clicked/bounced/complained), derived via
   * summarizeEmailEvents() from the append-only LifecycleEmailEvent
   * history. Omitted entirely for a caller that hasn't loaded events. */
  emailEvents?: {
    deliveredAt: Date | null;
    firstOpenedAt: Date | null;
    lastOpenedAt: Date | null;
    firstClickedAt: Date | null;
    lastClickedAt: Date | null;
    bouncedAt: Date | null;
    complainedAt: Date | null;
  };
}

/**
 * LIFECYCLE-1A Phase 12 / LIFECYCLE-1B Phase 13/18 — READ-ONLY admin
 * observability. No mutation path anywhere in this component: no "send
 * reminder"/"retry"/"send all" button, no bulk action, no manual status
 * edit — this only renders an already-computed LifecycleJourneyState
 * (src/lib/lifecycle) and, optionally, the already-persisted
 * LifecycleReminder rows for that same subject (src/services/
 * lifecycleReminders.ts). Reused identically across the Tutor/Parent/
 * Student admin detail pages so the three surfaces never drift into three
 * different presentations of the same underlying evaluator.
 */
export function LifecycleSummaryCard({
  state,
  t,
  locale,
  reminders,
}: {
  state: LifecycleJourneyState | null;
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: string;
  /** Most-recent-first LifecycleReminder rows for this subject, if the
   * caller loaded them (optional — LIFECYCLE-1A call sites predate the
   * reminder table and may omit this). */
  reminders?: LifecycleReminderRow[];
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
      {reminders && reminders.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-extrabold">{t("lifecycle.reminders.title")}</h3>
          <ul className="mt-3 space-y-2">
            {reminders.map((r) => (
              <li key={r.id} className="text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {t("lifecycle.reminders.reminderLabel", { number: r.reminderNumber })} ·{" "}
                    {t(`lifecycle.reminders.relationship.${r.relationship}`)}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={REMINDER_STATUS_BADGE_VARIANT[r.status]}>{t(`lifecycle.reminders.statuses.${r.status}`)}</Badge>
                    <span className="text-text-secondary">
                      {r.sentAt ? dateFormatter.format(r.sentAt) : r.lastAttemptAt ? dateFormatter.format(r.lastAttemptAt) : "—"}
                    </span>
                  </span>
                </div>
                {r.emailEvents && (
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <span>{t("lifecycle.reminders.events.delivered")}: {r.emailEvents.deliveredAt ? dateFormatter.format(r.emailEvents.deliveredAt) : "—"}</span>
                    <span>{t("lifecycle.reminders.events.opened")}: {r.emailEvents.lastOpenedAt ? dateFormatter.format(r.emailEvents.lastOpenedAt) : "—"}</span>
                    <span>{t("lifecycle.reminders.events.clicked")}: {r.emailEvents.lastClickedAt ? dateFormatter.format(r.emailEvents.lastClickedAt) : "—"}</span>
                    {r.emailEvents.bouncedAt && <span className="font-semibold text-error">{t("lifecycle.reminders.events.bounced")}: {dateFormatter.format(r.emailEvents.bouncedAt)}</span>}
                    {r.emailEvents.complainedAt && <span className="font-semibold text-error">{t("lifecycle.reminders.events.complained")}: {dateFormatter.format(r.emailEvents.complainedAt)}</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Surface>
  );
}
