import { describe, it, expect } from "vitest";
import { computeCancellationAuthority, type CancellationAuthorityFacts } from "./cancellationAuthorization";

const booking = { studentProfileId: "student-1", tutorProfileUserId: "tutor-user-1" };

function facts(overrides: Partial<CancellationAuthorityFacts>): CancellationAuthorityFacts {
  return {
    actorUserId: "actor-1",
    actorRole: "STUDENT",
    booking,
    canPayForStudent: false,
    isSelfManagedStudentSelf: false,
    ...overrides,
  };
}

describe("computeCancellationAuthority (pure)", () => {
  it("11. SELF_MANAGED self -> SELF_MANAGED_STUDENT", () => {
    expect(
      computeCancellationAuthority(
        facts({ actorRole: "STUDENT", canPayForStudent: true, isSelfManagedStudentSelf: true })
      )
    ).toBe("SELF_MANAGED_STUDENT");
  });

  it("12. GUARDIAN_MANAGED, ACTIVE relationship -> GUARDIAN", () => {
    expect(
      computeCancellationAuthority(
        facts({ actorRole: "PARENT", canPayForStudent: true, isSelfManagedStudentSelf: false })
      )
    ).toBe("GUARDIAN");
  });

  it("13. GUARDIAN_MANAGED, REVOKED relationship -> DENIED", () => {
    expect(
      computeCancellationAuthority(facts({ actorRole: "PARENT", canPayForStudent: false }))
    ).toBe("DENIED");
  });

  it("14. GUARDIAN_MANAGED student's own restricted login -> DENIED (permanent regression guard)", () => {
    // canPayForStudent is false for this case per H.2 itself; isSelfManagedStudentSelf
    // is irrelevant once canPayForStudent is false — DENIED either way.
    expect(
      computeCancellationAuthority(
        facts({ actorRole: "STUDENT", canPayForStudent: false, isSelfManagedStudentSelf: false })
      )
    ).toBe("DENIED");
  });

  it("15. Unrelated actor (no relationship at all) -> DENIED", () => {
    expect(computeCancellationAuthority(facts({ actorRole: "PARENT", canPayForStudent: false }))).toBe("DENIED");
  });

  it("16. Tutor, own booking -> TUTOR_OWNER", () => {
    expect(
      computeCancellationAuthority(
        facts({ actorRole: "TUTOR", actorUserId: "tutor-user-1", canPayForStudent: false })
      )
    ).toBe("TUTOR_OWNER");
  });

  it("17. Tutor, another tutor's booking -> DENIED", () => {
    expect(
      computeCancellationAuthority(
        facts({ actorRole: "TUTOR", actorUserId: "some-other-tutor-user", canPayForStudent: false })
      )
    ).toBe("DENIED");
  });

  it("18a. ADMIN -> ADMIN regardless of any student/guardian/tutor facts", () => {
    expect(
      computeCancellationAuthority(
        facts({ actorRole: "ADMIN", actorUserId: "tutor-user-1" /* even if actor IS the tutor */ })
      )
    ).toBe("ADMIN");
  });

  it("18b. SUPER_ADMIN -> SUPER_ADMIN regardless of any student/guardian/tutor facts", () => {
    expect(computeCancellationAuthority(facts({ actorRole: "SUPER_ADMIN" }))).toBe("SUPER_ADMIN");
  });

  it("19. LEGACY_UNKNOWN management mode -> DENIED (mirrors H.2's fail-closed precedent)", () => {
    // Represented here as canPayForStudent === false, exactly what H.2's
    // own computeStudentCapabilities produces for LEGACY_UNKNOWN.
    expect(computeCancellationAuthority(facts({ actorRole: "STUDENT", canPayForStudent: false }))).toBe("DENIED");
  });

  it("admin branch is checked before tutor-ownership branch", () => {
    expect(
      computeCancellationAuthority(facts({ actorRole: "ADMIN", actorUserId: "unrelated-actor" }))
    ).toBe("ADMIN");
  });
});
