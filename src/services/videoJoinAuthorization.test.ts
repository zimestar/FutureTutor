import { describe, it, expect } from "vitest";
import {
  computeVideoJoinAuthority,
  toVideoParticipantRole,
  computeVideoJoinWindowEligibility,
  type VideoJoinAuthorityFacts,
} from "./videoJoinAuthorization";

const JOIN_WINDOW_MS = 15 * 60 * 1000;
const GRACE_WINDOW_MS = 10 * 60 * 1000;

const BOOKING = { studentProfileId: "student-1", tutorProfileUserId: "tutor-user-1" };

function facts(overrides: Partial<VideoJoinAuthorityFacts> = {}): VideoJoinAuthorityFacts {
  return {
    actorUserId: "actor-1",
    actorRole: "STUDENT",
    booking: BOOKING,
    isLinkedStudentSelf: false,
    hasActiveGuardianAuthority: false,
    ...overrides,
  };
}

describe("computeVideoJoinAuthority", () => {
  it("TUTOR_OWNER: the booking's own tutor user", () => {
    expect(
      computeVideoJoinAuthority(facts({ actorUserId: "tutor-user-1", actorRole: "TUTOR" }))
    ).toBe("TUTOR_OWNER");
  });

  it("SELF_MANAGED_STUDENT: the booking's own linked student", () => {
    expect(
      computeVideoJoinAuthority(facts({ actorUserId: "student-user-1", actorRole: "STUDENT", isLinkedStudentSelf: true }))
    ).toBe("SELF_MANAGED_STUDENT");
  });

  it("GUARDIAN_OBSERVER: an actor with ACTIVE guardian authority over the booking's student", () => {
    expect(
      computeVideoJoinAuthority(facts({ actorUserId: "parent-user-1", actorRole: "PARENT", hasActiveGuardianAuthority: true }))
    ).toBe("GUARDIAN_OBSERVER");
  });

  it("DENIED: a REVOKED guardian (hasActiveGuardianAuthority=false is exactly what a revoked relationship resolves to)", () => {
    expect(
      computeVideoJoinAuthority(facts({ actorUserId: "parent-user-1", actorRole: "PARENT", hasActiveGuardianAuthority: false }))
    ).toBe("DENIED");
  });

  it("DENIED: an unrelated parent (no guardian authority, not the student)", () => {
    expect(
      computeVideoJoinAuthority(facts({ actorUserId: "unrelated-parent", actorRole: "PARENT" }))
    ).toBe("DENIED");
  });

  it("DENIED: an unrelated student (not linked, no guardian authority)", () => {
    expect(
      computeVideoJoinAuthority(facts({ actorUserId: "unrelated-student", actorRole: "STUDENT" }))
    ).toBe("DENIED");
  });

  it("DENIED: an unrelated tutor (not this booking's tutor)", () => {
    expect(
      computeVideoJoinAuthority(facts({ actorUserId: "other-tutor-user", actorRole: "TUTOR" }))
    ).toBe("DENIED");
  });

  it("DENIED: ADMIN — explicit, unconditional, VIDEO-1A product decision (checked before every other branch)", () => {
    expect(
      computeVideoJoinAuthority(
        facts({ actorUserId: "tutor-user-1", actorRole: "ADMIN", isLinkedStudentSelf: true, hasActiveGuardianAuthority: true })
      )
    ).toBe("DENIED");
  });

  it("DENIED: SUPER_ADMIN — same unconditional denial as ADMIN", () => {
    expect(computeVideoJoinAuthority(facts({ actorRole: "SUPER_ADMIN" }))).toBe("DENIED");
  });

  it("GUARDIAN_MANAGED_STUDENT_SELF is reachable via isLinkedStudentSelf regardless of guardian authority", () => {
    expect(
      computeVideoJoinAuthority(facts({ actorUserId: "gm-student-user", actorRole: "STUDENT", isLinkedStudentSelf: true }))
    ).toBe("SELF_MANAGED_STUDENT"); // computeVideoJoinAuthority itself does not distinguish self-managed vs guardian-managed self — see toVideoParticipantRole below for why that distinction doesn't matter downstream
  });
});

describe("toVideoParticipantRole", () => {
  it("maps TUTOR_OWNER -> TUTOR", () => {
    expect(toVideoParticipantRole("TUTOR_OWNER")).toBe("TUTOR");
  });
  it("maps SELF_MANAGED_STUDENT -> STUDENT", () => {
    expect(toVideoParticipantRole("SELF_MANAGED_STUDENT")).toBe("STUDENT");
  });
  it("maps GUARDIAN_MANAGED_STUDENT_SELF -> STUDENT", () => {
    expect(toVideoParticipantRole("GUARDIAN_MANAGED_STUDENT_SELF")).toBe("STUDENT");
  });
  it("maps GUARDIAN_OBSERVER -> OBSERVER", () => {
    expect(toVideoParticipantRole("GUARDIAN_OBSERVER")).toBe("OBSERVER");
  });
  it("maps DENIED -> null", () => {
    expect(toVideoParticipantRole("DENIED")).toBeNull();
  });
});

describe("computeVideoJoinWindowEligibility", () => {
  const startAt = new Date("2026-09-15T14:00:00.000Z");
  const endAt = new Date("2026-09-15T15:00:00.000Z");

  function windowInput(overrides: Partial<Parameters<typeof computeVideoJoinWindowEligibility>[0]> = {}) {
    return {
      bookingStatus: "CONFIRMED",
      bookingStartAt: startAt,
      bookingEndAt: endAt,
      bookingMode: "ONLINE" as const,
      sessionStatus: "SCHEDULED" as const,
      now: startAt,
      joinWindowMsBeforeStart: JOIN_WINDOW_MS,
      graceWindowMsAfterEnd: GRACE_WINDOW_MS,
      ...overrides,
    };
  }

  it("BOOKING_NOT_CONFIRMED for a non-CONFIRMED booking, regardless of timing", () => {
    expect(computeVideoJoinWindowEligibility(windowInput({ bookingStatus: "PENDING_PAYMENT" }))).toBe(
      "BOOKING_NOT_CONFIRMED"
    );
  });

  it("VIDEO_NOT_SUPPORTED_FOR_BOOKING for an IN_PERSON booking", () => {
    expect(computeVideoJoinWindowEligibility(windowInput({ bookingMode: "IN_PERSON" }))).toBe(
      "VIDEO_NOT_SUPPORTED_FOR_BOOKING"
    );
  });

  it("accepts a BOTH-mode booking (null/no rejection) at a valid instant", () => {
    expect(computeVideoJoinWindowEligibility(windowInput({ bookingMode: "BOTH" }))).toBeNull();
  });

  it("VIDEO_NOT_SUPPORTED_FOR_BOOKING for a CANCELLED session", () => {
    expect(computeVideoJoinWindowEligibility(windowInput({ sessionStatus: "CANCELLED" }))).toBe(
      "VIDEO_NOT_SUPPORTED_FOR_BOOKING"
    );
  });

  it("VIDEO_TOO_EARLY exactly 1ms before the join window opens", () => {
    const windowOpensAt = new Date(startAt.getTime() - JOIN_WINDOW_MS);
    expect(
      computeVideoJoinWindowEligibility(windowInput({ now: new Date(windowOpensAt.getTime() - 1) }))
    ).toBe("VIDEO_TOO_EARLY");
  });

  it("accepts exactly at the join-window-open boundary (>= semantics, no instant falls into two branches)", () => {
    const windowOpensAt = new Date(startAt.getTime() - JOIN_WINDOW_MS);
    expect(computeVideoJoinWindowEligibility(windowInput({ now: windowOpensAt }))).toBeNull();
  });

  it("accepts at Booking.startAt itself", () => {
    expect(computeVideoJoinWindowEligibility(windowInput({ now: startAt }))).toBeNull();
  });

  it("accepts at Booking.endAt itself (grace window has not yet started but hasn't closed either)", () => {
    expect(computeVideoJoinWindowEligibility(windowInput({ now: endAt }))).toBeNull();
  });

  it("accepts exactly at the grace-window-close boundary (<= semantics)", () => {
    const windowClosesAt = new Date(endAt.getTime() + GRACE_WINDOW_MS);
    expect(computeVideoJoinWindowEligibility(windowInput({ now: windowClosesAt }))).toBeNull();
  });

  it("VIDEO_WINDOW_CLOSED exactly 1ms after the grace window closes", () => {
    const windowClosesAt = new Date(endAt.getTime() + GRACE_WINDOW_MS);
    expect(
      computeVideoJoinWindowEligibility(windowInput({ now: new Date(windowClosesAt.getTime() + 1) }))
    ).toBe("VIDEO_WINDOW_CLOSED");
  });

  it("VIDEO_WINDOW_CLOSED well after the grace window", () => {
    expect(
      computeVideoJoinWindowEligibility(windowInput({ now: new Date(endAt.getTime() + 3 * 60 * 60 * 1000) }))
    ).toBe("VIDEO_WINDOW_CLOSED");
  });

  it("BOOKING_NOT_CONFIRMED is checked before VIDEO_TOO_EARLY (status gate takes precedence over timing)", () => {
    const wayTooEarly = new Date(startAt.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(
      computeVideoJoinWindowEligibility(windowInput({ bookingStatus: "DRAFT", now: wayTooEarly }))
    ).toBe("BOOKING_NOT_CONFIRMED");
  });
});
