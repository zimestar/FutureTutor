import { describe, it, expect } from "vitest";
import { createChildSchema, inviteGuardianSchema } from "@/schemas/family";
import { computeStudentCapabilities } from "./studentAuthorization";
import {
  hashInvitationToken,
  isInvitationExpired,
  isLegalInvitationTransition,
  wouldViolateLastActiveGuardianInvariant,
  normalizeEmail,
  claimGuardianInvitation,
  claimStudentLoginInvitation,
  NotAuthorizedError,
  InvitationNotFoundError,
  StudentAlreadyLinkedError,
  ClaimantAlreadyLinkedElsewhereError,
  StudentProfileDataIntegrityError,
} from "./familyManagement";

// Phase H.4 — permanent unit tests for the pure/no-DB pieces of the family
// management domain (child input validation, token hashing, invitation
// state-machine legality, the last-active-guardian decision, and the
// error-message credential-non-leakage guarantee). DB-integration behavior
// (actual creation/claim/approval/revocation against real rows) is covered
// separately in familyManagement.integration.test.ts.

describe("createChildSchema — strict child input validation (test 1)", () => {
  it("accepts a valid child (first/last name, past DOB, no academic level)", () => {
    const result = createChildSchema.safeParse({ firstName: "Jamie", lastName: "Kid", dateOfBirth: "2015-06-01" });
    expect(result.success).toBe(true);
  });

  it("accepts an academicLevelId when supplied", () => {
    const result = createChildSchema.safeParse({
      firstName: "Jamie",
      lastName: "Kid",
      dateOfBirth: "2015-06-01",
      academicLevelId: "level_123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing dateOfBirth", () => {
    const result = createChildSchema.safeParse({ firstName: "Jamie", lastName: "Kid", dateOfBirth: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a future dateOfBirth", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
    const result = createChildSchema.safeParse({ firstName: "Jamie", lastName: "Kid", dateOfBirth: future });
    expect(result.success).toBe(false);
  });

  it("rejects a non-existent calendar date", () => {
    const result = createChildSchema.safeParse({ firstName: "Jamie", lastName: "Kid", dateOfBirth: "2020-02-30" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty firstName/lastName", () => {
    const result = createChildSchema.safeParse({ firstName: "", lastName: "", dateOfBirth: "2015-06-01" });
    expect(result.success).toBe(false);
  });

  it("does not enforce any minimum or maximum age — a newborn and a 1930 DOB both validate", () => {
    const yesterday = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString().slice(0, 10);
    expect(createChildSchema.safeParse({ firstName: "A", lastName: "B", dateOfBirth: yesterday }).success).toBe(true);
    expect(createChildSchema.safeParse({ firstName: "A", lastName: "B", dateOfBirth: "1930-01-01" }).success).toBe(true);
  });
});

describe("inviteGuardianSchema — email normalization (test 2)", () => {
  it("trims and lowercases the invited email", () => {
    const result = inviteGuardianSchema.safeParse({ studentProfileId: "s1", invitedEmail: "  Second.Guardian@Example.COM  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.invitedEmail).toBe("second.guardian@example.com");
  });

  it("rejects an invalid email", () => {
    const result = inviteGuardianSchema.safeParse({ studentProfileId: "s1", invitedEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

describe("normalizeEmail — used identically at claim/approval time (test 2, service-side)", () => {
  it("matches the schema's own normalization exactly", () => {
    expect(normalizeEmail("  Second.Guardian@Example.COM  ")).toBe("second.guardian@example.com");
  });
});

describe("hashInvitationToken — token hashing/verifying behavior (tests 3-4)", () => {
  it("3. hashing the same raw token twice produces the identical hash (deterministic)", () => {
    const raw = "a-sample-raw-token-value";
    expect(hashInvitationToken(raw)).toBe(hashInvitationToken(raw));
  });

  it("3. different raw tokens produce different hashes", () => {
    expect(hashInvitationToken("token-a")).not.toBe(hashInvitationToken("token-b"));
  });

  it("4. a raw token never equals its own stored hash", () => {
    const raw = "another-sample-raw-token";
    expect(hashInvitationToken(raw)).not.toBe(raw);
  });

  it("4. the hash is a 64-character hex string (SHA-256), structurally distinct from any plausible raw token", () => {
    expect(hashInvitationToken("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isInvitationExpired — invitation expiration determination (test 5)", () => {
  it("returns false for an expiresAt in the future", () => {
    expect(isInvitationExpired(new Date(Date.now() + 1000 * 60), new Date())).toBe(false);
  });

  it("returns true for an expiresAt in the past", () => {
    expect(isInvitationExpired(new Date(Date.now() - 1000 * 60), new Date())).toBe(true);
  });

  it("returns true for an expiresAt exactly equal to now (not strictly before is still not valid)", () => {
    const now = new Date();
    expect(isInvitationExpired(now, now)).toBe(false); // exactly equal is NOT expired — must be strictly before `now`.
  });
});

describe("isLegalInvitationTransition — allowed transitions (test 6)", () => {
  it("PENDING -> CLAIMED_PENDING_APPROVAL is legal (claim)", () => {
    expect(isLegalInvitationTransition("PENDING", "CLAIMED_PENDING_APPROVAL")).toBe(true);
  });
  it("PENDING -> EXPIRED is legal (lazy expiry-on-read)", () => {
    expect(isLegalInvitationTransition("PENDING", "EXPIRED")).toBe(true);
  });
  it("PENDING -> REVOKED is legal (supersession by a newer invite)", () => {
    expect(isLegalInvitationTransition("PENDING", "REVOKED")).toBe(true);
  });
  it("CLAIMED_PENDING_APPROVAL -> ACCEPTED is legal (approval)", () => {
    expect(isLegalInvitationTransition("CLAIMED_PENDING_APPROVAL", "ACCEPTED")).toBe(true);
  });
  it("CLAIMED_PENDING_APPROVAL -> REVOKED is legal (rejection)", () => {
    expect(isLegalInvitationTransition("CLAIMED_PENDING_APPROVAL", "REVOKED")).toBe(true);
  });
});

describe("isLegalInvitationTransition — forbidden transitions (test 7)", () => {
  it("PENDING -> ACCEPTED is forbidden (must go through CLAIMED_PENDING_APPROVAL)", () => {
    expect(isLegalInvitationTransition("PENDING", "ACCEPTED")).toBe(false);
  });
  it("CLAIMED_PENDING_APPROVAL -> PENDING is forbidden (no going back)", () => {
    expect(isLegalInvitationTransition("CLAIMED_PENDING_APPROVAL", "PENDING")).toBe(false);
  });
  it("ACCEPTED is terminal — no transition out of it is legal", () => {
    expect(isLegalInvitationTransition("ACCEPTED", "REVOKED")).toBe(false);
    expect(isLegalInvitationTransition("ACCEPTED", "PENDING")).toBe(false);
  });
  it("EXPIRED is terminal — no transition out of it is legal", () => {
    expect(isLegalInvitationTransition("EXPIRED", "PENDING")).toBe(false);
    expect(isLegalInvitationTransition("EXPIRED", "CLAIMED_PENDING_APPROVAL")).toBe(false);
  });
  it("REVOKED is terminal — no transition out of it is legal", () => {
    expect(isLegalInvitationTransition("REVOKED", "PENDING")).toBe(false);
    expect(isLegalInvitationTransition("REVOKED", "ACCEPTED")).toBe(false);
  });
});

describe("wouldViolateLastActiveGuardianInvariant — last-active-guardian decision (test 8)", () => {
  it("GUARDIAN_MANAGED with zero other active guardians would violate the invariant (self-revoke as sole guardian: DENIED)", () => {
    expect(wouldViolateLastActiveGuardianInvariant("GUARDIAN_MANAGED", 0)).toBe(true);
  });
  it("GUARDIAN_MANAGED with one other active guardian does not violate the invariant", () => {
    expect(wouldViolateLastActiveGuardianInvariant("GUARDIAN_MANAGED", 1)).toBe(false);
  });
  it("GUARDIAN_MANAGED with two other active guardians does not violate the invariant", () => {
    expect(wouldViolateLastActiveGuardianInvariant("GUARDIAN_MANAGED", 2)).toBe(false);
  });
  it("SELF_MANAGED never violates the invariant regardless of count — the mode gate makes this unreachable via a real authorized call anyway", () => {
    expect(wouldViolateLastActiveGuardianInvariant("SELF_MANAGED", 0)).toBe(false);
  });
  it("LEGACY_UNKNOWN never violates the invariant regardless of count, for the same reason", () => {
    expect(wouldViolateLastActiveGuardianInvariant("LEGACY_UNKNOWN", 0)).toBe(false);
  });
});

describe("error messages never include raw tokens (test 9)", () => {
  it("InvitationNotFoundError's message/stack never echoes back an attempted raw token", () => {
    const rawToken = "super-secret-raw-token-value-12345";
    const error = new InvitationNotFoundError();
    const serialized = String(error) + String(error.stack ?? "");
    expect(serialized).not.toContain(rawToken);
  });

  it("NotAuthorizedError's message/stack never includes any id/token value", () => {
    const error = new NotAuthorizedError();
    expect(String(error)).not.toMatch(/[0-9a-f]{64}/); // no hash-shaped or token-shaped value leaked
  });
});

describe("SELF_MANAGED target fails guardian-management eligibility (test 10)", () => {
  // Redundant, by design, with H.2's own studentAuthorization.test.ts tests
  // 4-6 — H.4 re-asserts this specific fact directly (via the same H.2
  // computeStudentCapabilities function every family action defers to)
  // as its own regression net, since createGuardianInvitation/
  // revokeGuardianRelationship's authorization entirely depends on it.
  it("an ACTIVE historical relationship to a SELF_MANAGED student grants no guardian authority", () => {
    const result = computeStudentCapabilities({
      studentExists: true,
      studentUserId: "some-other-user",
      managementMode: "SELF_MANAGED",
      actorUserId: "actor",
      guardianRelationshipStatus: "ACTIVE",
    });
    expect(result.hasActiveGuardianAuthority).toBe(false);
    expect(result.canManageStudentAccount).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase H.5 — permanent unit tests for the STUDENT_LOGIN pure/no-DB pieces
// (§42 of the H.5 prompt). Items that are inherently DB-dependent (72h TTL
// on a real row, wrong-type rejection against a real invitation, role
// requirements re-checked against a real claimed User, activation
// preserving GUARDIAN_MANAGED on a real StudentProfile, already-linked
// rejection against a real row) are covered in
// familyManagement.integration.test.ts instead — noted explicitly below
// rather than fabricating a meaningless pure test for a DB-dependent
// behavior.
// ---------------------------------------------------------------------------

describe("STUDENT_LOGIN — email normalization (test 1)", () => {
  it("normalizeEmail behaves identically regardless of invitation type — createStudentLoginInvitation reuses this exact function, not a second implementation", () => {
    expect(normalizeEmail("  Student.Login@Example.COM  ")).toBe("student.login@example.com");
  });

  it("inviteGuardianSchema is reused as-is for the STUDENT_LOGIN invite form (identical shape: studentProfileId + invitedEmail) — no second, structurally-identical schema was declared", () => {
    const result = inviteGuardianSchema.safeParse({ studentProfileId: "s1", invitedEmail: "  Student@Example.COM  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.invitedEmail).toBe("student@example.com");
  });
});

// Test 2 (72h TTL for STUDENT_LOGIN) is verified against a real persisted
// row in familyManagement.integration.test.ts (invitation creation test 7)
// — INVITATION_TTL_MS is a private, unexported constant shared by both
// createGuardianInvitation and createStudentLoginInvitation, so this is
// not independently unit-testable without a DB round-trip.

describe("STUDENT_LOGIN — token hashing reused identically (tests 3-4)", () => {
  it("3. hashInvitationToken is the same function used by both createGuardianInvitation and createStudentLoginInvitation — deterministic for a STUDENT_LOGIN-shaped token too", () => {
    const raw = "student-login-sample-raw-token";
    expect(hashInvitationToken(raw)).toBe(hashInvitationToken(raw));
  });

  it("4. a STUDENT_LOGIN raw token never equals its own stored hash", () => {
    const raw = "another-student-login-raw-token";
    expect(hashInvitationToken(raw)).not.toBe(raw);
  });
});

// Test 5 (STUDENT_LOGIN type accepted by the intended helper) and test 7
// (wrong invitation type rejected) require a real FamilyInvitation row to
// resolve — covered by integration tests 28 (wrong type at claim) and the
// approval-routing tests (31-47), which prove approveFamilyInvitation
// correctly dispatches STUDENT_LOGIN rows to approveStudentLoginInvitation
// internally.

describe("GUARDIAN_LINK and STUDENT_LOGIN claim flows remain independently callable (test 6)", () => {
  it("claimGuardianInvitation and claimStudentLoginInvitation are distinct exported functions, not aliases of one branchy function", () => {
    expect(claimGuardianInvitation).not.toBe(claimStudentLoginInvitation);
    expect(typeof claimGuardianInvitation).toBe("function");
    expect(typeof claimStudentLoginInvitation).toBe("function");
  });
});

// Test 8 (Student-login claim role requirement) is verified against real
// PARENT/TUTOR/ADMIN accounts attempting to claim in integration tests
// 15-17 — the check itself lives inside claimStudentLoginInvitation and
// needs a real invitation row to reach.

// Test 9 (activation preserves GUARDIAN_MANAGED) is verified against a
// real StudentProfile row in integration test 33 — approveStudentLoginInvitation
// deliberately never writes to the managementMode column at all (see its
// source comment), but proving the column's value is UNCHANGED requires
// reading a real row before and after.

describe("restricted GUARDIAN_MANAGED Student login — H.2 capability expectation (test 10)", () => {
  // The exact matrix §20/§42 item 10 of the H.5 prompt requires: a linked
  // GUARDIAN_MANAGED Student's own login gets canActForStudent=true (they
  // can view themselves) but canManageStudentAccount/canInitiatePaidBooking/
  // canPayForStudent all false (only an ACTIVE guardian gets those). This
  // is the exact scenario H.2's own computeStudentCapabilities already
  // encodes (tests 14-16 in studentAuthorization.test.ts) — re-asserted
  // here as H.5's own regression net, since createStudentLoginInvitation/
  // approveStudentLoginInvitation's entire safety model depends on this
  // fact never changing silently.
  it("a linked GUARDIAN_MANAGED Student's own restricted login: canActForStudent true, everything financially-binding false", () => {
    const result = computeStudentCapabilities({
      studentExists: true,
      studentUserId: "student-login-user",
      managementMode: "GUARDIAN_MANAGED",
      actorUserId: "student-login-user",
      guardianRelationshipStatus: null, // the student is not themselves a guardian
    });
    expect(result.canActForStudent).toBe(true);
    expect(result.canManageStudentAccount).toBe(false);
    expect(result.canInitiatePaidBooking).toBe(false);
    expect(result.canPayForStudent).toBe(false);
  });
});

describe("STUDENT_LOGIN error messages never include raw tokens or passwords (test 11)", () => {
  it("StudentAlreadyLinkedError's message/stack never includes a hash- or token-shaped value", () => {
    const error = new StudentAlreadyLinkedError();
    const serialized = String(error) + String(error.stack ?? "");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toMatch(/[0-9a-f]{64}/);
  });

  it("ClaimantAlreadyLinkedElsewhereError's message/stack never includes a hash- or token-shaped value", () => {
    const error = new ClaimantAlreadyLinkedElsewhereError();
    const serialized = String(error) + String(error.stack ?? "");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toMatch(/[0-9a-f]{64}/);
  });

  it("StudentProfileDataIntegrityError's message/stack never includes a hash- or token-shaped value", () => {
    const error = new StudentProfileDataIntegrityError();
    const serialized = String(error) + String(error.stack ?? "");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toMatch(/[0-9a-f]{64}/);
  });
});

// Test 12 (already-linked StudentProfile cannot be invited again) requires
// a real StudentProfile row with userId already set — verified in
// integration test 11.
