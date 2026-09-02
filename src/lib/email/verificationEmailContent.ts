import "server-only";
import { getTranslations } from "next-intl/server";
import { EMAIL_VERIFICATION_TTL_MS } from "@/services/emailVerification";

/**
 * BETA-EMAILVERIFY1 — locale-aware activation email copy. Structured
 * identically to passwordResetEmailContent.ts: reuses next-intl's normal
 * messages/en.json + messages/fr.json mechanism (an explicit `locale` is
 * already available at every call site, same as password reset), and keeps
 * the HTML/text document STRUCTURE in this file while only the copy itself
 * is translated, so a translated string can never be interpreted as markup.
 */

export interface VerificationEmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Mirrors passwordResetEmailContent.ts's escapeHtml exactly. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EMAIL_VERIFICATION_TTL_HOURS = EMAIL_VERIFICATION_TTL_MS / (60 * 60 * 1000);

/**
 * Builds the subject/html/text for a single activation email. Takes only
 * `locale` and `verifyUrl` — the recipient's email is used solely by the
 * caller to address the message, never interpolated into the body itself.
 * No userId, password, password hash, or raw audit metadata ever reaches
 * this function — structurally impossible for the template to leak them,
 * since they are never passed in.
 */
export async function buildVerificationEmailContent(params: {
  locale: string;
  verifyUrl: string;
}): Promise<VerificationEmailContent> {
  const t = await getTranslations({ locale: params.locale, namespace: "verificationEmail" });
  const hours = EMAIL_VERIFICATION_TTL_HOURS;

  const subject = t("subject");
  const heading = t("heading");
  const greeting = t("greeting");
  const intro = t("intro");
  const buttonLabel = t("buttonLabel");
  const expiryNotice = t("expiryNotice", { hours });
  const ignoreNotice = t("ignoreNotice");
  const linkFallback = t("linkFallback");
  const footer = t("footer");

  const safeUrl = escapeHtml(params.verifyUrl);

  const html = `<!doctype html>
<html lang="${escapeHtml(params.locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;padding:32px;">
            <tr>
              <td style="font-size:20px;font-weight:bold;color:#111827;padding-bottom:16px;">FutureTutor</td>
            </tr>
            <tr>
              <td style="font-size:18px;font-weight:bold;color:#111827;padding-bottom:12px;">${escapeHtml(heading)}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#374151;padding-bottom:8px;">${escapeHtml(greeting)}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#374151;padding-bottom:24px;">${escapeHtml(intro)}</td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <a href="${safeUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 24px;border-radius:6px;">${escapeHtml(buttonLabel)}</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#6b7280;padding-bottom:12px;">${escapeHtml(expiryNotice)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#6b7280;padding-bottom:24px;">${escapeHtml(ignoreNotice)}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#9ca3af;padding-bottom:4px;">${escapeHtml(linkFallback)}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#2563eb;word-break:break-all;padding-bottom:24px;">${safeUrl}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">${escapeHtml(footer)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [heading, "", greeting, intro, "", `${buttonLabel}: ${params.verifyUrl}`, "", expiryNotice, ignoreNotice, "", footer].join(
    "\n"
  );

  return { subject, html, text };
}
