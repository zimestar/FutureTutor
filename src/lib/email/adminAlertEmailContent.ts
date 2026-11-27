import "server-only";
import { createEmailTranslator, resolveEmailLocale } from "@/lib/email/emailTranslation";
import { renderEmailShell, type EmailRow } from "@/lib/email/emailShell";
import type { AdminAlertEvent } from "@/generated/prisma/enums";

/**
 * TUTOR-PIPELINE1 — admin-team alert emails. Same shell and translation
 * mechanism as the candidate emails (request-independent, see
 * emailTranslation.ts). Copy lives under messages/*.json "adminAlertEmail".
 *
 * Everything in `detail` was frozen when the alert was recorded and is
 * escaped by renderEmailShell; nothing here re-reads live data.
 */

export interface DigestItem {
  tutorName: string;
  /** TutorApplicationStatus value, translated for display. */
  status: string;
  waitingDays: number;
  /** Translation key under adminAlertEmail.nextActions. */
  nextAction: string;
}

export interface AdminAlertEmailContext {
  locale: string;
  event: AdminAlertEvent;
  detail: Record<string, unknown>;
  baseUrl: string;
  tutorProfileId: string | null;
}

export interface AdminAlertEmailContent {
  subject: string;
  html: string;
  text: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

export function isDigestItemList(value: unknown): value is DigestItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as DigestItem).tutorName === "string" &&
        typeof (item as DigestItem).status === "string" &&
        typeof (item as DigestItem).waitingDays === "number" &&
        typeof (item as DigestItem).nextAction === "string"
    )
  );
}

export function buildAdminAlertEmailContent(context: AdminAlertEmailContext): AdminAlertEmailContent {
  const locale = resolveEmailLocale(context.locale);
  const t = createEmailTranslator(locale, "adminAlertEmail");
  const tEvent = createEmailTranslator(locale, `adminAlertEmail.events.${context.event}`);
  const tStatus = createEmailTranslator(locale, "dashboard.tutor.applicationStatus");
  const tDocumentType = createEmailTranslator(locale, "tutorDocuments.types");
  const tNext = createEmailTranslator(locale, "adminAlertEmail.nextActions");

  const tutorName = asString(context.detail.tutorName) || t("unnamedCandidate");
  const rows: EmailRow[] = [];
  let buttonUrl = `${context.baseUrl}/${locale}/admin/tutors/pipeline`;
  let intro: string;

  if (context.event === "TUTOR_PIPELINE_DIGEST") {
    const items = isDigestItemList(context.detail.items) ? context.detail.items : [];
    intro = tEvent("intro", { count: items.length });
    for (const item of items) {
      rows.push({
        label: item.tutorName || t("unnamedCandidate"),
        value: t("digestRow", {
          status: tStatus(item.status),
          days: item.waitingDays,
          action: tNext(item.nextAction),
        }),
      });
    }
  } else if (context.event === "SAFETY_CONCERN_REPORTED") {
    // Never the reporter's description: only what tells the team how fast to act.
    const urgent = context.detail.immediateDanger === true;
    intro = tEvent(urgent ? "introUrgent" : "intro");
    const tCategory = createEmailTranslator(locale, "safetyReport.categories");
    const category = asString(context.detail.category);
    if (category) rows.push({ label: t("categoryLabel"), value: tCategory(category) });
    rows.push({ label: t("immediateDangerLabel"), value: urgent ? t("yes") : t("no") });
    const adminPath = asString(context.detail.adminPath);
    if (adminPath.startsWith("/admin/")) buttonUrl = `${context.baseUrl}/${locale}${adminPath}`;
    const subject = urgent ? tEvent("subjectUrgent") : tEvent("subject");
    return finish(subject);
  } else {
    const documentType = asString(context.detail.documentType);
    intro = tEvent("intro", {
      tutorName,
      documentType: documentType ? tDocumentType(documentType) : "",
    });
    rows.push({ label: t("candidateLabel"), value: tutorName });
    const status = asString(context.detail.applicationStatus);
    if (status) rows.push({ label: t("stageLabel"), value: tStatus(status) });
    if (context.tutorProfileId) buttonUrl = `${context.baseUrl}/${locale}/admin/tutors/${context.tutorProfileId}`;
  }

  return finish(tEvent("subject", { tutorName }));

  function footer(): string {
    return context.event === "SAFETY_CONCERN_REPORTED" ? t("footerSafety") : t("footer");
  }

  function finish(subject: string): AdminAlertEmailContent {
    const heading = tEvent("heading");
    const html = renderEmailShell({
      locale,
      title: subject,
      heading,
      bodyRows: [intro],
      rows,
      buttonLabel: tEvent("cta"),
      buttonUrl,
      footer: footer(),
    });
    const text = [heading, "", intro, "", ...rows.map((row) => `${row.label}: ${row.value}`), "", `${tEvent("cta")}: ${buttonUrl}`, "", footer()].join("\n");
    return { subject, html, text };
  }
}
