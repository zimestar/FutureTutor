import { describe, it, expect } from "vitest";
import {
  computeSessionCheckInAuthority,
  computeSessionViewerAuthority,
  type SessionCheckInAuthorityFacts,
  type SessionViewerAuthorityFacts,
} from "./sessionAuthorization";

const booking = { studentProfileId: "student-1", tutorProfileUserId: "tutor-user-1" };

function checkInFacts(overrides: Partial<SessionCheckInAuthorityFacts>): SessionCheckInAuthorityFacts {
  return {
    actorUserId: "actor-1",
    participantRole: "STUDENT",
    booking,
    canActForStudent: false,
    isLinkedStudentSelf: false,
    hasActiveGuardianAuthority: false,
    managementMode: null,
    ...overrides,
  };
}

function viewerFacts(overrides: Partial<SessionViewerAuthorityFacts>): SessionViewerAuthorityFacts {
  return {
    actorUserId: "actor-1",
    actorRole: "STUDENT",
    booking,
    canActForStudent: false,
    isLinkedStudentSelf: false,
    hasActiveGuardianAuthority: false,
    managementMode: null,
    ...overrides,
  };
}

describe("computeSessionCheckInAuthority (pure)", () => {
  it("1. Tutor checking in as TUTOR, owns the booking -> TUTOR_OWNER", () => {
    expect(
      computeSessionCheckInAuthority(checkInFacts({ actorUserId: "tutor-user-1", participantRole: "TUTOR" }))
    ).toBe("TUTOR_OWNER");
  });

  it("2. Wrong Tutor checking in as TUTOR -> DENIED", () => {
    expect(
      computeSessionCheckInAuthority(checkInFacts({ actorUserId: "some-other-tutor", participantRole: "TUTOR" }))
    ).toBe("DENIED");
  });

  it("3. Student self, SELF_MANAGED, checking in as STUDENT -> SELF_MANAGED_STUDENT", () => {
    expect(
      computeSessionCheckInAuthority(
        checkInFacts({
          participantRole: "STUDENT",
          canActForStudent: true,
          isLinkedStudentSelf: true,
          managementMode: "SELF_MANAGED",
        })
      )
    ).toBe("SELF_MANAGED_STUDENT");
  });

  it("4. GUARDIAN_MANAGED student's own restricted login, checking in as STUDENT -> GUARDIAN_MANAGED_STUDENT_SELF", () => {
    expect(
      computeSessionCheckInAuthority(
        checkInFacts({
          participantRole: "STUDENT",
          canActForStudent: true,
          isLinkedStudentSelf: true,
          managementMode: "GUARDIAN_MANAGED",
        })
      )
    ).toBe("GUARDIAN_MANAGED_STUDENT_SELF");
  });

  it("5. Active guardian, checking in as STUDENT -> GUARDIAN", () => {
    expect(
      computeSessionCheckInAuthority(
        checkInFacts({ participantRole: "STUDENT", canActForStudent: true, hasActiveGuardianAuthority: true })
      )
    ).toBe("GUARDIAN");
  });

  it("6. Tutor declaring learner presence (owns booking, participantRole STUDENT) -> TUTOR_DECLARING_LEARNER", () => {
    expect(
      computeSessionCheckInAuthority(
        checkInFacts({ actorUserId: "tutor-user-1", participantRole: "STUDENT" })
      )
    ).toBe("TUTOR_DECLARING_LEARNER");
  });

  it("7. Tutor-owner branch is checked BEFORE H.2 capability — a tutor never needs canActForStudent", () => {
    expect(
      computeSessionCheckInAuthority(
        checkInFacts({
          actorUserId: "tutor-user-1",
          participantRole: "STUDENT",
          canActForStudent: false,
          isLinkedStudentSelf: false,
          hasActiveGuardianAuthority: false,
        })
      )
    ).toBe("TUTOR_DECLARING_LEARNER");
  });

  it("8. Revoked/no guardian relationship, checking in as STUDENT -> DENIED", () => {
    expect(
      computeSessionCheckInAuthority(checkInFacts({ participantRole: "STUDENT", canActForStudent: false }))
    ).toBe("DENIED");
  });

  it("9. Unrelated Parent (no relationship at all) -> DENIED", () => {
    expect(
      computeSessionCheckInAuthority(
        checkInFacts({ actorUserId: "unrelated-parent", participantRole: "STUDENT", canActForStudent: false })
      )
    ).toBe("DENIED");
  });

  it("10. Unrelated Student (not self, not guardian) -> DENIED", () => {
    expect(
      computeSessionCheckInAuthority(
        checkInFacts({ actorUserId: "unrelated-student", participantRole: "STUDENT", canActForStudent: false })
      )
    ).toBe("DENIED");
  });

  it("11. Student trying to check in AS TUTOR -> DENIED (participantRole TUTOR only ever authorizes the owning tutor)", () => {
    expect(
      computeSessionCheckInAuthority(
        checkInFacts({ actorUserId: "student-user-1", participantRole: "TUTOR", canActForStudent: true, isLinkedStudentSelf: true, managementMode: "SELF_MANAGED" })
      )
    ).toBe("DENIED");
  });
});

describe("computeSessionViewerAuthority (pure)", () => {
  it("ADMIN -> ADMIN regardless of any other fact", () => {
    expect(computeSessionViewerAuthority(viewerFacts({ actorRole: "ADMIN", actorUserId: "unrelated" }))).toBe(
      "ADMIN"
    );
  });

  it("SUPER_ADMIN -> SUPER_ADMIN regardless of any other fact", () => {
    expect(computeSessionViewerAuthority(viewerFacts({ actorRole: "SUPER_ADMIN" }))).toBe("SUPER_ADMIN");
  });

  it("Owning Tutor -> TUTOR_OWNER", () => {
    expect(
      computeSessionViewerAuthority(viewerFacts({ actorRole: "TUTOR", actorUserId: "tutor-user-1" }))
    ).toBe("TUTOR_OWNER");
  });

  it("Wrong Tutor -> DENIED", () => {
    expect(
      computeSessionViewerAuthority(viewerFacts({ actorRole: "TUTOR", actorUserId: "some-other-tutor" }))
    ).toBe("DENIED");
  });

  it("SELF_MANAGED student self -> SELF_MANAGED_STUDENT", () => {
    expect(
      computeSessionViewerAuthority(
        viewerFacts({ actorRole: "STUDENT", canActForStudent: true, isLinkedStudentSelf: true, managementMode: "SELF_MANAGED" })
      )
    ).toBe("SELF_MANAGED_STUDENT");
  });

  it("Active guardian -> GUARDIAN", () => {
    expect(
      computeSessionViewerAuthority(viewerFacts({ actorRole: "PARENT", canActForStudent: true, hasActiveGuardianAuthority: true }))
    ).toBe("GUARDIAN");
  });

  it("Unrelated actor -> DENIED", () => {
    expect(computeSessionViewerAuthority(viewerFacts({ actorRole: "STUDENT", canActForStudent: false }))).toBe(
      "DENIED"
    );
  });
});
