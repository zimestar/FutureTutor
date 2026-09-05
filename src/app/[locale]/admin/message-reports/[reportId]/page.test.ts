import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("/admin/message-reports/[reportId] page.tsx (detail)", () => {
  it("a real permission check gates this page, same as the queue", () => {
    expect(source).toContain('hasAdminPermission(user, "ADMIN_MESSAGE_REPORTS_READ")');
  });

  it("item 40 — the reported message is visually highlighted, distinct from context messages", () => {
    expect(source).toMatch(/message\.isReportedMessage \? "rounded-lg border-2 border-error/);
  });

  it("item 41 — a nonexistent report renders notFound(), never a partial/blank page", () => {
    expect(source).toContain('import { notFound } from "next/navigation"');
    expect(source).toMatch(/if \(!report\) notFound\(\);/);
  });

  it("item 47/48/49 — no send-as-user, edit, or delete control exists on this page", () => {
    expect(source).not.toMatch(/send as|impersonate|edit message|delete message/i);
  });

  it("the MANAGE-gated status actions are only rendered when the viewer actually has ADMIN_MESSAGE_REPORTS_MANAGE", () => {
    expect(source).toContain('hasAdminPermission(user, "ADMIN_MESSAGE_REPORTS_MANAGE")');
    expect(source).toMatch(/\{canManage && <MessageReportStatusActions/);
  });
});
