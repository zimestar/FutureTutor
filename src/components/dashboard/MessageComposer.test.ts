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
    expect(source).toMatch(/if \(sendInFlightRef\.current \|\| disabled \|\| isEmpty \|\| isTooLong\) return;/);
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
    expect(source).toContain("await onSend(value, clientMessageId)");
    expect(source).toContain("result.ok");
  });

  it("no fixed pixel widths — mobile-safe", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
  });
});

describe("MESSAGING-DUPLICATE-SEND-FIX1 — same-tick concurrency lock", () => {
  it("uses a ref (synchronous, same-tick) as the actual send-lock guard, not just the `sending` state", () => {
    expect(source).toContain("const sendInFlightRef = useRef(false);");
    expect(source).toMatch(/if \(sendInFlightRef\.current \|\| disabled \|\| isEmpty \|\| isTooLong\) return;/);
  });

  it("the ref is set to true synchronously, BEFORE the async onSend call — so a second same-tick invocation is blocked before any await runs", () => {
    const handleSend = source.slice(source.indexOf("async function handleSend"), source.indexOf("async function handleSend") + 700);
    const lockIndex = handleSend.indexOf("sendInFlightRef.current = true;");
    const awaitIndex = handleSend.indexOf("await onSend(");
    expect(lockIndex).toBeGreaterThan(-1);
    expect(awaitIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeLessThan(awaitIndex);
  });

  it("the ref is always released in a finally block, so a thrown/rejected send never leaves the composer permanently locked", () => {
    expect(source).toMatch(/finally \{\s*sendInFlightRef\.current = false;\s*setSending\(false\);\s*\}/);
  });

  it("`sending` state remains a UX-only concern (button label/disabled styling), never the concurrency guard itself", () => {
    expect(source).toContain("setSending(true)");
    expect(source).toMatch(/\{sending \? t\("composer\.sending"\) : t\("composer\.send"\)\}/);
    // The early-return guard (already asserted above) checks sendInFlightRef,
    // not `sending` — confirms `sending` isn't doing double duty as the lock.
    expect(source).not.toMatch(/if \(sending \|\| disabled/);
  });
});

describe("MESSAGING-DUPLICATE-SEND-FIX1 — clientMessageId lifecycle", () => {
  it("generates the idempotency key lazily via crypto.randomUUID(), only once per logical send attempt", () => {
    expect(source).toContain("crypto.randomUUID()");
    expect(source).toContain("function getOrCreateClientMessageId()");
    expect(source).toMatch(/if \(!clientMessageIdRef\.current\) \{\s*clientMessageIdRef\.current = crypto\.randomUUID\(\);\s*\}/);
  });

  it("a successful send clears both the composer text AND the idempotency key, so the next message gets a fresh id", () => {
    const handleSend = source.slice(source.indexOf("async function handleSend"), source.indexOf("async function handleSend") + 700);
    const successBlock = handleSend.slice(handleSend.indexOf("if (result.ok)"), handleSend.indexOf("} else {"));
    expect(successBlock).toContain('setValue("");');
    expect(successBlock).toContain("clientMessageIdRef.current = null;");
  });

  it("a failed attempt does NOT clear the idempotency key — a same-tick or user-triggered retry of the same logical send reuses it", () => {
    const handleSend = source.slice(source.indexOf("async function handleSend"), source.indexOf("async function handleSend") + 700);
    const failureBlock = handleSend.slice(handleSend.indexOf("} else {"), handleSend.indexOf("} finally {"));
    expect(failureBlock).not.toContain("clientMessageIdRef.current = null");
  });

  it("editing the body after a failed attempt discards the abandoned key — the next attempt gets a fresh one", () => {
    expect(source).toContain("function handleValueChange(next: string) {");
    const handler = source.slice(source.indexOf("function handleValueChange"), source.indexOf("function handleSend"));
    expect(handler).toMatch(/if \(error\) \{[\s\S]*clientMessageIdRef\.current = null;/);
  });

  it("the textarea's onChange goes through handleValueChange, not a bare setValue", () => {
    expect(source).toContain("onChange={(e) => handleValueChange(e.target.value)}");
  });
});
