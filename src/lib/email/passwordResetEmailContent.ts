import "server-only";
import { getTranslations } from "next-intl/server";
import { PASSWORD_RESET_TTL_MS } from "@/services/passwordReset";

/**
 * L1-01B — locale-aware password-reset email copy.
 *
 * Judgment call (documented per the task's instructions): this reuses
 * next-intl's normal messages/en.json + messages/fr.json mechanism, NOT a
 * bespoke email-template module for the copy itself. notify.ts's own doc
 * comment explains why next-intl is normally skipped for this codebase's
 * *dynamic, server-generated* text — no per-user locale context is
 * available at write time there. That reasoning does not apply here:
 * RequestPasswordResetDeps already carries an explicit `locale` parameter
 * (resolved from the real request via getLocale() in forgotPasswordAction),
 * so this is no different from any other server-rendered, translated string
 * in the app. Using the shared messages files also means a future
 * translator/localization workflow only has one place to look, and
 * `getTranslations({ locale, ... })` with an explicit locale is already an
 * established pattern in this codebase (registerAction/loginAction in
 * src/lib/actions/auth.ts call it the exact same way).
 *
 * The HTML/text document STRUCTURE (escaping, layout) stays in this file —
 * only the copy itself is translated — so there is no risk of translated
 * strings ever being interpreted as markup.
 */

export interface PasswordResetEmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Minimal, dependency-free HTML-escaping — every value interpolated into
 * the HTML document (translated copy, the reset URL) passes through this
 * first (task §13: "No user-provided HTML interpolation without
 * escaping"). None of these inputs are attacker-controlled in practice
 * (translated copy is static; resetUrl is server-built from
 * getAppBaseUrl() + a random token), but escaping unconditionally means
 * that safety property doesn't depend on it staying that way. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PASSWORD_RESET_TTL_HOURS = PASSWORD_RESET_TTL_MS / (60 * 60 * 1000);

/**
 * Builds the subject/html/text for a single password-reset email. Takes
 * only `locale` and `resetUrl` — the recipient's email is used solely by
 * the caller to address the message (Resend's `to` field), never
 * interpolated into the body itself. No userId, no password, no password
 * hash, no raw audit metadata ever reaches this function (task §4
 * contract) — it is structurally impossible for the template to leak them,
 * since they are never passed in.
 */
export async function buildPasswordResetEmailContent(params: {
  locale: string;
  resetUrl: string;
}): Promise<PasswordResetEmailContent> {
  const t = await getTranslations({ locale: params.locale, namespace: "passwordResetEmail" });
  const hours = PASSWORD_RESET_TTL_HOURS;

  const subject = t("subject");
  const heading = t("heading");
  const greeting = t("greeting");
  const intro = t("intro");
  const buttonLabel = t("buttonLabel");
  const expiryNotice = t("expiryNotice", { hours });
  const ignoreNotice = t("ignoreNotice");
  const linkFallback = t("linkFallback");
  const footer = t("footer");

  const safeUrl = escapeHtml(params.resetUrl);

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

  const text = [heading, "", greeting, intro, "", `${buttonLabel}: ${params.resetUrl}`, "", expiryNotice, ignoreNotice, "", footer].join(
    "\n"
  );

  return { subject, html, text };
}
