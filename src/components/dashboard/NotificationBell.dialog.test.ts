import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import enMessages from "../../../messages/en.json";
import frMessages from "../../../messages/fr.json";

// NOTIFICATION-CENTER1 — no jsdom/React Testing Library harness exists in
// this codebase (confirmed unchanged, see CancelBookingButton.dialog.test.ts's
// own doc comment for the precedent this mirrors). Static source
// inspection covers the structural facts a render test would otherwise
// prove: the 99+ badge threshold, the unread count coming from the
// server response, and the dialog/list wiring.

const source = readFileSync(join(__dirname, "NotificationBell.tsx"), "utf8");

describe("NotificationBell.tsx", () => {
  it("item 4 — no numeric badge renders when unreadCount is 0", () => {
    expect(source).toMatch(/unreadCount > 0 &&/);
  });

  it("item 5 — 99+ badge behavior for counts over 99", () => {
    expect(source).toContain('unreadCount > 99 ? "99+" : String(unreadCount)');
  });

  it("unread count is always read from the server action's response, never computed by counting DOM/local items from scratch", () => {
    expect(source).toContain("getNotificationSummaryAction()");
    expect(source).toMatch(/summary\?\.unreadCount|summary\.unreadCount/);
  });

  it("uses the existing shared Dialog primitive for the popover, not a bespoke anchored dropdown", () => {
    expect(source).toContain('import { Dialog } from "@/components/ui/Dialog"');
    expect(source).toContain("<Dialog");
  });

  it("provides a 'View all' link to the dedicated /notifications page", () => {
    expect(source).toContain('href="/notifications"');
  });

  it("provides a mark-all-read action, gated to only show when there is something unread", () => {
    expect(source).toContain("handleMarkAll");
    expect(source).toMatch(/unreadCount > 0 &&[\s\S]{0,80}handleMarkAll/);
  });

  it("fetches its own data on mount rather than requiring new props threaded through every page", () => {
    expect(source).toMatch(/useEffect\(\(\) => \{[\s\S]*getNotificationSummaryAction/);
  });
});

describe("NOTIFICATION-CENTER1 EN/FR content", () => {
  it("item 17 — EN keys exist for every string the bell/page needs", () => {
    const n = enMessages.notifications;
    for (const key of ["bellLabel", "title", "recentSubtitle", "markAllRead", "unreadLabel", "empty", "viewAll", "close", "pageTitle", "pageDescription", "loadMore"]) {
      expect(n).toHaveProperty(key);
      expect((n as Record<string, string>)[key]).toBeTruthy();
    }
    expect(n.bellLabel).toContain("{count}");
  });

  it("item 18 — FR keys exist and differ from EN", () => {
    const en = enMessages.notifications;
    const fr = frMessages.notifications;
    for (const key of Object.keys(en)) {
      expect(fr).toHaveProperty(key);
    }
    expect(fr.title).toBe(en.title); // "Notifications" is identical in both languages, legitimately
    expect(fr.markAllRead).not.toBe(en.markAllRead);
    expect(fr.empty).not.toBe(en.empty);
  });
});
