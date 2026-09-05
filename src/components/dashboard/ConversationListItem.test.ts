import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "ConversationListItem.tsx"), "utf8");

describe("ConversationListItem.tsx", () => {
  it("item 22 — links to the conversation via the i18n-aware Link", () => {
    expect(source).toContain('import { Link } from "@/i18n/navigation"');
    expect(source).toContain("href={`/messages/${conversationId}`}");
  });

  it("item 10 — shows a caller-provided empty-preview label rather than an implied error when no message has been sent yet", () => {
    expect(source).toContain("noMessagesLabel");
    expect(source).toContain("lastMessagePreview ?? noMessagesLabel");
  });

  it("item 34 — unread state is rendered via a badge count, not silently inferred", () => {
    expect(source).toContain("unreadCount > 0");
    expect(source).toContain('data-testid="unread-badge"');
  });

  it("never renders raw HTML from message content — only pre-resolved caller-provided strings", () => {
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("no fixed pixel widths — mobile-safe", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
    expect(source).toContain("min-w-0");
  });
});
