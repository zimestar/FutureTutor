import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "MessageThread.tsx"), "utf8");
const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("MessageThread.tsx", () => {
  it("item 16/17 — message body is rendered as plain JSX text, never via dangerouslySetInnerHTML (React's default escaping applies)", () => {
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).toMatch(/<p className="whitespace-pre-wrap break-words text-\[15px\]">\{message\.body\}<\/p>/);
  });

  it("item 15 — newlines are preserved via whitespace-pre-wrap, not stripped/collapsed", () => {
    expect(source).toContain("whitespace-pre-wrap");
  });

  it("item 5/9 — polling interval is within the approved 5-10 second range", () => {
    const match = source.match(/POLL_INTERVAL_MS = (\d+)/);
    expect(match).not.toBeNull();
    const ms = Number(match![1]);
    expect(ms).toBeGreaterThanOrEqual(5000);
    expect(ms).toBeLessThanOrEqual(10000);
  });

  it("item 30 — polling fetches only messages newer than the current known newest message", () => {
    expect(source).toContain("getNewerMessagesAction(conversationId, latestCreatedAtRef.current)");
  });

  it("item 31 — polling never overlaps: a tick is skipped while the previous one is still in flight", () => {
    expect(source).toMatch(/if \(pollInFlightRef\.current\) return;/);
    expect(source).toContain("pollInFlightRef.current = true");
    expect(source).toMatch(/finally \{\s*pollInFlightRef\.current = false;/);
  });

  it("item 5 — polling stops when the component unmounts (interval is cleared)", () => {
    expect(source).toMatch(/return \(\) => clearInterval\(interval\);/);
  });

  it("polling is skipped (not merely delayed) while the page is hidden", () => {
    expect(sourceWithoutComments).toMatch(/document\.visibilityState === "hidden"/);
  });

  it("item 33 — mark-read is only ever called for the current user's own session, scoped server-side by markConversationReadAction itself", () => {
    expect(source).toContain("markConversationReadAction(conversationId)");
    // The client never passes a userId/participant id of its own — the
    // server action's own signature (see messaging.test.ts) takes only
    // conversationId and resolves the actor from auth().
    expect(source).not.toMatch(/markConversationReadAction\([^)]*userId/);
  });

  it("item 32 — 'load earlier' preserves scroll position rather than jumping to top or bottom", () => {
    expect(source).toContain("previousScrollHeight");
    expect(source).toMatch(/el\.scrollTop = el\.scrollHeight - previousScrollHeight/);
  });

  it("no WebSocket/SSE/realtime vendor is used", () => {
    expect(sourceWithoutComments.toLowerCase()).not.toMatch(/websocket|eventsource|supabase.*realtime/);
  });

  it("item 39 — no fixed pixel widths, uses responsive flex/grid classes", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
    expect(source).toContain("flex");
  });

  it("item 24 — an upcoming/recent session banner is derived from real sessionContext data, never invented client-side", () => {
    expect(source).toContain("sessionContext.kind");
    expect(source).toMatch(/data-testid=\{sessionContext\.kind === "upcoming" \? "upcoming-session-banner" : "recent-session-banner"\}/);
  });

  it("no Notification/email/financial call exists directly in this component", () => {
    expect(source).not.toMatch(/notifyUser|notification\.create|resend|stripe|payment\.|refund\./i);
  });

  it("a Report action is offered only on OTHER participants' messages, never on the viewer's own", () => {
    expect(source).toMatch(/\{!isOwn && \(/);
    expect(source).toContain('data-testid="report-message-button"');
  });

  it("reporting never edits/hides/deletes the message from the thread — it only opens the report dialog", () => {
    expect(source).toContain("setReportingMessageId(message.id)");
    expect(source).not.toMatch(/setMessages\([^)]*filter/);
  });

  it("renders exactly one MessageReportDialog instance, reused across messages via state", () => {
    const matches = source.match(/<MessageReportDialog/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
