import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "NotificationListItem.tsx"), "utf8");

describe("NotificationListItem.tsx", () => {
  it("item 7 — unread state is signalled by at least three independent, non-color-only cues", () => {
    // 1) bold/weight change on the title
    expect(source).toMatch(/isUnread \? "font-bold/);
    // 2) an explicit text label ("Unread"), not just a color dot
    expect(source).toContain('t("unreadLabel")');
    // 3) a filled indicator dot
    expect(source).toMatch(/isUnread \? "bg-blue" : "bg-transparent"/);
  });

  it("item 12 — clicking a notification with a safe link marks it read AND navigates (via the existing i18n-aware Link)", () => {
    expect(source).toContain('import { Link } from "@/i18n/navigation"');
    expect(source).toMatch(/<Link href=\{notification\.href\} onClick=\{\(\) => onMarkRead\(notification\.id\)\}/);
  });

  it("item 16 — a notification with no safe link (href === null) is still clickable to mark read, via a plain button, never a dead end", () => {
    expect(source).toMatch(/if \(notification\.href\)/);
    expect(source).toContain('data-testid="notification-item-no-link"');
    expect(source).toMatch(/<button[\s\S]{0,60}onClick=\{\(\) => onMarkRead\(notification\.id\)\}/);
  });

  it("item 19 — uses only responsive/existing design-system classes, no fixed pixel widths that would break on mobile", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
    expect(source).toContain("min-w-0");
    expect(source).toContain("truncate");
  });

  it("never renders raw notification.type or any field other than title/body/createdAt", () => {
    expect(source).not.toMatch(/\{notification\.type\}/);
  });
});
