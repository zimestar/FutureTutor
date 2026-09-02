import { beforeEach, describe, expect, it, vi } from "vitest";

// BETA-LAUNCHFIX1 — permanent regression coverage for createChildAction's
// new field-specific validation feedback (the AddChildForm P1 fix). Proves
// each invalid field surfaces its own translated message, a valid
// submission is unaffected, and authorization/data-integrity boundaries
// (PARENT-only, real service call for the actual write) remain exactly as
// they were.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createGuardianManagedStudent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
  getLocale: vi.fn().mockResolvedValue("en"),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/services/familyManagement", () => ({
  createGuardianManagedStudent: mocks.createGuardianManagedStudent,
  NotAuthorizedError: class NotAuthorizedError extends Error {},
  ParentProfileMissingError: class ParentProfileMissingError extends Error {},
  InvitationNotFoundError: class InvitationNotFoundError extends Error {},
  InvitationWrongTypeError: class InvitationWrongTypeError extends Error {},
  InvitationNotPendingError: class InvitationNotPendingError extends Error {},
  InvitationNotClaimedError: class InvitationNotClaimedError extends Error {},
  InvitationExpiredError: class InvitationExpiredError extends Error {},
  InvitationAlreadyClaimedError: class InvitationAlreadyClaimedError extends Error {},
  ClaimantNotEligibleError: class ClaimantNotEligibleError extends Error {},
  EmailMismatchError: class EmailMismatchError extends Error {},
  ConcurrentApprovalError: class ConcurrentApprovalError extends Error {},
  RelationshipNotFoundError: class RelationshipNotFoundError extends Error {},
  LastActiveGuardianError: class LastActiveGuardianError extends Error {},
  CannotRevokeOtherGuardianError: class CannotRevokeOtherGuardianError extends Error {},
  StudentAlreadyLinkedError: class StudentAlreadyLinkedError extends Error {},
  ClaimantAlreadyLinkedElsewhereError: class ClaimantAlreadyLinkedElsewhereError extends Error {},
  StudentProfileDataIntegrityError: class StudentProfileDataIntegrityError extends Error {},
  createGuardianInvitation: vi.fn(),
  createStudentLoginInvitation: vi.fn(),
  claimGuardianInvitation: vi.fn(),
  claimStudentLoginInvitation: vi.fn(),
  approveFamilyInvitation: vi.fn(),
  rejectFamilyInvitationClaim: vi.fn(),
  revokeGuardianRelationship: vi.fn(),
  hashInvitationToken: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/rateLimit", () => ({
  checkActionRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: { invitationClaimByIp: { max: 10, windowMs: 1000 } },
}));
vi.mock("@/lib/appUrl", () => ({ getAppBaseUrl: vi.fn().mockResolvedValue("https://futuretutor.ca") }));
vi.mock("@/services/signup", () => ({ createUserForSignup: vi.fn(), createStudentLoginUser: vi.fn() }));
vi.mock("@/services/emailVerification", () => ({ sendVerificationEmailForAccount: vi.fn() }));
vi.mock("@/lib/email/sendVerificationEmail", () => ({ resolveSendVerificationEmail: vi.fn() }));

import { createChildAction } from "./family";

function sessionFor(role: "PARENT" | "STUDENT" | "TUTOR", userId = "parent-1") {
  return { user: { id: userId, role } };
}

function childFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const fields: Record<string, string> = {
    firstName: "Alex",
    lastName: "Example",
    dateOfBirth: "2015-05-01",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("createChildAction — BETA-LAUNCHFIX1 field-specific validation feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(sessionFor("PARENT"));
    mocks.createGuardianManagedStudent.mockResolvedValue({ id: "student-1" });
  });

  it("a blank firstName surfaces a firstName-specific field error", async () => {
    const result = await createChildAction(undefined, childFormData({ firstName: "" }));
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(result?.fieldErrors?.firstName).toBe("firstNameInvalid");
    expect(result?.fieldErrors?.lastName).toBeUndefined();
    expect(mocks.createGuardianManagedStudent).not.toHaveBeenCalled();
  });

  it("a blank lastName surfaces a lastName-specific field error", async () => {
    const result = await createChildAction(undefined, childFormData({ lastName: "" }));
    expect(result?.fieldErrors?.lastName).toBe("lastNameInvalid");
    expect(result?.fieldErrors?.firstName).toBeUndefined();
  });

  it("a future dateOfBirth surfaces a dateOfBirth-specific field error", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10);
    const result = await createChildAction(undefined, childFormData({ dateOfBirth: future }));
    expect(result?.fieldErrors?.dateOfBirth).toBe("dateOfBirthInvalid");
  });

  it("an unparseable dateOfBirth surfaces a dateOfBirth-specific field error", async () => {
    const result = await createChildAction(undefined, childFormData({ dateOfBirth: "not-a-date" }));
    expect(result?.fieldErrors?.dateOfBirth).toBe("dateOfBirthInvalid");
  });

  it("multiple invalid fields each surface their own error simultaneously", async () => {
    const result = await createChildAction(undefined, childFormData({ firstName: "", lastName: "", dateOfBirth: "bad" }));
    expect(result?.fieldErrors?.firstName).toBe("firstNameInvalid");
    expect(result?.fieldErrors?.lastName).toBe("lastNameInvalid");
    expect(result?.fieldErrors?.dateOfBirth).toBe("dateOfBirthInvalid");
  });

  it("a valid submission produces no field errors and reaches the real service call", async () => {
    const result = await createChildAction(undefined, childFormData());
    expect(result).toEqual({ success: true });
    expect(mocks.createGuardianManagedStudent).toHaveBeenCalledWith(
      expect.anything(),
      "parent-1",
      expect.objectContaining({ firstName: "Alex", lastName: "Example" })
    );
  });

  it("academicLevelId is optional — omitting it entirely is valid, no field error", async () => {
    const result = await createChildAction(undefined, childFormData());
    expect(result?.fieldErrors?.academicLevelId).toBeUndefined();
    expect(result).toEqual({ success: true });
  });

  it("BETA-LAUNCHFIX1 regression: authorization is unchanged — a non-PARENT session is rejected before validation, with no fieldErrors leaking through", async () => {
    mocks.auth.mockResolvedValue(sessionFor("STUDENT"));
    const result = await createChildAction(undefined, childFormData({ firstName: "" }));
    expect(result).toEqual({ error: "notAuthorized" });
    expect(result?.fieldErrors).toBeUndefined();
    expect(mocks.createGuardianManagedStudent).not.toHaveBeenCalled();
  });

  it("BETA-LAUNCHFIX1 regression: an unauthenticated request is rejected before validation", async () => {
    mocks.auth.mockResolvedValue(null);
    const result = await createChildAction(undefined, childFormData());
    expect(result).toEqual({ error: "notAuthorized" });
    expect(mocks.createGuardianManagedStudent).not.toHaveBeenCalled();
  });
});
