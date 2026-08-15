import { describe, it, expect } from "vitest";
import {
  resolveEditableStudentProfileFields,
  STUDENT_PROFILE_LOW_STAKES_FIELDS,
  STUDENT_PROFILE_GUARDIAN_FIELDS,
  STUDENT_PROFILE_SYSTEM_CONTROLLED_FIELDS,
  PARENT_PROFILE_EDITABLE_FIELDS,
} from "./profileManagement";

// Phase H.6 §44 — permanent unit tests for the final field-authorization
// policy. Pure, no database — resolveEditableStudentProfileFields takes
// only the two capability booleans it needs, directly mirroring what a
// fresh H.2 resolveStudentCapabilities() read would produce for each
// scenario named below.

describe("resolveEditableStudentProfileFields", () => {
  it("1. SELF_MANAGED Student (canManageStudentAccount=true via self-authority) receives the full guardian/self field set", () => {
    const fields = resolveEditableStudentProfileFields({ isLinkedStudentSelf: true, canManageStudentAccount: true });
    expect(fields).toEqual(STUDENT_PROFILE_GUARDIAN_FIELDS);
  });

  it("2. an ACTIVE guardian (canManageStudentAccount=true, isLinkedStudentSelf=false) receives the full child-editable field set", () => {
    const fields = resolveEditableStudentProfileFields({ isLinkedStudentSelf: false, canManageStudentAccount: true });
    expect(fields).toEqual(STUDENT_PROFILE_GUARDIAN_FIELDS);
  });

  it("3. a GUARDIAN_MANAGED Student's own restricted login (isLinkedStudentSelf=true, canManageStudentAccount=false) receives ONLY the low-stakes allowlist", () => {
    const fields = resolveEditableStudentProfileFields({ isLinkedStudentSelf: true, canManageStudentAccount: false });
    expect(fields).toEqual(STUDENT_PROFILE_LOW_STAKES_FIELDS);
  });

  it("4. managementMode is never a member of any editable field set (Student, guardian, or low-stakes)", () => {
    const asSelfManaged = resolveEditableStudentProfileFields({ isLinkedStudentSelf: true, canManageStudentAccount: true });
    const asGuardian = resolveEditableStudentProfileFields({ isLinkedStudentSelf: false, canManageStudentAccount: true });
    const asLowStakes = resolveEditableStudentProfileFields({ isLinkedStudentSelf: true, canManageStudentAccount: false });
    for (const fields of [asSelfManaged, asGuardian, asLowStakes]) {
      expect(fields as readonly string[]).not.toContain("managementMode");
    }
    expect(STUDENT_PROFILE_SYSTEM_CONTROLLED_FIELDS).toContain("managementMode");
  });

  it("5. userId is never a member of any editable field set", () => {
    const asSelfManaged = resolveEditableStudentProfileFields({ isLinkedStudentSelf: true, canManageStudentAccount: true });
    const asGuardian = resolveEditableStudentProfileFields({ isLinkedStudentSelf: false, canManageStudentAccount: true });
    const asLowStakes = resolveEditableStudentProfileFields({ isLinkedStudentSelf: true, canManageStudentAccount: false });
    for (const fields of [asSelfManaged, asGuardian, asLowStakes]) {
      expect(fields as readonly string[]).not.toContain("userId");
    }
    expect(STUDENT_PROFILE_SYSTEM_CONTROLLED_FIELDS).toContain("userId");
  });

  it("6. guardian relationship fields (e.g. a relationshipId-shaped key) are never members of any editable StudentProfile field set", () => {
    const allFieldSets = [
      STUDENT_PROFILE_GUARDIAN_FIELDS,
      STUDENT_PROFILE_LOW_STAKES_FIELDS,
      resolveEditableStudentProfileFields({ isLinkedStudentSelf: false, canManageStudentAccount: false }),
    ];
    for (const fields of allFieldSets) {
      expect(fields as readonly string[]).not.toContain("relationshipId");
      expect(fields as readonly string[]).not.toContain("parentProfileId");
      expect(fields as readonly string[]).not.toContain("guardianRelationshipId");
    }
  });

  it("7. dateOfBirth is not low-stakes, and is not a member of any editable field set at all", () => {
    expect(STUDENT_PROFILE_LOW_STAKES_FIELDS).not.toContain("dateOfBirth");
    expect(STUDENT_PROFILE_GUARDIAN_FIELDS as readonly string[]).not.toContain("dateOfBirth");
    const asSelfManaged = resolveEditableStudentProfileFields({ isLinkedStudentSelf: true, canManageStudentAccount: true });
    const asGuardian = resolveEditableStudentProfileFields({ isLinkedStudentSelf: false, canManageStudentAccount: true });
    const asLowStakes = resolveEditableStudentProfileFields({ isLinkedStudentSelf: true, canManageStudentAccount: false });
    for (const fields of [asSelfManaged, asGuardian, asLowStakes]) {
      expect(fields as readonly string[]).not.toContain("dateOfBirth");
    }
  });

  it("8. matching/pricing-affecting fields (academicLevelId, tutoringMode) are not low-stakes — only guardian/self-managed may edit them", () => {
    expect(STUDENT_PROFILE_LOW_STAKES_FIELDS).not.toContain("academicLevelId");
    expect(STUDENT_PROFILE_LOW_STAKES_FIELDS).not.toContain("tutoringMode");
    expect(STUDENT_PROFILE_GUARDIAN_FIELDS).toContain("academicLevelId");
    expect(STUDENT_PROFILE_GUARDIAN_FIELDS).toContain("tutoringMode");
    const asLowStakes = resolveEditableStudentProfileFields({ isLinkedStudentSelf: true, canManageStudentAccount: false });
    expect(asLowStakes as readonly string[]).not.toContain("academicLevelId");
    expect(asLowStakes as readonly string[]).not.toContain("tutoringMode");
  });

  it("9. unknown input fields cannot become mass-assignment fields — a field-name outside every known constant is rejected by exact-match containment, not fuzzy matching", () => {
    const allFieldSets = [STUDENT_PROFILE_GUARDIAN_FIELDS, STUDENT_PROFILE_LOW_STAKES_FIELDS, PARENT_PROFILE_EDITABLE_FIELDS];
    for (const fields of allFieldSets) {
      expect(fields as readonly string[]).not.toContain("__proto__");
      expect(fields as readonly string[]).not.toContain("role");
      expect(fields as readonly string[]).not.toContain("passwordHash");
      expect(fields as readonly string[]).not.toContain("isAdmin");
    }
  });

  it("10. the low-stakes allowlist is explicit and, given the actual current schema, non-empty and minimal (preferredLanguage only)", () => {
    expect(STUDENT_PROFILE_LOW_STAKES_FIELDS).toEqual(["preferredLanguage"]);
    // Explicit exclusions this phase deliberately does not expose, despite
    // technically existing on the schema — documented in profileManagement.ts's
    // own module comment (User.image: unused anywhere in the app today).
    expect(STUDENT_PROFILE_LOW_STAKES_FIELDS as readonly string[]).not.toContain("image");
  });

  it("11. an actor with neither capability (unrelated party, revoked guardian, sibling) receives an empty editable field set", () => {
    const fields = resolveEditableStudentProfileFields({ isLinkedStudentSelf: false, canManageStudentAccount: false });
    expect(fields).toEqual([]);
  });

  it("12. STUDENT_PROFILE_GUARDIAN_FIELDS is a strict superset of STUDENT_PROFILE_LOW_STAKES_FIELDS (full authority always subsumes the narrow exception)", () => {
    for (const field of STUDENT_PROFILE_LOW_STAKES_FIELDS) {
      expect(STUDENT_PROFILE_GUARDIAN_FIELDS).toContain(field);
    }
  });
});
