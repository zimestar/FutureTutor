import { describe, it, expect } from "vitest";
import { computeStudentCapabilities, type StudentCapabilityFacts } from "./studentAuthorization";

// Phase H.2 — permanent unit tests for the pure policy decision matrix (see
// the Phase H planning report's "Permanent Security Regression Tests"
// section, and the H.2 implementation prompt's required test list §24).
// Zero database involvement — computeStudentCapabilities is pure, so every
// scenario below is expressed directly as input facts, exactly as the fetch
// layer (resolveStudentCapabilities) would have assembled them from real
// rows. Cross-family/IDOR fetch-layer correctness (tests 17-20 and the
// transaction-client test 22 from the required list) are covered separately
// in studentAuthorization.integration.test.ts, since those specifically
// test that the DATABASE query joins correctly scope to the right
// actor+student pair — not something a pure function over pre-resolved
// facts can meaningfully exercise.

const ACTOR = "user_actor";
const OTHER_STUDENT_USER = "user_a_different_students_own_login";

function facts(overrides: Partial<StudentCapabilityFacts>): StudentCapabilityFacts {
  return {
    studentExists: true,
    studentUserId: null,
    managementMode: "SELF_MANAGED",
    actorUserId: ACTOR,
    guardianRelationshipStatus: null,
    ...overrides,
  };
}

describe("computeStudentCapabilities — SELF_MANAGED", () => {
  it("1. linked Student User can manage self", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "SELF_MANAGED" })
    );
    expect(result.canManageStudentAccount).toBe(true);
  });

  it("2. linked Student User can initiate paid booking", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "SELF_MANAGED" })
    );
    expect(result.canInitiatePaidBooking).toBe(true);
  });

  it("3. linked Student User can pay for self", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "SELF_MANAGED" })
    );
    expect(result.canPayForStudent).toBe(true);
  });

  it("4. historical ACTIVE guardian relationship cannot manage a SELF_MANAGED student", () => {
    // The actor is NOT the linked student (a different user id than
    // studentUserId), and even though a relationship row with status
    // ACTIVE still exists (the "former guardian" case), managementMode is
    // SELF_MANAGED — the mode gate must reject this regardless of the
    // relationship's status.
    const result = computeStudentCapabilities(
      facts({ studentUserId: OTHER_STUDENT_USER, managementMode: "SELF_MANAGED", guardianRelationshipStatus: "ACTIVE" })
    );
    expect(result.canManageStudentAccount).toBe(false);
  });

  it("5. historical ACTIVE guardian cannot initiate paid booking for a SELF_MANAGED student", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: OTHER_STUDENT_USER, managementMode: "SELF_MANAGED", guardianRelationshipStatus: "ACTIVE" })
    );
    expect(result.canInitiatePaidBooking).toBe(false);
  });

  it("6. historical ACTIVE guardian cannot pay for a SELF_MANAGED student", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: OTHER_STUDENT_USER, managementMode: "SELF_MANAGED", guardianRelationshipStatus: "ACTIVE" })
    );
    expect(result.canPayForStudent).toBe(false);
  });
});

describe("computeStudentCapabilities — GUARDIAN_MANAGED", () => {
  it("7. ACTIVE guardian can manage student", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: null, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: "ACTIVE" })
    );
    expect(result.canManageStudentAccount).toBe(true);
  });

  it("8. ACTIVE guardian can initiate paid booking", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: null, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: "ACTIVE" })
    );
    expect(result.canInitiatePaidBooking).toBe(true);
  });

  it("9. ACTIVE guardian can pay", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: null, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: "ACTIVE" })
    );
    expect(result.canPayForStudent).toBe(true);
  });

  it("10. REVOKED guardian cannot manage", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: null, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: "REVOKED" })
    );
    expect(result.canManageStudentAccount).toBe(false);
  });

  it("11. REVOKED guardian cannot initiate paid booking", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: null, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: "REVOKED" })
    );
    expect(result.canInitiatePaidBooking).toBe(false);
  });

  it("12. REVOKED guardian cannot pay", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: null, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: "REVOKED" })
    );
    expect(result.canPayForStudent).toBe(false);
  });

  it("13. unrelated Parent (no relationship row at all) cannot act", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: null, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: null })
    );
    expect(result.canActForStudent).toBe(false);
    expect(result.canManageStudentAccount).toBe(false);
    expect(result.canInitiatePaidBooking).toBe(false);
    expect(result.canPayForStudent).toBe(false);
  });

  it("14. restricted Student login cannot manage account", () => {
    // The student's own restricted login: studentUserId === actorUserId,
    // but managementMode is GUARDIAN_MANAGED — having a login does NOT
    // convert this into self-authority.
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: null })
    );
    expect(result.canManageStudentAccount).toBe(false);
  });

  it("15. restricted Student login cannot initiate paid booking", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: null })
    );
    expect(result.canInitiatePaidBooking).toBe(false);
  });

  it("16. restricted Student login cannot pay", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: null })
    );
    expect(result.canPayForStudent).toBe(false);
  });

  it("restricted Student login CAN still view their own basic data (canActForStudent) even though management/financial authority is denied", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: null })
    );
    expect(result.canActForStudent).toBe(true);
    expect(result.canManageStudentAccount).toBe(false);
    expect(result.canInitiatePaidBooking).toBe(false);
  });
});

describe("computeStudentCapabilities — LEGACY_UNKNOWN (test 21: fails closed)", () => {
  it("21a. LEGACY_UNKNOWN denies financial authority even for the linked self", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "LEGACY_UNKNOWN", guardianRelationshipStatus: null })
    );
    expect(result.canInitiatePaidBooking).toBe(false);
    expect(result.canPayForStudent).toBe(false);
  });

  it("21b. LEGACY_UNKNOWN denies account-management authority even for the linked self", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "LEGACY_UNKNOWN", guardianRelationshipStatus: null })
    );
    expect(result.canManageStudentAccount).toBe(false);
  });

  it("21c. LEGACY_UNKNOWN denies guardian-derived authority even with an ACTIVE relationship row", () => {
    // Confirms the mode gate applies to LEGACY_UNKNOWN too, not just
    // SELF_MANAGED — a relationship being ACTIVE is never sufficient on
    // its own.
    const result = computeStudentCapabilities(
      facts({ studentUserId: OTHER_STUDENT_USER, managementMode: "LEGACY_UNKNOWN", guardianRelationshipStatus: "ACTIVE" })
    );
    expect(result.hasActiveGuardianAuthority).toBe(false);
    expect(result.canManageStudentAccount).toBe(false);
    expect(result.canInitiatePaidBooking).toBe(false);
    expect(result.canPayForStudent).toBe(false);
  });

  it("21d. LEGACY_UNKNOWN still allows pure self-view (canActForStudent) for the linked self", () => {
    // Deliberate, documented asymmetry: viewing one's own basic profile is
    // not treated as an authority-sensitive decision the way
    // management/financial actions are.
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "LEGACY_UNKNOWN", guardianRelationshipStatus: null })
    );
    expect(result.canActForStudent).toBe(true);
  });
});

describe("computeStudentCapabilities — BETA-OPS1 suspended actor", () => {
  it("22a. suspended SELF_MANAGED student loses financial authority", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "SELF_MANAGED", actorDeactivatedAt: new Date() })
    );
    expect(result.canInitiatePaidBooking).toBe(false);
    expect(result.canPayForStudent).toBe(false);
  });

  it("22b. suspended SELF_MANAGED student loses account-management authority", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "SELF_MANAGED", actorDeactivatedAt: new Date() })
    );
    expect(result.canManageStudentAccount).toBe(false);
  });

  it("22c. suspended SELF_MANAGED student KEEPS pure self-view (canActForStudent) — suspension blocks new commitments, not historical access", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "SELF_MANAGED", actorDeactivatedAt: new Date() })
    );
    expect(result.canActForStudent).toBe(true);
  });

  it("22d. suspended guardian loses financial authority over a GUARDIAN_MANAGED child", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: null, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: "ACTIVE", actorDeactivatedAt: new Date() })
    );
    expect(result.canInitiatePaidBooking).toBe(false);
    expect(result.canPayForStudent).toBe(false);
    expect(result.canManageStudentAccount).toBe(false);
  });

  it("22e. a suspended guardian does NOT free the child to self-manage — hasActiveGuardianAuthority and canActForStudent are unaffected by suspension", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: null, managementMode: "GUARDIAN_MANAGED", guardianRelationshipStatus: "ACTIVE", actorDeactivatedAt: new Date() })
    );
    expect(result.hasActiveGuardianAuthority).toBe(true);
    expect(result.canActForStudent).toBe(true);
  });

  it("22f. an active (non-suspended) actor is unaffected — actorDeactivatedAt: null behaves identically to omitting it", () => {
    const result = computeStudentCapabilities(
      facts({ studentUserId: ACTOR, managementMode: "SELF_MANAGED", actorDeactivatedAt: null })
    );
    expect(result.canInitiatePaidBooking).toBe(true);
  });
});

describe("computeStudentCapabilities — unknown/missing student (fail closed)", () => {
  it("denies every capability when the StudentProfile does not exist", () => {
    const result = computeStudentCapabilities(
      facts({ studentExists: false, studentUserId: null, managementMode: null, guardianRelationshipStatus: null })
    );
    expect(result.canActForStudent).toBe(false);
    expect(result.canManageStudentAccount).toBe(false);
    expect(result.canInitiatePaidBooking).toBe(false);
    expect(result.canPayForStudent).toBe(false);
    expect(result.hasActiveGuardianAuthority).toBe(false);
  });
});
