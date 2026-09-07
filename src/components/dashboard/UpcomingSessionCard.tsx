import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";

/**
 * STUDENT-PARENT-DASHBOARD-UPCOMING1 — a single upcoming-session card,
 * shared between the Student and Parent dashboard home pages (which
 * discover a different, server-authorized set of bookings but present them
 * identically). A pure, server-renderable presentational component: every
 * string here has already been resolved (translated, timezone-formatted,
 * interpolated) by the page that renders it — this component makes no
 * authorization, translation, or data-fetching decision of its own, exactly
 * mirroring this codebase's established "server resolves, component
 * displays" convention (see MessageThread.tsx's MessageDto for the same
 * shape of contract).
 *
 * `viewSessionHref` links into the existing, server-authorized
 * `/session/[bookingId]` route — that page's own getSessionContext is what
 * actually decides whether classroom entry is available right now (T-15
 * window, etc.); this component never reproduces or approximates that
 * logic, it only ever offers a link into the one place that's authoritative
 * for it.
 */
export interface UpcomingSessionCardData {
  bookingId: string;
  subjectLabel: string;
  /** Already-interpolated "with {tutor}" string. */
  withTutorText: string;
  /** Already-interpolated "For {student}" string — null when the viewer is
   * the student themself and no separate learner-attribution line is
   * needed (Student dashboard); non-null in Parent context. */
  forLearnerText: string | null;
  /** Already timezone-formatted via formatBookingTime — never a raw UTC
   * string, never formatted again by this component. */
  whenLabel: string;
  modeLabel: string;
  isNext: boolean;
  nextSessionLabel: string;
  /** Null only in the defensive case where a CONFIRMED booking somehow has
   * no linked Session_ row yet — every real booking created by this
   * codebase's own booking-creation flow has one. */
  viewSessionHref: string | null;
  viewSessionLabel: string;
  messageTutorHref: string;
  messageTutorLabel: string;
}

export function UpcomingSessionCard({
  bookingId,
  subjectLabel,
  withTutorText,
  forLearnerText,
  whenLabel,
  modeLabel,
  isNext,
  nextSessionLabel,
  viewSessionHref,
  viewSessionLabel,
  messageTutorHref,
  messageTutorLabel,
}: UpcomingSessionCardData) {
  return (
    <Surface aria-labelledby={`upcoming-session-subject-${bookingId}`} data-testid="upcoming-session-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {isNext && (
            <p className="text-xs font-extrabold uppercase tracking-wide text-blue" data-testid="next-session-label">
              {nextSessionLabel}
            </p>
          )}
          <p id={`upcoming-session-subject-${bookingId}`} className="mt-1 truncate text-lg font-extrabold text-text-primary">
            {subjectLabel}
          </p>
          <p className="mt-1 text-sm text-text-secondary">{withTutorText}</p>
          {forLearnerText && (
            <p className="mt-0.5 text-xs font-semibold text-text-muted" data-testid="upcoming-session-learner">
              {forLearnerText}
            </p>
          )}
        </div>
        <Badge variant="neutral" className="shrink-0" data-testid="upcoming-session-mode">
          {modeLabel}
        </Badge>
      </div>
      <p className="mt-3 break-words text-sm font-semibold text-text-primary">{whenLabel}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {viewSessionHref && (
          <Button href={viewSessionHref} variant="outline" size="sm" data-testid="upcoming-session-view-cta">
            {viewSessionLabel}
          </Button>
        )}
        <Button href={messageTutorHref} variant="ghost" size="sm" data-testid="upcoming-session-message-cta">
          {messageTutorLabel}
        </Button>
      </div>
    </Surface>
  );
}
