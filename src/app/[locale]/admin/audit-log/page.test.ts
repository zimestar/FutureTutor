import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../../../messages/en.json";
import fr from "../../../../../messages/fr.json";

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");
const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("admin/audit-log/page.tsx — authorization (items 1-6)", () => {
  it("item 3/4/5/6 — unauthenticated or non-admin (Student/Parent/Tutor) roles are redirected before any query runs", () => {
    expect(source).toMatch(/if \(!user \|\| \(user\.role !== "ADMIN" && user\.role !== "SUPER_ADMIN"\)\)/);
    expect(source).toContain('redirect({ href: "/login", locale })');
  });

  it("item 1/2/3 — server-side re-checks hasAdminPermission(\"ADMIN_AUDIT_LOG_READ\") — navigation visibility is never treated as authorization", () => {
    expect(source).toContain('import { hasAdminPermission } from "@/lib/adminPermission";');
    expect(source).toContain('hasAdminPermission(user, "ADMIN_AUDIT_LOG_READ")');
    expect(source).toMatch(/if \(!permitted\) \{\s*redirect\(\{ href: homePathForRole\(user\.role\), locale \}\);/);
  });

  it("item 1 — Super Admin reaches the permission check via hasAdminPermission's own SUPER_ADMIN-always-true rule (no separate bypass coded here)", () => {
    // No special-cased "if (user.role === 'SUPER_ADMIN') skip permission
    // check" exists in this page — SUPER_ADMIN access comes entirely from
    // hasAdminPermission's own established behavior, re-used unmodified.
    expect(sourceWithoutComments).not.toMatch(/role === "SUPER_ADMIN".*permitted\s*=\s*true/);
  });
});

describe("admin/audit-log/page.tsx — list, pagination, filters (items 7-13)", () => {
  it("delegates the actual query to the shared, tested listAuditLogEntries service — no inline db.auditLog query duplicated here", () => {
    expect(source).toContain('import { listAuditLogEntries');
    expect(sourceWithoutComments).not.toMatch(/db\.auditLog\.findMany/);
  });

  it("item 9 — action filter is validated against the real known-action list before being passed to the query (never a raw client string)", () => {
    expect(source).toContain("ALL_KNOWN_AUDIT_ACTIONS.includes(action)");
  });

  it("entityType filter is validated against the real known-entityType list", () => {
    expect(source).toContain("ALL_KNOWN_AUDIT_ENTITY_TYPES.includes(entityType)");
  });

  it("item 11/12 — date filters guard against an invalid Date before being passed through", () => {
    expect(source).toContain("!Number.isNaN(fromDate.getTime())");
    expect(source).toContain("!Number.isNaN(toDate.getTime())");
  });

  it("item 8 — pagination uses the returned nextCursor, never a client-computed offset", () => {
    expect(source).toContain("page.nextCursor");
    expect(source).toContain('data-testid="next-page"');
  });

  it("item 18 — the empty state is only rendered when the real query returns zero items", () => {
    expect(source).toMatch(/page\.items\.length === 0 \?/);
    expect(source).toContain('{t("empty")}');
  });

  it("action filter dropdown is grouped by category for display only — the option VALUE remains the raw stored action string, never translated", () => {
    expect(source).toMatch(/<option key=\{value\} value=\{value\}>\s*\{value\}/);
  });
});

describe("admin/audit-log/page.tsx — no mutation of any kind (items 22-27)", () => {
  it("no AuditLog write", () => {
    expect(sourceWithoutComments).not.toMatch(/db\.auditLog\.(create|update|updateMany|delete|deleteMany|upsert)/);
    expect(sourceWithoutComments).not.toMatch(/writeAuditLog/);
  });

  it("no Booking/Session write", () => {
    expect(sourceWithoutComments).not.toMatch(/db\.booking\.(create|update|updateMany|delete|upsert)/);
    expect(sourceWithoutComments).not.toMatch(/db\.session_\.(create|update|updateMany|delete|upsert)/i);
  });

  it("no Payment/TutorEarning/TutorTransfer write, no Stripe call", () => {
    expect(sourceWithoutComments).not.toMatch(/db\.payment\.(create|update|updateMany|delete|upsert)/);
    expect(sourceWithoutComments).not.toMatch(/db\.tutorEarning\.|db\.tutorTransfer\.|stripe\.|processEligibleTransfers/i);
  });

  it("the filter form is a plain GET-style search — no Server Action wired to <form>, no onClick", () => {
    expect(source).not.toMatch(/<form[^>]*\baction=/);
    expect(source).not.toContain("onClick");
  });

  it("no schema change was required beyond the additive AdminPermission enum value — this page reads only existing AuditLog columns", () => {
    expect(source).not.toMatch(/model \w+ \{|@@unique|@@index/);
  });
});

describe("admin/audit-log/page.tsx — mobile (item 23)", () => {
  it("no fixed pixel widths, uses responsive grid/flex classes", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
    expect(source).toContain("sm:grid-cols-3");
  });
});

describe("admin/audit-log/page.tsx — EN/FR (items 19/20)", () => {
  for (const [locale, messages] of [
    ["en", en],
    ["fr", fr],
  ] as const) {
    it(`${locale} has every admin.auditLog key this page/detail page reads`, () => {
      const auditLog = messages.admin.auditLog as Record<string, unknown>;
      for (const key of ["title", "description", "empty", "viewDetail", "nextPage", "detailTitle", "detailDescription", "timestamp", "action", "correlationNote"]) {
        expect(auditLog[key], `missing ${locale} admin.auditLog.${key}`).toBeTruthy();
      }
      const filters = auditLog.filters as Record<string, string>;
      for (const key of ["action", "entityType", "actor", "actorPlaceholder", "entityId", "entityIdPlaceholder", "from", "to", "all", "apply"]) {
        expect(filters[key], `missing ${locale} admin.auditLog.filters.${key}`).toBeTruthy();
      }
      const category = auditLog.category as Record<string, string>;
      for (const key of ["AUTH_USER", "TUTOR_APPLICATION", "BOOKING_SESSION", "FINANCIAL", "MESSAGING_SAFETY", "ADMIN", "OTHER"]) {
        expect(category[key], `missing ${locale} admin.auditLog.category.${key}`).toBeTruthy();
      }
      const actor = auditLog.actor as Record<string, string>;
      for (const key of ["system", "unknown", "unknownId", "deactivated", "roleLabel"]) {
        expect(actor[key], `missing ${locale} admin.auditLog.actor.${key}`).toBeTruthy();
      }
      const entity = auditLog.entity as Record<string, string>;
      for (const key of ["label", "none", "idLabel"]) {
        expect(entity[key], `missing ${locale} admin.auditLog.entity.${key}`).toBeTruthy();
      }
      const metadata = auditLog.metadata as Record<string, string>;
      for (const key of ["title", "empty", "redacted"]) {
        expect(metadata[key], `missing ${locale} admin.auditLog.metadata.${key}`).toBeTruthy();
      }
    });

    it(`${locale} has the dashboard.nav.auditLog nav label`, () => {
      expect(messages.dashboard.nav.auditLog).toBeTruthy();
    });
  }
});

describe("admin nav wiring", () => {
  it("the audit-log nav entry is gated on ADMIN_AUDIT_LOG_READ, a dedicated permission not reused from an unrelated domain", () => {
    const navSource = readFileSync(join(__dirname, "../../../../lib/adminNav.ts"), "utf8");
    expect(navSource).toMatch(/key: "auditLog", href: "\/admin\/audit-log", group: "operationsGroup", permission: "ADMIN_AUDIT_LOG_READ"/);
  });
});
