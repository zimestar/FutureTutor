import "server-only";
import { createEmailTranslator, resolveEmailLocale } from "@/lib/email/emailTranslation";
import { renderEmailShell, type EmailRow } from "@/lib/email/emailShell";
import { getTutorExperience } from "@/lib/tutorExperience";
import type { TutorApplicationNotificationEvent, TutorApplicationStatus } from "@/generated/prisma/enums";

/**
 * PROD-TUTOR-APPLICATION-NOTIFICATIONS1 — locale-aware tutor-application-
 * lifecycle email copy. One generalized template (not 18 bespoke ones) —
 * every event shares the same shell/structure (greeting, admin-attribution
 * line, what-changed intro, current-stage row, action-required/next-step
 * row, CTA) and differs only in translated subject/heading/intro text
 * (namespace "tutorApplicationEmail.events.<EVENT>") plus a small amount
 * of event-specific detail (which document, what reason, when the
 * interview is). Mirrors bookingConfirmationEmailContent.ts's shape:
 * request-independent translation via emailTranslation.ts, the shared
 * emailShell.ts HTML shell, an explicit `locale` param, pure functions
 * over an already-resolved context.
 *
 * Stage label and "what happens next" text are deliberately NOT
 * duplicated here — they're read from the same
 * dashboard.tutor.applicationStatus / dashboard.tutor.experience.states
 * namespaces the tutor's own dashboard already renders (src/lib/
 * tutorExperience.ts), so the email can never say something inconsistent
 * with what the tutor sees when they log in. APPROVED has no `whatNext`
 * entry there (the dashboard shows a different, "welcome back" view once
 * approved) — that one case gets its own translated next-step line
 * ("tutorApplicationEmail.approvedNextStep"), deliberately not claiming
 * bookings are receivable if a further operational gate (e.g. Stripe
 * Connect) still applies — see that message's own text.
 *
 * "Action required" is derived from getTutorExperience(status)
 * .responsibleParty === "tutor" — the exact same signal the dashboard
 * already uses to decide whether to show a call-to-action button, reused
 * rather than re-invented.
 */

export interface TutorApplicationEmailContext {
  locale: string;
  tutorFirstName: string;
  event: TutorApplicationNotificationEvent;
  /** The tutor's applicationStatus at the moment this event was recorded
   * — frozen in the notification row's contextSnapshot, never re-read
   * live, so the email always reflects the event as it actually happened. */
  applicationStatus: TutorApplicationStatus;
  /** Event-specific extra fields, only ever a small closed set per event
   * (documentType, reason, scheduledAtIso, score) — see
   * tutorApplicationNotifications.ts for exactly what each event stamps
   * in. Never internal admin notes, reviewer comments, or score
   * breakdowns (see this module's own escaping — everything here is
   * treated as untrusted display text regardless). */
  detail: Record<string, string | number>;
  dashboardUrl: string;
}

export interface TutorApplicationEmailContent {
  subject: string;
  html: string;
  text: string;
}

function formatInterviewDateTime(scheduledAtIso: string, locale: string): string {
  const date = new Date(scheduledAtIso);
  // No interview-specific or tutor-specific timezone is stored anywhere in
  // the schema (confirmed: TutorInterview has no timezone column,
  // TutorProfile has no timezone column) — rendering in UTC with an
  // explicit "(UTC)" label is the honest choice; silently picking a
  // guessed local zone would risk showing the wrong time with no way to
  // tell it's wrong.
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "UTC",
  });
  return `${formatter.format(date)} (UTC)`;
}

export async function buildTutorApplicationEmailContent(
  context: TutorApplicationEmailContext
): Promise<TutorApplicationEmailContent> {
  const locale = resolveEmailLocale(context.locale);
  const tCommon = createEmailTranslator(locale, "tutorApplicationEmail");
  const tEvent = createEmailTranslator(locale, `tutorApplicationEmail.events.${context.event}`);
  const tStageLabel = createEmailTranslator(locale, "dashboard.tutor.applicationStatus");
  const tDocumentType = createEmailTranslator(locale, "tutorDocuments.types");

  const stageLabel = tStageLabel(context.applicationStatus);
  const experience = getTutorExperience(context.applicationStatus);
  const actionRequired = experience.responsibleParty === "tutor";
  const nextStepText =
    context.applicationStatus === "APPROVED"
      ? tCommon("approvedNextStep")
      : createEmailTranslator(locale, `dashboard.tutor.experience.states.${context.applicationStatus}`)("whatNext");

  const detailValues: Record<string, string | number> = { ...context.detail };
  if (typeof detailValues.documentType === "string") {
    detailValues.documentType = tDocumentType(detailValues.documentType);
  }

  const subject = tEvent("subject");
  const heading = tEvent("heading");
  const greeting = tCommon("greeting", { name: context.tutorFirstName });
  const intro = tEvent("intro", detailValues);

  const rows: EmailRow[] = [{ label: tCommon("currentStageLabel"), value: stageLabel }];
  if (typeof context.detail.reason === "string" && context.detail.reason.length > 0) {
    // Only ever a tutor-visible reason already stored for exactly this
    // purpose (TutorDocument.rejectionReason, rejectTutor/suspendTutor/
    // reactivateTutor's `reason` argument) — never an internal admin note.
    rows.push({ label: tCommon("reasonLabel"), value: String(context.detail.reason) });
  }
  if (typeof context.detail.scheduledAtIso === "string") {
    rows.push({ label: tCommon("interviewTimeLabel"), value: formatInterviewDateTime(context.detail.scheduledAtIso, locale) });
  }

  const actionRow = actionRequired ? tCommon("actionRequiredLabel") : tCommon("noActionLabel");
  const bodyRows = [greeting, tCommon("updatedByTeam"), intro, actionRow, nextStepText];

  const html = renderEmailShell({
    locale,
    title: subject,
    heading,
    bodyRows,
    rows,
    buttonLabel: tCommon("ctaLabel"),
    buttonUrl: context.dashboardUrl,
    footer: tCommon("footer"),
  });

  const text = [heading, "", ...bodyRows, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", `${tCommon("ctaLabel")}: ${context.dashboardUrl}`, "", tCommon("footer")].join(
    "\n"
  );

  return { subject, html, text };
}
