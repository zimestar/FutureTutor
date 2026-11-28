import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import "@/test-support/useVerifiedTestDatabase"; // must precede @/lib/db
import { db } from "@/lib/db";
import { calculateCustomerPrice, tierPremiumCents } from "@/services/customerPricing";

// TIER-PREMIUM — the parent pays a per-tier supplement on direct bookings.

const stamp = `tier-premium-it-${Date.now()}`;
let subjectId: string;
const FAR = new Date(Date.now() + 60 * 86400000);

beforeAll(async () => {
  subjectId = (await db.subject.create({ data: { slug: `${stamp}-subject`, sortOrder: 999 } })).id;
  if (!(await db.marketplacePricingSettings.findFirst())) await db.marketplacePricingSettings.create({ data: {} });
  await db.customerBasePriceRule.create({ data: { subjectId, baseDurationMinutes: 60, basePriceCents: 4200, pricingVersion: "CUSTOMER_PRICING_V1" } });
});

afterAll(async () => {
  await db.customerBasePriceRule.deleteMany({ where: { subjectId } });
  await db.subject.deleteMany({ where: { id: subjectId } });
  await db.$disconnect();
});

describe("tierPremiumCents", () => {
  const settings = { tierPremiumVerifiedCents: 0, tierPremiumSeniorCents: 600, tierPremiumEliteCents: 1000 };
  it("charges nothing for NEW or an unknown tutor, and pro-rates by duration", () => {
    expect(tierPremiumCents(settings, "NEW", 60)).toBe(0);
    expect(tierPremiumCents(settings, null, 60)).toBe(0);
    expect(tierPremiumCents(settings, "VERIFIED", 60)).toBe(0);
    expect(tierPremiumCents(settings, "SENIOR", 60)).toBe(600);
    expect(tierPremiumCents(settings, "ELITE", 60)).toBe(1000);
    expect(tierPremiumCents(settings, "ELITE", 90)).toBe(1500);
  });
});

describe("customer price with a tutor tier — real DB", () => {
  const base = { subjectId, tutoringMode: "ONLINE" as const, durationMinutes: 60, requestedStartAt: FAR };

  it("adds the ELITE / SENIOR supplement as its own visible adjustment", async () => {
    const settings = await db.marketplacePricingSettings.findFirstOrThrow();
    const plain = await calculateCustomerPrice({ ...base, subjectId });
    const elite = await calculateCustomerPrice({ ...base, subjectId, tutorTier: "ELITE" });
    const senior = await calculateCustomerPrice({ ...base, subjectId, tutorTier: "SENIOR" });
    const fresh = await calculateCustomerPrice({ ...base, subjectId, tutorTier: "NEW" });
    expect(elite.subtotalCents - plain.subtotalCents).toBe(settings.tierPremiumEliteCents);
    expect(senior.subtotalCents - plain.subtotalCents).toBe(settings.tierPremiumSeniorCents);
    expect(fresh.subtotalCents).toBe(plain.subtotalCents);
    expect(elite.adjustments).toContainEqual(expect.objectContaining({ type: "TUTOR_TIER", reasonKey: "tutorTierElite", amountCents: settings.tierPremiumEliteCents }));
    expect(plain.adjustments.some((a) => a.type === "TUTOR_TIER")).toBe(false);
  });

  it("is applied to direct bookings with the chosen tutor's tier, not to Quick Match", () => {
    expect(readFileSync("src/lib/actions/pricing.ts", "utf8")).toContain("tutorTier: tutorProfile.payoutTier,");
    expect(readFileSync("src/lib/actions/tutoringRequests.ts", "utf8")).not.toContain("tutorTier");
  });
});
