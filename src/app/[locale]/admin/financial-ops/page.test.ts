import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");
const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("/admin/financial-ops page.tsx", () => {
  it("items 1/3/4/5 — denies everyone except ADMIN/SUPER_ADMIN, matching every other admin page's exact guard shape", () => {
    expect(source).toMatch(/user\.role !== "ADMIN" && user\.role !== "SUPER_ADMIN"/);
    expect(source).toMatch(/redirect\(\{ href: "\/login", locale \}\)/);
    // No special-case branch admits PARENT/STUDENT/TUTOR.
    expect(source).not.toMatch(/role === "PARENT"|role === "STUDENT"|role === "TUTOR"/);
  });

  it("never accepts a client-supplied tutorProfileId as authority — every row is read from the DB query result, not from searchParams", () => {
    expect(source).not.toMatch(/tutorProfileId:\s*searchParams/);
    expect(source).not.toMatch(/where:\s*\{\s*tutorProfileId:\s*(q|reason|earningStatus|transferStatus)/);
  });

  it("item 25 — the earnings query is bounded, never unbounded", () => {
    expect(source).toMatch(/take:\s*QUERY_BOUND/);
    expect(source).toMatch(/const QUERY_BOUND = \d+/);
  });

  it("item 24 — filters exist for earning status, transfer status, operational reason, and a date range, plus free-text search", () => {
    expect(source).toContain('name="q"');
    expect(source).toContain('name="earningStatus"');
    expect(source).toContain('name="transferStatus"');
    expect(source).toContain('name="reason"');
    expect(source).toContain('name="from"');
    expect(source).toContain('name="to"');
  });

  it("item 28 — the earnings-render path never calls Stripe", () => {
    expect(sourceWithoutComments.toLowerCase()).not.toMatch(/stripe\.transfers|getstripeclient|from ["']stripe["']/);
  });

  it("items 29/30/31/32/33/34 — never performs a financial mutation or invokes convergence/transfer logic", () => {
    expect(sourceWithoutComments).not.toMatch(/\.(update|create|delete|updateMany|deleteMany)\(/);
    // The doc comment at the top of this file explicitly NAMES these
    // functions to say it never calls them — checked against the
    // comment-stripped source so that explanatory prose can't produce a
    // false positive here.
    expect(sourceWithoutComments).not.toMatch(/convergeTutorEarningFromSession|processEligibleTransfers|createTransferForEarning|markEligibleEarnings|sweepTutorEarningConvergence/);
  });

  it("item 35 — renders no financial action button/form anywhere on the page (the only <form> is the read-only GET filter form)", () => {
    const forms = source.match(/<form/g) ?? [];
    expect(forms.length).toBe(1);
    expect(source).not.toMatch(/<form[^>]*action=\{?[a-zA-Z]/); // the one form has no Server Action wired to it
    for (const forbidden of ["Make eligible", "Retry transfer", "Create transfer", "Send payout", "Reverse transfer", "Release hold", "Override status"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("item 9 — the awaiting-convergence classification is observation only, wired through the pure classifier, never a trigger", () => {
    expect(source).toContain("classifyTutorEarningForAdmin(");
  });

  it("item 5/6 — session outcome facts (status/completedAt/noShowConvergedAt/attendance) feed the classification, never invented client-side", () => {
    expect(source).toContain("completedAt: true");
    expect(source).toContain("noShowConvergedAt: true");
    expect(source).toContain("reconstructNoShowOutcome(");
  });

  it("the bank-payout distinction note is rendered", () => {
    expect(source).toContain('t("bankPayoutNote")');
  });
});
