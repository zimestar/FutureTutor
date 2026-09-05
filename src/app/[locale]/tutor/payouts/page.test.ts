import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");
const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("/tutor/payouts page.tsx", () => {
  it("item 1/2 — earnings and transfers are always scoped to the authenticated tutor's own profile, never a client-supplied id", () => {
    expect(source).toMatch(/tutorProfileId:\s*tutorProfile\.id/);
    // The tutorProfile itself is resolved from the authenticated session, never from searchParams/params.
    expect(source).toMatch(/db\.tutorProfile\.findUnique\(\{\s*where:\s*\{\s*userId:\s*user\.id/);
    expect(source).not.toMatch(/tutorProfileId:\s*searchParams/);
  });

  it("item 3 — amount/currency formatting reads the earning's own persisted currency, never a hardcoded CAD", () => {
    expect(source).toMatch(/currency:\s*earning\.currency/);
  });

  it("item 24 — the earnings/transparency rendering path adds no new Stripe call (the pre-existing Connect-status sync above is a separate, already-audited concern)", () => {
    const earningsSection = sourceWithoutComments.split('t("earningsTitle")')[1] ?? "";
    expect(earningsSection.toLowerCase()).not.toMatch(/stripe\.transfers|getstripeclient/);
  });

  it("item 25 — never performs a financial mutation", () => {
    expect(source).not.toMatch(/\.(update|create|delete|updateMany|deleteMany)\(/);
  });

  it("item 5/9 — a session outcome is read (status/completedAt/noShowConvergedAt/attendance) to derive an honest reason, never invented client-side", () => {
    expect(source).toContain("completedAt: true");
    expect(source).toContain("noShowConvergedAt: true");
    expect(source).toContain("reconstructNoShowOutcome(");
  });

  it("the transparency explanatory section is present on the page", () => {
    expect(source).toContain('t("transparency.title")');
    expect(source).toContain('t("transparency.delay")');
  });

  it("item 21 — no fixed pixel widths, uses the existing responsive design system", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
  });
});
