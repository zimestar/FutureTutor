import { describe, it, expect } from "vitest";
import { computeStudentCapabilities } from "./studentAuthorization";

// Phase H.7 §42 — permanent unit tests for the conceptual actor/learner/
// payer mapping H.7's Server Action layer depends on. H.7 itself adds no
// new pure authorization logic (every real decision defers to H.2's
// already-unit-tested computeStudentCapabilities); what these tests
// protect against is a FUTURE change to H.2 silently breaking the exact
// capability shape H.7's actions assume — so this file re-asserts that
// shape from H.7's own point of view, not a duplicate of H.2's own suite.
// Given the current architecture is inherently DB-backed (every real H.7
// check is an integration concern — see
// learnerPayerWiring.integration.test.ts), this stays intentionally small
// per §42's own "do not over-abstract" instruction.

describe("H.7 actor/learner/payer capability mapping", () => {
  it("SELF_MANAGED: actor === learner's own User, learner === own StudentProfile, payer === same actor", () => {
    const caps = computeStudentCapabilities({
      studentExists: true,
      studentUserId: "user-self",
      managementMode: "SELF_MANAGED",
      actorUserId: "user-self",
      guardianRelationshipStatus: null,
    });
    // H.7's action layer treats canInitiatePaidBooking/canPayForStudent as
    // the single authoritative gate for both "may initiate" and "may pay"
    // — for a SELF_MANAGED actor booking themselves, both must be true.
    expect(caps.canInitiatePaidBooking).toBe(true);
    expect(caps.canPayForStudent).toBe(true);
  });

  it("PARENT: actor === Parent's User, learner === child's StudentProfile (a different id), payer === same Parent actor", () => {
    const caps = computeStudentCapabilities({
      studentExists: true,
      studentUserId: null, // the child has no login of their own — irrelevant to the Parent's own authority
      managementMode: "GUARDIAN_MANAGED",
      actorUserId: "user-parent",
      guardianRelationshipStatus: "ACTIVE",
    });
    expect(caps.canInitiatePaidBooking).toBe(true);
    expect(caps.canPayForStudent).toBe(true);
    // The actor (Parent) is never the learner's own linked User — H.7 must
    // never copy the Parent's id into a learner field, or vice versa; this
    // is what makes that structurally true at the capability layer.
    expect(caps.isLinkedStudentSelf).toBe(false);
  });

  it("GUARDIAN_MANAGED Student's own restricted login: denied for both initiate and pay, even though canActForStudent is true", () => {
    const caps = computeStudentCapabilities({
      studentExists: true,
      studentUserId: "user-restricted-student",
      managementMode: "GUARDIAN_MANAGED",
      actorUserId: "user-restricted-student",
      guardianRelationshipStatus: null,
    });
    expect(caps.canActForStudent).toBe(true);
    expect(caps.canInitiatePaidBooking).toBe(false);
    expect(caps.canPayForStudent).toBe(false);
  });

  it("REVOKED guardian: denied for both initiate and pay", () => {
    const caps = computeStudentCapabilities({
      studentExists: true,
      studentUserId: null,
      managementMode: "GUARDIAN_MANAGED",
      actorUserId: "user-former-guardian",
      guardianRelationshipStatus: "REVOKED",
    });
    expect(caps.canInitiatePaidBooking).toBe(false);
    expect(caps.canPayForStudent).toBe(false);
  });

  it("unrelated actor (no relationship at all): denied for both initiate and pay", () => {
    const caps = computeStudentCapabilities({
      studentExists: true,
      studentUserId: null,
      managementMode: "GUARDIAN_MANAGED",
      actorUserId: "user-stranger",
      guardianRelationshipStatus: null,
    });
    expect(caps.canInitiatePaidBooking).toBe(false);
    expect(caps.canPayForStudent).toBe(false);
  });

  it("a historical (ACTIVE-looking) guardian relationship to a now-SELF_MANAGED student is denied — SELF_MANAGED transition revokes guardian financial authority", () => {
    const caps = computeStudentCapabilities({
      studentExists: true,
      studentUserId: "user-now-adult",
      managementMode: "SELF_MANAGED",
      actorUserId: "user-former-guardian",
      guardianRelationshipStatus: "ACTIVE",
    });
    expect(caps.canInitiatePaidBooking).toBe(false);
    expect(caps.canPayForStudent).toBe(false);
  });
});
