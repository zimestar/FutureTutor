/**
 * PROD-TUTOR-APPLICATION-NOTIFICATIONS1 — extracted from
 * bookingConfirmationEmailContent.ts (byte-identical output, pure
 * extraction, no behavior change) so the same inline-styled single-table
 * HTML shell can be reused by tutor-application-lifecycle emails instead
 * of duplicating ~50 lines of markup. Any future transactional email
 * template should reuse this rather than hand-rolling its own shell.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailRow {
  label: string;
  value: string;
}

export interface EmailShellParams {
  locale: string;
  title: string;
  heading: string;
  bodyRows: string[];
  rows: EmailRow[];
  buttonLabel: string;
  buttonUrl: string;
  footer: string;
}

export function renderEmailShell(params: EmailShellParams): string {
  const rowsHtml = params.rows
    .map(
      (row) =>
        `<tr><td style="font-size:13px;color:#6b7280;padding:4px 12px 4px 0;white-space:nowrap;">${escapeHtml(row.label)}</td><td style="font-size:13px;color:#111827;font-weight:600;padding:4px 0;">${escapeHtml(row.value)}</td></tr>`
    )
    .join("");
  const bodyHtml = params.bodyRows.map((line) => `<tr><td style="font-size:14px;color:#374151;padding-bottom:8px;">${escapeHtml(line)}</td></tr>`).join("");
  const safeUrl = escapeHtml(params.buttonUrl);

  return `<!doctype html>
<html lang="${escapeHtml(params.locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
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
              <td style="font-size:18px;font-weight:bold;color:#111827;padding-bottom:12px;">${escapeHtml(params.heading)}</td>
            </tr>
            ${bodyHtml}
            <tr>
              <td style="padding:12px 0 20px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;padding:12px 0;">
                  ${rowsHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:8px;">
                <a href="${safeUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 24px;border-radius:6px;">${escapeHtml(params.buttonLabel)}</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">${escapeHtml(params.footer)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
