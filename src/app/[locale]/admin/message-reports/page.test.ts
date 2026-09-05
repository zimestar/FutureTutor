import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("/admin/message-reports page.tsx (queue)", () => {
  it("items 31/32/33/34/35/36 — a real permission check (ADMIN_MESSAGE_REPORTS_READ), not just role, gates this page", () => {
    expect(source).toMatch(/user\.role !== "ADMIN" && user\.role !== "SUPER_ADMIN"/);
    expect(source).toContain('hasAdminPermission(user, "ADMIN_MESSAGE_REPORTS_READ")');
    expect(source).toMatch(/if \(!permitted\) \{/);
  });

  it("item 37 — bounded/paginated, never an unbounded query", () => {
    expect(source).toContain("listMessageReports(");
    expect(source).toContain("page.nextCursor");
  });

  it("items 38/39 — filters exist for status and reason", () => {
    expect(source).toContain('name="status"');
    expect(source).toContain('name="reason"');
  });

  it("item 50 — this is the report-driven queue, not a general browse-all conversation list — it never queries db.conversation directly", () => {
    expect(source).not.toMatch(/db\.conversation\.findMany/);
    expect(source).toContain("listMessageReports");
  });

  it("never renders a message edit/delete/send-as-user control", () => {
    expect(source).not.toMatch(/edit message|delete message|send as|impersonate/i);
  });
});
