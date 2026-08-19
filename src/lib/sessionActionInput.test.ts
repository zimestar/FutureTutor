import { describe, expect, it } from "vitest";
import { parseInterruptionActionInput, parseSessionActionIdentity } from "./sessionActionInput";

describe("SUI-3 Session action input firewall", () => {
  it("completion accepts identity only and ignores client lifecycle claims", () => {
    const formData = new FormData();
    formData.set("bookingId", "booking-1");
    formData.set("locale", "fr");
    formData.set("status", "COMPLETED");
    formData.set("completedAt", "2000-01-01T00:00:00.000Z");
    expect(parseSessionActionIdentity(formData)).toEqual({ bookingId: "booking-1", locale: "fr" });
  });

  it("interruption accepts only identity and the backend-supported optional free-text reason", () => {
    const formData = new FormData();
    formData.set("bookingId", "booking-1");
    formData.set("locale", "en");
    formData.set("reason", "Connection could not continue");
    formData.set("status", "INTERRUPTED");
    formData.set("endedAt", "2000-01-01T00:00:00.000Z");
    formData.set("actorUserId", "forged-user");
    expect(parseInterruptionActionInput(formData)).toEqual({ bookingId: "booking-1", locale: "en", reason: "Connection could not continue" });
  });

  it("fails closed without a booking identity and normalizes unsupported locales to English", () => {
    expect(parseSessionActionIdentity(new FormData())).toBeNull();
    const formData = new FormData();
    formData.set("bookingId", "booking-1");
    formData.set("locale", "es");
    expect(parseSessionActionIdentity(formData)).toEqual({ bookingId: "booking-1", locale: "en" });
  });
});
