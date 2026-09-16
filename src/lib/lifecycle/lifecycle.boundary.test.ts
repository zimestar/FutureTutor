import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// LIFECYCLE-1A — source-level enforcement of the mission's boundaries
// (Phase 15/16/FINANCIAL SAFETY). Structural, not behavioral: greps this
// module's own source text so a future edit that accidentally pulls in
// Resend, a cron secret, GTM/GA4, or a Stripe/financial symbol fails CI
// immediately instead of being caught only by code review.

const LIFECYCLE_DIR = __dirname;

function lifecycleSourceFiles(): { path: string; text: string }[] {
  return readdirSync(LIFECYCLE_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({ path: join(LIFECYCLE_DIR, f), text: readFileSync(join(LIFECYCLE_DIR, f), "utf8") }));
}

describe("LIFECYCLE-1A source boundaries", () => {
  it("§42/§16 no Resend import or invocation anywhere in src/lib/lifecycle", () => {
    for (const { path, text } of lifecycleSourceFiles()) {
      expect(text, path).not.toMatch(/resend/i);
    }
  });

  it("§44/§16 no cron secret or scheduled-job wiring anywhere in src/lib/lifecycle", () => {
    for (const { path, text } of lifecycleSourceFiles()) {
      expect(text, path).not.toMatch(/CRON_SECRET|node-cron|scheduleJob/i);
    }
  });

  it("§45/§15 no GTM/GA4/analytics/dataLayer/consent import anywhere in src/lib/lifecycle", () => {
    for (const { path, text } of lifecycleSourceFiles()) {
      expect(text, path).not.toMatch(/googletagmanager|dataLayer|gtag|analytics\/|ConsentBanner/i);
    }
  });

  it("§46 FINANCIAL REACHABILITY = ZERO — no Stripe/payment/pricing/earning/payout/refund symbol anywhere in src/lib/lifecycle", () => {
    for (const { path, text } of lifecycleSourceFiles()) {
      expect(text, path).not.toMatch(/stripe|paymentAttempt|tutorEarning|tutorTransfer|refund|payout|calculateCustomerPrice|PAYMENT_MODE/i);
    }
  });

  it("this module never imports next/cache, next/server, or a Server Action ('use server') — it is a plain data layer, not a route/action surface", () => {
    for (const { path, text } of lifecycleSourceFiles()) {
      expect(text, path).not.toMatch(/"use server"|next\/cache|next\/server/);
    }
  });
});
