import { describe, it, expect, vi } from "vitest";

// L1-01B — permanent unit tests for the locale-aware password-reset email
// copy. Real next-intl/server `getTranslations` transitively imports
// `next/headers` (confirmed by probing it directly under vitest, including
// via next-intl's OWN core `createTranslator` re-export, which under this
// project's `ssr.resolve.conditions: ["react-server"]` vitest config also
// resolves to a bundle that touches next/headers) — this cannot resolve
// outside an actual Next.js server runtime. Every other test file in this
// codebase that touches next-intl/server mocks it for the same reason (see
// src/lib/actions/auth.test.ts).
//
// This fake is more faithful than a plain stub, though: it reads the REAL
// messages/en.json / messages/fr.json files (so a content/key typo or
// EN-vs-FR drift is still caught) and implements JUST the one ICU feature
// this namespace's copy actually uses — `{var, plural, one {...} other
// {...}}` with `#` substitution — rather than re-asserting a hand-copied
// duplicate of the strings.
function miniIcuPluralTranslate(messages: { passwordResetEmail: Record<string, string> }) {
  return (key: string, values?: Record<string, number>) => {
    let raw = messages.passwordResetEmail[key];
    if (!raw) throw new Error(`test fake translator: missing key "${key}"`);
    if (values) {
      for (const [varName, varValue] of Object.entries(values)) {
        const pluralRegex = new RegExp(`\\{${varName},\\s*plural,\\s*((?:\\w+\\s*\\{[^{}]*\\}\\s*)+)\\}`);
        raw = raw.replace(pluralRegex, (_match, branches: string) => {
          const branchMap: Record<string, string> = {};
          const branchRegex = /(\w+)\s*\{([^{}]*)\}/g;
          let branchMatch: RegExpExecArray | null;
          while ((branchMatch = branchRegex.exec(branches))) {
            branchMap[branchMatch[1]] = branchMatch[2];
          }
          const category = varValue === 1 ? "one" : "other";
          const chosen = branchMap[category] ?? branchMap.other ?? "";
          return chosen.replace(/#/g, String(varValue));
        });
      }
    }
    return raw;
  };
}

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale }: { locale: string; namespace: string }) => {
    const messagesModule = await import(`../../../messages/${locale}.json`);
    return miniIcuPluralTranslate(messagesModule.default);
  },
}));

import { buildPasswordResetEmailContent } from "./passwordResetEmailContent";
import enMessages from "../../../messages/en.json";
import frMessages from "../../../messages/fr.json";

const RESET_URL = "http://localhost:3100/en/reset-password?token=abc123XYZ";

describe("buildPasswordResetEmailContent", () => {
  it("test matrix item 3 — EN request produces the real EN subject/copy from messages/en.json", async () => {
    const content = await buildPasswordResetEmailContent({ locale: "en", resetUrl: RESET_URL });
    expect(content.subject).toBe(enMessages.passwordResetEmail.subject);
    expect(content.html).toContain(enMessages.passwordResetEmail.heading);
    expect(content.text).toContain(enMessages.passwordResetEmail.heading);
  });

  it("test matrix item 4 — FR request produces the real FR subject/copy from messages/fr.json, not EN", async () => {
    const content = await buildPasswordResetEmailContent({ locale: "fr", resetUrl: RESET_URL });
    expect(content.subject).toBe(frMessages.passwordResetEmail.subject);
    expect(content.subject).not.toBe(enMessages.passwordResetEmail.subject);
    expect(content.html).toContain(frMessages.passwordResetEmail.heading);
  });

  it("renders the singular hour form for a 1-hour TTL in both locales (real ICU plural formatting)", async () => {
    const en = await buildPasswordResetEmailContent({ locale: "en", resetUrl: RESET_URL });
    const fr = await buildPasswordResetEmailContent({ locale: "fr", resetUrl: RESET_URL });
    expect(en.text).toContain("1 hour");
    expect(en.text).not.toContain("1 hours");
    expect(fr.text).toContain("1 heure");
    expect(fr.text).not.toContain("1 heures");
  });

  it("test matrix item 6 — the reset URL (including its token) appears in both the html and text payload", async () => {
    const content = await buildPasswordResetEmailContent({ locale: "en", resetUrl: RESET_URL });
    expect(content.text).toContain(RESET_URL);
    expect(content.html).toContain(RESET_URL);
  });

  it("test matrix item 13 — content contains no password, password hash, or internal user/database ID", async () => {
    const content = await buildPasswordResetEmailContent({ locale: "en", resetUrl: RESET_URL });
    const serialized = `${content.subject}\n${content.html}\n${content.text}`;
    // The function's own signature only ever accepts { locale, resetUrl } —
    // it structurally cannot receive a password/hash/userId — this asserts
    // the rendered output also never happens to contain such values (a
    // bcrypt hash prefix, or the field names themselves as identifiers).
    // (Deliberately NOT asserting the substring "password:" is absent — the
    // button label itself is legitimately "Reset Password:" in the
    // plain-text payload.)
    expect(serialized).not.toMatch(/\$2[aby]\$/); // bcrypt hash prefix
    expect(serialized.toLowerCase()).not.toContain("userid");
    expect(serialized.toLowerCase()).not.toContain("passwordhash");
  });

  it("escapes HTML-significant characters from the reset URL in the html payload but not in the plain-text payload", async () => {
    const dangerousUrl = "http://localhost:3100/en/reset-password?token=abc&x=<script>";
    const content = await buildPasswordResetEmailContent({ locale: "en", resetUrl: dangerousUrl });

    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain("&lt;script&gt;");
    expect(content.html).toContain("&amp;x=");

    // Plain text has no HTML-injection surface, so it carries the raw URL.
    expect(content.text).toContain(dangerousUrl);
  });

  it("html includes a clickable reset button/link pointing at the reset URL", async () => {
    const content = await buildPasswordResetEmailContent({ locale: "en", resetUrl: RESET_URL });
    expect(content.html).toMatch(new RegExp(`<a href="${RESET_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  });
});
