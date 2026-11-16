import { describe, expect, it } from "vitest";
import { TutorApplicationStatus } from "@/generated/prisma/enums";
import { BOOKABLE_TUTOR_WHERE, isTutorBookable } from "./tutorBookability";

// RW-03 — the single shared tutor bookability rule. Every one of the 13
// TutorApplicationStatus values (read from the generated Prisma enum, so a
// newly added status is covered automatically) x {active, deactivated,
// not loaded} user state.

const ALL_STATUSES = Object.values(TutorApplicationStatus);
const DEACTIVATED_AT = new Date("2026-11-01T00:00:00.000Z");

describe("isTutorBookable", () => {
  it("covers all 13 TutorApplicationStatus values", () => {
    expect(ALL_STATUSES).toHaveLength(13);
  });

  it.each(ALL_STATUSES)("applicationStatus=%s, active user -> bookable only when APPROVED", (applicationStatus) => {
    expect(isTutorBookable({ applicationStatus, userDeactivatedAt: null })).toBe(applicationStatus === "APPROVED");
  });

  it.each(ALL_STATUSES)("applicationStatus=%s, deactivated user -> never bookable", (applicationStatus) => {
    expect(isTutorBookable({ applicationStatus, userDeactivatedAt: DEACTIVATED_AT })).toBe(false);
  });

  it.each(ALL_STATUSES)("applicationStatus=%s, user state not loaded (undefined) -> fails closed", (applicationStatus) => {
    expect(isTutorBookable({ applicationStatus, userDeactivatedAt: undefined })).toBe(false);
  });

  it("missing applicationStatus fails closed even with an active user", () => {
    expect(isTutorBookable({ applicationStatus: undefined, userDeactivatedAt: null })).toBe(false);
    expect(isTutorBookable({ applicationStatus: null, userDeactivatedAt: null })).toBe(false);
  });
});

describe("BOOKABLE_TUTOR_WHERE", () => {
  it("is exactly APPROVED + account not deactivated, and nothing else", () => {
    expect(BOOKABLE_TUTOR_WHERE).toEqual({ applicationStatus: "APPROVED", user: { deactivatedAt: null } });
  });

  it("does not use tutorAgreementAcceptedAt as a bookability signal", () => {
    expect(JSON.stringify(BOOKABLE_TUTOR_WHERE)).not.toContain("tutorAgreementAcceptedAt");
  });
});
