import "server-only";
import { createEmailTranslator, resolveEmailLocale } from "@/lib/email/emailTranslation";
import { renderEmailShell, type EmailRow } from "@/lib/email/emailShell";
import type { SessionNotificationEvent } from "@/generated/prisma/enums";

/**
 * PROD-SESSION-NOTIFICATIONS1 — locale-aware session-lifecycle email copy
 * (reminders, cancellation, no-show). One generalized template per
 * recipient role, mirroring tutorApplicationEmailContent.ts's shape:
 * translated subject/heading/intro per event (namespace
 * "sessionNotificationEmail.tutor.<EVENT>" /
 * "sessionNotificationEmail.payer.<EVENT>"), shared structural rows
 * (subject/level/date/time/mode), request-independent translation via
 * emailTranslation.ts, the shared emailShell.ts HTML shell.
 *
 * Session display fields (subject/level/mode/startAt/endAt/timezone) are
 * NOT frozen anywhere — they're read fresh from Booking at dispatch time
 * (src/services/sessionNotifications.ts), which is safe because no
 * reschedule capability exists in this codebase (confirmed by audit:
 * BookingStatus.RESCHEDULED has zero writers) — these fields are
 * effectively immutable for a Booking's lifetime.
 *
 * IN_PERSON privacy: deliberately does NOT render a street address, even
 * though Booking carries bookingAddressLine1/City/Province/PostalCode —
 * this matches the EXISTING, already-shipped booking-confirmation email's
 * own precedent (bookingConfirmationEmailContent.ts never renders an
 * address either, only the mode label) rather than inventing new exposure
 * this mission wasn't asked to authorize.
 */

export type SessionNotificationRecipientRole = "TUTOR" | "PAYER";

export interface SessionNotificationEmailContext {
  locale: string;
  recipientRole: SessionNotificationRecipientRole;
  recipientFirstName: string;
  /** The other party's first name — the learner's when recipientRole is
   * TUTOR, the tutor's when recipientRole is PAYER. */
  otherPartyFirstName: string;
  event: SessionNotificationEvent;
  subjectSlug: string;
  academicLevelSlug: string | null;
  mode: "ONLINE" | "IN_PERSON" | "BOTH";
  startAt: Date;
  endAt: Date;
  timezone: string;
  /** Only populated for SESSION_CANCELLED — who cancelled, relative to
   * this recipient. Never the raw actor identity (never a name/email). */
  cancelledByRelation?: "RECIPIENT" | "OTHER_PARTY" | "PLATFORM";
  dashboardUrl: string;
}

export interface SessionNotificationEmailContent {
  subject: string;
  html: string;
  text: string;
}

function formatSessionDateParts(startAt: Date, endAt: Date, timezone: string, locale: string) {
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: timezone });
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: timezone });
  return {
    dateLabel: dateFormatter.format(startAt),
    startTimeLabel: timeFormatter.format(startAt),
    endTimeLabel: timeFormatter.format(endAt),
  };
}

export async function buildSessionNotificationEmailContent(
  context: SessionNotificationEmailContext
): Promise<SessionNotificationEmailContent> {
  const locale = resolveEmailLocale(context.locale);
  const roleNamespace = context.recipientRole === "TUTOR" ? "tutor" : "payer";
  const tCommon = createEmailTranslator(locale, "sessionNotificationEmail");
  const tEvent = createEmailTranslator(locale, `sessionNotificationEmail.${roleNamespace}.${context.event}`);
  const tSubjects = createEmailTranslator(locale, "subjects.items");
  const tLevels = createEmailTranslator(locale, "gradeLevels");

  const subject = tEvent("subject");
  const heading = tEvent("heading");
  const greeting = tCommon("greeting", { name: context.recipientFirstName });
  const interpolationKey = context.recipientRole === "TUTOR" ? "learner" : "tutor";
  const intro = tEvent("intro", { [interpolationKey]: context.otherPartyFirstName });
  const modeLabel = context.mode === "ONLINE" ? tCommon("modeOnline") : tCommon("modeInPerson");
  const { dateLabel, startTimeLabel, endTimeLabel } = formatSessionDateParts(context.startAt, context.endAt, context.timezone, locale);

  const rows: EmailRow[] = [
    { label: tCommon("subjectLabel"), value: tSubjects(context.subjectSlug) },
    ...(context.academicLevelSlug ? [{ label: tCommon("levelLabel"), value: tLevels(context.academicLevelSlug) }] : []),
    { label: tCommon("dateLabel"), value: dateLabel },
    { label: tCommon("timeLabel"), value: `${startTimeLabel}–${endTimeLabel} (${context.timezone})` },
    { label: tCommon("modeLabel"), value: modeLabel },
  ];

  const bodyRows = [greeting, intro];

  if (context.event === "SESSION_CANCELLED" && context.cancelledByRelation) {
    const cancelledByKey =
      context.cancelledByRelation === "RECIPIENT"
        ? "cancelledByYouLabel"
        : context.cancelledByRelation === "PLATFORM"
          ? "cancelledByPlatformLabel"
          : "cancelledByOtherPartyLabel";
    bodyRows.push(tCommon(cancelledByKey));
    // Never invents refund status (mission's own explicit prohibition) —
    // this is the only financial-adjacent line in the entire template, and
    // it deliberately states nothing beyond "check your account."
    bodyRows.push(tCommon("adjustmentNote"));
  } else if (context.event === "SESSION_REMINDER_24H" || context.event === "SESSION_REMINDER_2H") {
    if (context.mode === "ONLINE") bodyRows.push(tCommon("onlineNote"));
  }

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
