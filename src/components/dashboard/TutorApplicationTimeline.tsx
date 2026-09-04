/**
 * PROD-TUTOR-APPLICATION-NOTIFICATIONS1 — a read-only history view over
 * the same TutorApplicationNotification rows the notification outbox
 * already creates (src/services/tutorApplicationNotifications.ts). Not a
 * second source of truth: this renders past events, it never drives or
 * duplicates applicationStatus itself (that stays exactly
 * tutorApplicationWorkflow.ts's job).
 */
export interface TutorApplicationTimelineItem {
  id: string;
  label: string;
  dateLabel: string;
}

export function TutorApplicationTimeline({
  title,
  items,
}: {
  title: string;
  items: TutorApplicationTimelineItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="tutor-application-timeline-title">
      <h2 id="tutor-application-timeline-title" className="text-lg font-extrabold text-text-primary">
        {title}
      </h2>
      <ol className="mt-4 space-y-3 border-l-2 border-border pl-4">
        {items.map((item) => (
          <li key={item.id} className="relative">
            <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-blue" aria-hidden="true" />
            <p className="font-semibold text-text-primary">{item.label}</p>
            <p className="text-xs text-text-muted">{item.dateLabel}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
