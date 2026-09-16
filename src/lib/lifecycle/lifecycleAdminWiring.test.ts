import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// LIFECYCLE-1A Phase 12 — proves the admin observability wiring is
// READ-ONLY: each detail page renders LifecycleSummaryCard fed by the pure
// lifecycle loader, and none of the three pages (or the card itself) gained
// a reminder-send action, bulk action, or any new mutation. Same
// established convention as seoPrivateNoindex1.test.ts /
// seoSubjectRebuild1.test.ts — reads source text since these .tsx files
// have DB/next-navigation dependencies plain vitest can't import directly.

const appRoot = join(__dirname, "..", "..", "app", "[locale]", "admin");
const componentSource = readFileSync(
  join(__dirname, "..", "..", "components", "admin", "LifecycleSummaryCard.tsx"),
  "utf8"
);

const pages = [
  { name: "tutor", path: join(appRoot, "tutors", "[id]", "page.tsx"), loader: "getTutorLifecycle" },
  { name: "parent", path: join(appRoot, "parents", "[id]", "page.tsx"), loader: "getParentLifecycle" },
  { name: "student", path: join(appRoot, "students", "[id]", "page.tsx"), loader: "getStudentProfileLifecycle" },
];

describe("LIFECYCLE-1A admin observability wiring", () => {
  it.each(pages)("$name admin detail page imports its lifecycle loader from @/lib/lifecycle and renders LifecycleSummaryCard", ({ path, loader }) => {
    const source = readFileSync(path, "utf8");
    expect(source).toMatch(new RegExp(`import\\s*\\{[^}]*\\b${loader}\\b[^}]*\\}\\s*from\\s*"@/lib/lifecycle"`));
    expect(source).toContain("<LifecycleSummaryCard");
    expect(source).toContain('import { LifecycleSummaryCard } from "@/components/admin/LifecycleSummaryCard"');
  });

  it("no admin page introduces a reminder-send action, bulk action, or Resend call alongside the lifecycle card", () => {
    for (const { path } of pages) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/sendReminder|resend\(|bulkAction|BulkAction/i);
    }
  });

  it("LifecycleSummaryCard itself has no form, action prop, or mutation call — display only", () => {
    expect(componentSource).not.toMatch(/<form|action=\{|"use server"|await\s+\w+Action\(/);
  });
});
