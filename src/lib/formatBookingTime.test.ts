import { describe, expect, it } from "vitest";
import { formatBookingTime } from "./utils";

// DESIGN-SYSTEM2 — booking times carry a readable zone label, never a raw IANA id.
describe("formatBookingTime", () => {
  const start = new Date("2026-08-14T13:00:00Z");

  it("shows the time in the booking's own zone with a Canadian short label", () => {
    expect(formatBookingTime(start, "America/Toronto", "fr")).toContain("09 h 00 HAE");
    expect(formatBookingTime(start, "America/Edmonton", "fr")).toContain("07 h 00 HAR");
    expect(formatBookingTime(start, "America/Toronto", "en")).toContain("EDT");
  });

  it("never prints the raw zone identifier", () => {
    expect(formatBookingTime(start, "America/Toronto", "fr")).not.toContain("America");
    expect(formatBookingTime(start, "America/Toronto", "en")).not.toContain("Toronto");
  });
});
