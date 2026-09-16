import { createEmailTranslator, resolveEmailLocale } from "@/lib/email/emailTranslation";
import { renderEmailShell } from "@/lib/email/emailShell";
import type { ReminderContentContext, ReminderEmailContent } from "./types";

/**
 * LIFECYCLE-1B Phase 6 — stage-aware reminder content. Mirrors
 * tutorApplicationEmailContent.ts's exact shape (createEmailTranslator +
 * renderEmailShell, pure function over an already-resolved context) and
 * pulls every string from messages/{en,fr}.json's new "lifecycleReminderEmail"
 * namespace — never a hardcoded literal, so EN/FR stay genuinely
 * synchronized the same way every other transactional email in this
 * codebase already is.
 *
 * Every reminder answers the mission's 5 required questions:
 *  1. Why am I receiving this?  -> footer
 *  2. Where did I stop?         -> currentStageLabel row (the real stage name)
 *  3. What is the next action?  -> heading/intro (stage-specific, not generic)
 *  4. How do I continue?        -> CTA button -> deep link
 *  5. Why is it useful?         -> whyItMatters row
 *
 * R2 is never a duplicate of R1, and R3 is a plain final reminder — each
 * reminderNumber has its own translated copy (no "last chance"/manufactured
 * urgency anywhere in the content — see messages/en.json's actual text).
 *
 * This module builds content only — it is never called from a send path in
 * this mission (see the mission's absolute "DO NOT send" constraint).
 */

type ContentKey =
  | "TUTOR_DRAFT"
  | "TUTOR_TRAINING_REQUIRED"
  | "TUTOR_EXAM_REQUIRED"
  | "PARENT_STUDENT_SETUP"
  | "STUDENT_PROFILE_SELF"
  | "STUDENT_PROFILE_GUARDIAN";

/**
 * Maps a lifecycle role/stage/relationship onto the one content key that
 * exists for it. Only the six USER_ACTION_REQUIRED (stage, role) pairs
 * LIFECYCLE-1A can ever actually produce are covered — see
 * tutorExperience.ts (DRAFT/TRAINING_REQUIRED/EXAM_REQUIRED are the only
 * `responsibleParty: "tutor"` stages), parentLifecycle.ts (STUDENT_SETUP is
 * the only USER_ACTION_REQUIRED Parent stage), and studentLifecycle.ts
 * (PROFILE is the only USER_ACTION_REQUIRED Student stage). Any other
 * combination returns null — a defensive fail-closed default, never a
 * guessed template, in case a future LIFECYCLE-1A change introduces a new
 * actionable stage before this module's content matrix is updated for it.
 */
export function resolveContentKey(params: { role: ReminderContentContext["role"]; stage: ReminderContentContext["stage"]; relationship: ReminderContentContext["relationship"] }): ContentKey | null {
  if (params.role === "TUTOR") {
    if (params.stage === "DRAFT") return "TUTOR_DRAFT";
    if (params.stage === "TRAINING_REQUIRED") return "TUTOR_TRAINING_REQUIRED";
    if (params.stage === "EXAM_REQUIRED") return "TUTOR_EXAM_REQUIRED";
    return null;
  }
  if (params.role === "PARENT") {
    return params.stage === "STUDENT_SETUP" ? "PARENT_STUDENT_SETUP" : null;
  }
  if (params.role === "STUDENT") {
    if (params.stage !== "PROFILE") return null;
    return params.relationship === "GUARDIAN" ? "STUDENT_PROFILE_GUARDIAN" : "STUDENT_PROFILE_SELF";
  }
  return null;
}

export function buildReminderEmailContent(
  context: ReminderContentContext & { recipientChildFirstName?: string }
): ReminderEmailContent | null {
  const contentKey = resolveContentKey(context);
  if (contentKey === null) return null;

  const locale = resolveEmailLocale(context.locale);
  const tCommon = createEmailTranslator(locale, "lifecycleReminderEmail");
  const tKey = createEmailTranslator(locale, `lifecycleReminderEmail.reminders.${contentKey}`);
  const tR = createEmailTranslator(locale, `lifecycleReminderEmail.reminders.${contentKey}.R${context.reminderNumber}`);

  const values: Record<string, string> = { childName: context.recipientChildFirstName ?? "" };

  const subject = tR("subject", values);
  const heading = tR("heading", values);
  const intro = tR("intro", values);
  const whyItMatters = tKey("whyItMatters", values);
  const greeting = tCommon("greeting", { name: context.recipientFirstName });

  const bodyRows = [greeting, intro];
  const rows = [
    { label: tCommon("whyLabel"), value: whyItMatters },
  ];

  const html = renderEmailShell({
    locale,
    title: subject,
    heading,
    bodyRows,
    rows,
    buttonLabel: tCommon("ctaLabel"),
    buttonUrl: context.deepLinkUrl,
    footer: tCommon("footer"),
  });

  const text = [heading, "", ...bodyRows, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", `${tCommon("ctaLabel")}: ${context.deepLinkUrl}`, "", tCommon("footer")].join("\n");

  return { subject, html, text };
}
