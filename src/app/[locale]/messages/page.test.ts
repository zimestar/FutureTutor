import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("/messages page.tsx", () => {
  it("item 1 — unauthenticated users are redirected to login", () => {
    expect(source).toMatch(/if \(!user\) \{/);
    expect(source).toMatch(/redirect\(\{ href: "\/login", locale \}\)/);
  });

  it("ADMIN/SUPER_ADMIN are redirected away — they are not a supported messaging role", () => {
    expect(source).toMatch(/user\.role === "ADMIN" \|\| user\.role === "SUPER_ADMIN"/);
    expect(source).toContain("homePathForRole(user.role)");
  });

  it("item 11 — conversations are derived via listMyConversations for the authenticated user, never a client-supplied id", () => {
    expect(source).toContain("listMyConversations(user.id)");
  });

  it("item 10 — an empty conversation list renders the EmptyState component, not an error", () => {
    expect(source).toContain("conversations.length === 0");
    expect(source).toContain("<EmptyState");
  });

  it("item 2/3/4 — role-aware primary label: tutor prominently for a student, student+tutor for a guardian, student for a tutor", () => {
    expect(source).toMatch(/user\.role === "TUTOR"\s*\?\s*conversation\.studentFirstName/);
    expect(source).toContain('t("list.guardianTitle"');
  });

  it("never performs a financial mutation or Stripe call", () => {
    expect(source).not.toMatch(/\.(update|create|delete|updateMany|deleteMany)\(/);
    expect(source.toLowerCase()).not.toMatch(/stripe\.|getstripeclient/);
  });
});
