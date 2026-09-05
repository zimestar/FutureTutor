import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "MessageReportDialog.tsx"), "utf8");

describe("MessageReportDialog.tsx", () => {
  it("never edits/hides/deletes the reported message, never notifies the reported sender", () => {
    expect(source).not.toMatch(/\.(update|delete)\(/);
    expect(source.toLowerCase()).not.toMatch(/notifyuser|notification\.create/);
  });

  it("item 28 — the detail field is bounded to 1000 characters client-side (server remains authoritative)", () => {
    expect(source).toContain("const REPORT_DETAIL_MAX_LENGTH = 1000");
    expect(source).toContain("REPORT_DETAIL_MAX_LENGTH");
  });

  it("submits via the Server Action, never a direct DB call from the client", () => {
    expect(source).toContain('import { reportMessageAction } from "@/lib/actions/messageReports"');
  });

  it("double-submit is guarded by a pending state", () => {
    expect(source).toMatch(/if \(!messageId \|\| submitting\) return;/);
  });

  it("shows a clear success/already-reported/error acknowledgement rather than silently closing", () => {
    expect(source).toContain('data-testid="report-result"');
    expect(source).toContain("report.success");
    expect(source).toContain("report.alreadyReported");
    expect(source).toContain("report.error");
  });

  it("no fixed pixel widths — mobile-safe", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
  });
});
