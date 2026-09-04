import "server-only";
import { createEmailTranslator, resolveEmailLocale } from "@/lib/email/emailTranslation";
import { renderEmailShell, type EmailRow } from "@/lib/email/emailShell";

/**
 * PROD-BOOKING-NOTIFICATIONS1 — locale-aware booking-confirmation email
 * copy for both recipients (tutor, payer). Mirrors
 * passwordResetEmailContent.ts's established shape: the same
 * messages/en.json + messages/fr.json mechanism (namespaces
 * "tutorBookingEmail" / "payerBookingEmail"), an explicit `locale` param
 * (never inferred), and the same inline-styled single-table HTML shell.
 *
 * PROD-BOOKING-NOTIFICATIONS1-I18NFIX1: unlike passwordResetEmailContent.ts
 * (still request-bound via next-intl/server, safe there because it's only
 * ever called from within a real Server Action request), this module is
 * called from convergeToCaptured's post-commit dispatch, which must also
 * work from a background/server-job context — so translation goes through
 * emailTranslation.ts's request-independent createEmailTranslator instead.
 *
 * Unlike the password-reset flow (one template), this feature has two
 * distinct templates sharing one delivery mechanism — so, deliberately
 * unlike sendPasswordResetEmail.ts, content-building lives here as pure
 * functions taking an already-resolved BookingEmailContext, and delivery
 * (src/lib/email/sendBookingConfirmationEmail.ts) takes only the finished
 * {to, subject, html, text} — the two concerns don't need to be coupled
 * the way a single-template flow naturally couples them.
 */

export interface BookingEmailContext {
  locale: string;
  tutorFirstName: string;
  /** The learner's own first name (StudentProfile.firstName) — always
   * present, even when the learner has no login of their own. */
  learnerFirstName: string;
  /** First name of whoever actually paid (Payment.payerUserId's own
   * User.name) — the student themselves for a self-managed booking, or the
   * parent/guardian for a parent-books-for-child booking. */
  payerFirstName: string;
  /** True only when the payer is NOT the learner (a parent/guardian paid
   * for a child) — used to decide whether to name the learner separately
   * in the payer's own confirmation. */
  payerIsLearner: boolean;
  subjectSlug: string;
  academicLevelSlug: string | null;
  mode: "ONLINE" | "IN_PERSON";
  startAt: Date;
  endAt: Date;
  timezone: string;
  amountCents: number;
  currency: string;
  bookingUrl: string;
}

export interface BookingEmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Never UTC — always formatted in the Booking's own stored timezone, the
 * same `timeZone: timezone` pattern already established by
 * src/lib/utils.ts's formatBookingTime, just split into the three separate
 * pieces (date / time range / zone name) this email's layout wants instead
 * of one combined string. */
function formatBookingDateParts(startAt: Date, endAt: Date, timezone: string, locale: string) {
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: timezone });
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: timezone });
  return {
    dateLabel: dateFormatter.format(startAt),
    startTimeLabel: timeFormatter.format(startAt),
    endTimeLabel: timeFormatter.format(endAt),
  };
}

function formatAmount(amountCents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountCents / 100);
}

export async function buildTutorBookingEmailContent(context: BookingEmailContext): Promise<BookingEmailContent> {
  // Resolved once, up front, so the translator and every Intl formatter
  // agree on the same (possibly-fallen-back) locale — a raw invalid
  // context.locale (e.g. "") reaching Intl.DateTimeFormat/NumberFormat
  // directly throws RangeError, whereas createEmailTranslator alone would
  // silently fall back only for the translated copy, leaving the
  // date/time/amount formatting on an unresolved, invalid locale.
  const locale = resolveEmailLocale(context.locale);
  const t = createEmailTranslator(locale, "tutorBookingEmail");
  const tSubjects = createEmailTranslator(locale, "subjects.items");
  const tLevels = createEmailTranslator(locale, "gradeLevels");

  const subject = t("subject");
  const heading = t("heading");
  const greeting = t("greeting", { name: context.tutorFirstName });
  const intro = t("intro");
  const modeLabel = context.mode === "ONLINE" ? t("modeOnline") : t("modeInPerson");
  const { dateLabel, startTimeLabel, endTimeLabel } = formatBookingDateParts(context.startAt, context.endAt, context.timezone, locale);

  const rows: EmailRow[] = [
    { label: t("learnerLabel"), value: context.learnerFirstName },
    { label: t("subjectLabel"), value: tSubjects(context.subjectSlug) },
    ...(context.academicLevelSlug ? [{ label: t("levelLabel"), value: tLevels(context.academicLevelSlug) }] : []),
    { label: t("dateLabel"), value: dateLabel },
    { label: t("timeLabel"), value: `${startTimeLabel}–${endTimeLabel} (${context.timezone})` },
    { label: t("modeLabel"), value: modeLabel },
  ];

  const bodyRows = [greeting, intro, ...(context.mode === "ONLINE" ? [t("onlineNote")] : [])];

  const html = renderEmailShell({
    locale,
    title: subject,
    heading,
    bodyRows,
    rows,
    buttonLabel: t("buttonLabel"),
    buttonUrl: context.bookingUrl,
    footer: t("footer"),
  });

  const text = [
    heading,
    "",
    greeting,
    intro,
    ...(context.mode === "ONLINE" ? [t("onlineNote")] : []),
    "",
    ...rows.map((r) => `${r.label}: ${r.value}`),
    "",
    `${t("buttonLabel")}: ${context.bookingUrl}`,
    "",
    t("footer"),
  ].join("\n");

  return { subject, html, text };
}

export async function buildPayerBookingEmailContent(context: BookingEmailContext): Promise<BookingEmailContent> {
  const locale = resolveEmailLocale(context.locale);
  const t = createEmailTranslator(locale, "payerBookingEmail");
  const tSubjects = createEmailTranslator(locale, "subjects.items");
  const tLevels = createEmailTranslator(locale, "gradeLevels");

  const subject = t("subject");
  const heading = t("heading");
  const greeting = t("greeting", { name: context.payerFirstName });
  const intro = t("intro", { tutor: context.tutorFirstName });
  const modeLabel = context.mode === "ONLINE" ? t("modeOnline") : t("modeInPerson");
  const { dateLabel, startTimeLabel, endTimeLabel } = formatBookingDateParts(context.startAt, context.endAt, context.timezone, locale);

  const rows: EmailRow[] = [
    { label: t("tutorLabel"), value: context.tutorFirstName },
    ...(context.payerIsLearner ? [] : [{ label: t("learnerLabel"), value: context.learnerFirstName }]),
    { label: t("subjectLabel"), value: tSubjects(context.subjectSlug) },
    ...(context.academicLevelSlug ? [{ label: t("levelLabel"), value: tLevels(context.academicLevelSlug) }] : []),
    { label: t("dateLabel"), value: dateLabel },
    { label: t("timeLabel"), value: `${startTimeLabel}–${endTimeLabel} (${context.timezone})` },
    { label: t("modeLabel"), value: modeLabel },
    { label: t("amountLabel"), value: formatAmount(context.amountCents, context.currency, locale) },
  ];

  const bodyRows = [greeting, intro, ...(context.mode === "ONLINE" ? [t("onlineNote")] : [])];

  const html = renderEmailShell({
    locale,
    title: subject,
    heading,
    bodyRows,
    rows,
    buttonLabel: t("buttonLabel"),
    buttonUrl: context.bookingUrl,
    footer: t("footer"),
  });

  const text = [
    heading,
    "",
    greeting,
    intro,
    ...(context.mode === "ONLINE" ? [t("onlineNote")] : []),
    "",
    ...rows.map((r) => `${r.label}: ${r.value}`),
    "",
    `${t("buttonLabel")}: ${context.bookingUrl}`,
    "",
    t("footer"),
  ].join("\n");

  return { subject, html, text };
}
