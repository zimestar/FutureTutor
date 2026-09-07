import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "AdminAuditLogRow.tsx"), "utf8");

describe("AdminAuditLogRow.tsx", () => {
  it("renders zero mutation controls — no button, no form, no action prop", () => {
    expect(source).not.toMatch(/<button/i);
    expect(source).not.toMatch(/<form/i);
    expect(source).not.toContain("onClick");
    expect(source).not.toContain("action=");
  });

  it("never performs a database write of any kind", () => {
    expect(source).not.toMatch(/\.(update|create|delete|updateMany|deleteMany)\(/);
    expect(source).not.toContain("db.");
  });

  it("never imports or calls the Stripe SDK", () => {
    expect(source.toLowerCase()).not.toMatch(/from ["']stripe["']|stripe\.transfers|stripe\.paymentintents/);
  });

  it("shows a 'view detail' link into the entry's own detail route, never an inline mutation action", () => {
    expect(source).toContain('data-testid="audit-log-view-detail"');
    expect(source).toContain("href={detailHref}");
  });

  it("every string is a resolved prop — no next-intl/translation call inside this presentational component", () => {
    expect(source).not.toContain("next-intl");
    expect(source).not.toContain("getTranslations");
  });

  it("uses only responsive classes, no fixed pixel widths", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
    expect(source).toContain("flex-wrap");
    expect(source).toContain("truncate");
  });
});
