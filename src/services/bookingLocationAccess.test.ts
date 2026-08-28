import { describe, it, expect } from "vitest";
import {
  computeExactLocationAccess,
  toApproximateLocationDto,
  toExactLocationDto,
  type BookingLocationSnapshotSource,
} from "./bookingLocationAccess";

function facts(overrides: Partial<Parameters<typeof computeExactLocationAccess>[0]> = {}) {
  return {
    bookingMode: "IN_PERSON" as const,
    bookingStatus: "CONFIRMED" as const,
    isBookingTutor: true,
    ...overrides,
  };
}

const SNAPSHOT: BookingLocationSnapshotSource = {
  bookingAddressLine1: "123 Main St",
  bookingAddressLine2: "Unit 4",
  bookingCity: "Toronto",
  bookingProvince: "ON",
  bookingPostalCode: "M5V2T6",
};

describe("computeExactLocationAccess", () => {
  it("IP-SEC-2: grants a CONFIRMED booking's own tutor", () => {
    expect(computeExactLocationAccess(facts())).toEqual({ granted: true });
  });

  it("grants a COMPLETED booking's own tutor (access already granted at CONFIRMED must not be revoked once the session is over)", () => {
    expect(computeExactLocationAccess(facts({ bookingStatus: "COMPLETED" }))).toEqual({ granted: true });
  });

  it("grants a NO_SHOW booking's own tutor (same reasoning — the tutor was legitimately booked)", () => {
    expect(computeExactLocationAccess(facts({ bookingStatus: "NO_SHOW" }))).toEqual({ granted: true });
  });

  it("IP-SEC-1: denies (not confirmed) a booking's own tutor while PENDING_PAYMENT", () => {
    expect(computeExactLocationAccess(facts({ bookingStatus: "PENDING_PAYMENT" }))).toEqual({
      granted: false,
      reason: "BOOKING_NOT_CONFIRMED",
    });
  });

  it("denies (not confirmed) a booking's own tutor while DRAFT", () => {
    expect(computeExactLocationAccess(facts({ bookingStatus: "DRAFT" }))).toEqual({
      granted: false,
      reason: "BOOKING_NOT_CONFIRMED",
    });
  });

  it("denies a booking's own tutor for every invalidated terminal status (never silently re-grants)", () => {
    for (const status of ["DECLINED", "CANCELLED", "REFUNDED", "RESCHEDULED"] as const) {
      expect(computeExactLocationAccess(facts({ bookingStatus: status }))).toEqual({
        granted: false,
        reason: "BOOKING_NOT_CONFIRMED",
      });
    }
  });

  it("IP-SEC-3/4/5: denies an unrelated/losing/expired-invitation tutor even on a CONFIRMED booking — checked before status", () => {
    expect(computeExactLocationAccess(facts({ isBookingTutor: false }))).toEqual({
      granted: false,
      reason: "NOT_BOOKING_TUTOR",
    });
  });

  it("denies for an ONLINE booking regardless of tutor/status (nothing to disclose)", () => {
    expect(computeExactLocationAccess(facts({ bookingMode: "ONLINE" }))).toEqual({
      granted: false,
      reason: "NOT_IN_PERSON",
    });
  });

  it("denies for a BOTH-mode booking (exact address disclosure only applies to a genuinely in-person session)", () => {
    expect(computeExactLocationAccess(facts({ bookingMode: "BOTH" }))).toEqual({
      granted: false,
      reason: "NOT_IN_PERSON",
    });
  });

  it("mode is checked before tutor-ownership (an unrelated tutor on an ONLINE booking gets NOT_IN_PERSON, not NOT_BOOKING_TUTOR)", () => {
    expect(computeExactLocationAccess(facts({ bookingMode: "ONLINE", isBookingTutor: false }))).toEqual({
      granted: false,
      reason: "NOT_IN_PERSON",
    });
  });
});

describe("location DTO projections", () => {
  it("IP-SEC-11/12: the approximate DTO never carries street address, unit, or full postal code", () => {
    const dto = toApproximateLocationDto(SNAPSHOT);
    expect(dto).toEqual({
      mode: "IN_PERSON",
      exactAddressAvailable: false,
      city: "Toronto",
      province: "ON",
      postalCodePrefix: "M5V",
    });
    expect(dto).not.toHaveProperty("addressLine1");
    expect(dto).not.toHaveProperty("addressLine2");
    expect(dto).not.toHaveProperty("postalCode");
  });

  it("approximate DTO handles a null postal code without throwing", () => {
    const dto = toApproximateLocationDto({ ...SNAPSHOT, bookingPostalCode: null });
    expect(dto.postalCodePrefix).toBeNull();
  });

  it("the exact DTO carries the full snapshot", () => {
    const dto = toExactLocationDto(SNAPSHOT);
    expect(dto).toEqual({
      mode: "IN_PERSON",
      exactAddressAvailable: true,
      addressLine1: "123 Main St",
      addressLine2: "Unit 4",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V2T6",
      country: "CA",
    });
  });
});
