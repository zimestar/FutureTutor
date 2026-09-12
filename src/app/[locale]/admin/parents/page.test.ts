import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("/admin/parents page.tsx", () => {
  it("ADMIN-AUTH-HARDENING1 — a real, DB-fresh admin re-check gates this page, not just the stale-role pre-filter", () => {
    expect(source).toContain('import { requireActiveAdmin } from "@/services/adminPermissions";');
    expect(source).toContain("requireActiveAdmin(session)");
  });
});
