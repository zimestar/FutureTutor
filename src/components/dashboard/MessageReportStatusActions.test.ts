import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "MessageReportStatusActions.tsx"), "utf8");
const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("MessageReportStatusActions.tsx", () => {
  it("item 44 — OPEN shows a 'mark under review' action", () => {
    expect(source).toMatch(/status === "OPEN" &&/);
    expect(source).toContain('data-testid="mark-under-review"');
  });

  it("item 45 — a 'mark resolved' action is always available for a non-resolved report", () => {
    expect(source).toContain('data-testid="mark-resolved"');
  });

  it("RESOLVED renders no further actions (terminal state)", () => {
    expect(source).toMatch(/if \(status === "RESOLVED"\) return null;/);
  });

  it("items 47/48/49 — no send-as-user/edit/delete/ban/suspend/refund/cancel-booking control exists here", () => {
    expect(sourceWithoutComments.toLowerCase()).not.toMatch(/send as|impersonate|edit message|delete message|\bban\b|suspend|refund|cancel booking/);
  });

  it("the only mutation is the status-transition Server Action", () => {
    expect(source).toContain('import { updateMessageReportStatusAction } from "@/lib/actions/messageReports"');
  });
});
