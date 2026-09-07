import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");
const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("admin/audit-log/[entryId]/page.tsx — authorization", () => {
  it("unauthenticated or non-admin roles are redirected before the entry is ever loaded", () => {
    expect(source).toMatch(/if \(!user \|\| \(user\.role !== "ADMIN" && user\.role !== "SUPER_ADMIN"\)\)/);
    const authIndex = source.indexOf('redirect({ href: "/login"');
    const loadIndex = source.indexOf("getAuditLogEntry(");
    expect(authIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeLessThan(loadIndex);
  });

  it("re-checks hasAdminPermission(\"ADMIN_AUDIT_LOG_READ\") server-side, before loading the entry", () => {
    expect(source).toContain('hasAdminPermission(user, "ADMIN_AUDIT_LOG_READ")');
    const permIndex = source.indexOf('hasAdminPermission(user, "ADMIN_AUDIT_LOG_READ")');
    const loadIndex = source.indexOf("getAuditLogEntry(");
    expect(permIndex).toBeLessThan(loadIndex);
  });

  it("an unknown entry id renders notFound(), never a leaked/empty render", () => {
    expect(source).toContain("if (!entry) notFound();");
  });
});

describe("admin/audit-log/[entryId]/page.tsx — safe rendering", () => {
  it("metadata is rendered exclusively through redactAuditMetadata — the raw entry.metadata value is never interpolated directly into JSX", () => {
    expect(source).toContain('import { redactAuditMetadata } from "@/lib/auditLogPresentation";');
    expect(source).toContain("redactAuditMetadata(entry.metadata)");
    expect(sourceWithoutComments).not.toMatch(/\{entry\.metadata\}/);
    expect(sourceWithoutComments).not.toContain("JSON.stringify(entry.metadata)");
  });

  it("no private message body/content is ever read from this page (mirrors the AuditLog-level redaction principle)", () => {
    expect(sourceWithoutComments.toLowerCase()).not.toMatch(/message\.body|\.content\b/);
  });

  it("actor identity handles SYSTEM/UNKNOWN/USER safely, never crashes on a null actor", () => {
    expect(source).toContain('entry.actor.kind === "SYSTEM"');
    expect(source).toContain('entry.actor.kind === "UNKNOWN"');
  });
});

describe("admin/audit-log/[entryId]/page.tsx — no mutation controls (detail view)", () => {
  it("no button, no form, no onClick — pure read-only detail", () => {
    expect(source).not.toMatch(/<button/i);
    expect(source).not.toMatch(/<form/i);
    expect(source).not.toContain("onClick");
  });

  it("no replay/rollback/impersonation language or action exists on this page", () => {
    expect(sourceWithoutComments.toLowerCase()).not.toMatch(/replay|rollback|impersonate|undo this|revert/);
  });

  it("no AuditLog/Booking/Session/Payment/TutorEarning/TutorTransfer write, no Stripe call", () => {
    expect(sourceWithoutComments).not.toMatch(/db\.\w+\.(create|update|updateMany|delete|deleteMany|upsert)\(/);
    expect(sourceWithoutComments).not.toMatch(/writeAuditLog|stripe\.|processEligibleTransfers/i);
  });
});

describe("admin/audit-log/[entryId]/page.tsx — mobile", () => {
  it("no fixed pixel widths, uses responsive grid classes", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
    expect(source).toContain("sm:grid-cols-2");
  });
});
