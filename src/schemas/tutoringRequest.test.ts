import { describe, expect, it } from "vitest";
import { createTutoringRequestSchema } from "./tutoringRequest";

// RW-02 — createTutoringRequestSchema's tutoringMode is the ACTUAL session
// mode of one Quick Match request: exactly ONLINE or IN_PERSON.

const base = {
  studentProfileId: "student-1",
  subjectId: "subject-1",
  academicLevelId: "level-1",
  durationMinutes: 60,
  requestedStartAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
};
const address = { addressLine1: "1 Main St", city: "Ottawa", province: "ON", postalCode: "K1A0A1" };

describe("createTutoringRequestSchema — RW-02 actual tutoringMode", () => {
  it("accepts ONLINE (no address)", () => {
    const parsed = createTutoringRequestSchema.safeParse({ ...base, tutoringMode: "ONLINE" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.tutoringMode).toBe("ONLINE");
  });

  it("accepts IN_PERSON with a full address", () => {
    const parsed = createTutoringRequestSchema.safeParse({ ...base, tutoringMode: "IN_PERSON", ...address });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.tutoringMode).toBe("IN_PERSON");
  });

  it.each([
    ["BOTH", "BOTH"],
    ["BOTH with a full address", "BOTH"],
    ["empty string", ""],
    ["lowercase online", "online"],
    ["lowercase in_person", "in_person"],
    ["mixed case", "Online"],
    ["padded", " ONLINE "],
    ["unknown value", "HYBRID"],
    ["null", null],
    ["missing", undefined],
  ])("rejects %s", (label, tutoringMode) => {
    const input = label.includes("address") ? { ...base, tutoringMode, ...address } : { ...base, tutoringMode };
    const parsed = createTutoringRequestSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.path[0] === "tutoringMode")).toBe(true);
  });

  it("still rejects IN_PERSON without an address and ONLINE with one (unchanged superRefine)", () => {
    expect(createTutoringRequestSchema.safeParse({ ...base, tutoringMode: "IN_PERSON" }).success).toBe(false);
    expect(createTutoringRequestSchema.safeParse({ ...base, tutoringMode: "ONLINE", ...address }).success).toBe(false);
  });
});
