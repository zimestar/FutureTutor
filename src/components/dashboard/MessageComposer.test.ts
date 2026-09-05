import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "MessageComposer.tsx"), "utf8");

describe("MessageComposer.tsx", () => {
  it("item 18 — enforces the 4000-character UI boundary", () => {
    expect(source).toContain("const MESSAGE_MAX_LENGTH = 4000");
    expect(source).toMatch(/isTooLong = value\.length > MESSAGE_MAX_LENGTH/);
    expect(source).toMatch(/disabled=\{sending \|\| isEmpty \|\| isTooLong\}/);
  });

  it("item 19 — empty (or whitespace-only) messages are blocked from sending", () => {
    expect(source).toMatch(/trimmed\.length === 0/);
    expect(source).toMatch(/if \(sending \|\| disabled \|\| isEmpty \|\| isTooLong\) return;/);
  });

  it("item 20 — a pending send disables the button (double-submit protection)", () => {
    expect(source).toMatch(/setSending\(true\)/);
    expect(source).toContain("disabled={sending");
  });

  it("item 35/36 — the contact-info warning is computed and shown but never gates handleSend", () => {
    expect(source).toContain("containsPossibleContactInfo");
    expect(source).toContain("showContactWarning");
    // handleSend's own early-return guard must never reference showContactWarning.
    const handleSendBody = source.slice(source.indexOf("async function handleSend"), source.indexOf("async function handleSend") + 400);
    expect(handleSendBody).not.toContain("showContactWarning");
  });

  it("item 23 — a suspended/blocked composer renders honest read-only copy, not the textarea", () => {
    expect(source).toContain('data-testid="composer-read-only"');
    expect(source).toMatch(/if \(disabled\) \{/);
  });

  it("server remains authoritative — client never trusts its own validation as the final answer, always calls onSend and handles a server-side error", () => {
    expect(source).toContain("await onSend(value)");
    expect(source).toContain("result.ok");
  });

  it("no fixed pixel widths — mobile-safe", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
  });
});
