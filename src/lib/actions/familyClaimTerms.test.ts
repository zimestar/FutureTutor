import { beforeEach, describe, expect, it, vi } from "vitest";

// BETA-HARDEN1 — permanent regression coverage for the Terms-of-Service
// acceptance fix on claimWithNewAccountAction (src/lib/actions/family.ts).
// BETA-USER1 §20 #4 found this path — a brand-new, fully financially-capable
// Parent account created by claiming a GUARDIAN_LINK invitation — never
// captured Terms acceptance at all (termsAcceptedAt stayed permanently
// null), unlike ordinary direct signup (registerAction). This file proves:
// (a) a crafted request omitting termsAccepted is rejected before any
// account is created; (b) a well-formed request stamps the same three
// fields registerAction stamps, with the same values; (c) the sibling
// STUDENT_LOGIN claim path (claimStudentLoginWithNewAccountAction) is
// UNCHANGED — no termsAccepted requirement was added there, per the
// mission's explicit instruction to preserve that path's existing
// guardian-authority consent model.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  checkActionRateLimit: vi.fn(),
  findUniqueUser: vi.fn(),
  findUniqueInvitation: vi.fn(),
  createUserForSignup: vi.fn(),
  createStudentLoginUser: vi.fn(),
  claimGuardianInvitation: vi.fn(),
  claimStudentLoginInvitation: vi.fn(),
  hashInvitationToken: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
  getLocale: vi.fn().mockResolvedValue("en"),
}));
vi.mock("@/lib/rateLimit", () => ({
  checkActionRateLimit: mocks.checkActionRateLimit,
  getClientIp: vi.fn().mockReturnValue(null),
  RATE_LIMITS: { invitationClaimByIp: {} },
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth, signIn: mocks.signIn }));
vi.mock("@/lib/appUrl", () => ({ getAppBaseUrl: vi.fn().mockResolvedValue("http://localhost:3100") }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: mocks.findUniqueUser },
    familyInvitation: { findUnique: mocks.findUniqueInvitation },
  },
}));
vi.mock("@/services/signup", () => ({
  createUserForSignup: mocks.createUserForSignup,
  createStudentLoginUser: mocks.createStudentLoginUser,
}));
vi.mock("@/services/familyManagement", () => ({
  createGuardianManagedStudent: vi.fn(),
  createGuardianInvitation: vi.fn(),
  createStudentLoginInvitation: vi.fn(),
  claimGuardianInvitation: mocks.claimGuardianInvitation,
  claimStudentLoginInvitation: mocks.claimStudentLoginInvitation,
  approveFamilyInvitation: vi.fn(),
  rejectFamilyInvitationClaim: vi.fn(),
  revokeGuardianRelationship: vi.fn(),
  hashInvitationToken: mocks.hashInvitationToken,
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
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed-password") } }));

import { claimWithNewAccountAction, claimStudentLoginWithNewAccountAction } from "./family";
import { TERMS_VERSION } from "@/content/legal/termsContent.en";

function guardianClaimFormData(overrides: Partial<Record<string, string>> = {}) {
  const fd = new FormData();
  fd.set("token", "raw-token-abc");
  fd.set("firstName", "Beta");
  fd.set("lastName", "ParentClaim");
  fd.set("password", "SuperSecret123!");
  if (overrides.termsAccepted !== undefined) fd.set("termsAccepted", overrides.termsAccepted);
  return fd;
}

function studentLoginClaimFormData() {
  const fd = new FormData();
  fd.set("token", "raw-token-xyz");
  fd.set("firstName", "Beta");
  fd.set("lastName", "StudentClaim");
  fd.set("password", "SuperSecret123!");
  return fd;
}

describe("BETA-HARDEN1 — claimWithNewAccountAction Terms acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: true });
    mocks.hashInvitationToken.mockReturnValue("hashed-token");
    mocks.findUniqueInvitation.mockResolvedValue({
      type: "GUARDIAN_LINK",
      invitedEmailNormalized: "beta+parent@example.com",
    });
    mocks.findUniqueUser.mockResolvedValue(null); // no existing account
    mocks.createUserForSignup.mockResolvedValue({ id: "new-user-1", email: "beta+parent@example.com" });
    mocks.signIn.mockResolvedValue(undefined);
    mocks.claimGuardianInvitation.mockResolvedValue(undefined);
  });

  it("a crafted request omitting termsAccepted is rejected before any account is created", async () => {
    const result = await claimWithNewAccountAction(undefined, guardianClaimFormData());
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("a crafted request with an empty termsAccepted is rejected before any account is created", async () => {
    const result = await claimWithNewAccountAction(undefined, guardianClaimFormData({ termsAccepted: "" }));
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
  });

  it("a well-formed request with termsAccepted stamps the same fields registerAction stamps, with real values (not null)", async () => {
    const result = await claimWithNewAccountAction(undefined, guardianClaimFormData({ termsAccepted: "true" }));

    expect(mocks.createUserForSignup).toHaveBeenCalledTimes(1);
    const call = mocks.createUserForSignup.mock.calls[0][1];
    expect(call.role).toBe("PARENT");
    expect(call.termsAcceptedAt).toBeInstanceOf(Date);
    expect(call.termsAcceptedVersion).toBe(TERMS_VERSION);
    expect(call.termsAcceptedLocale).toBe("en");
    expect(result).toMatchObject({ success: true });
  });

  it("email is always taken from the invitation, never from a forged client field", async () => {
    const fd = guardianClaimFormData({ termsAccepted: "true" });
    fd.set("email", "attacker@evil.example"); // extraneous — not part of claimNewGuardianAccountSchema
    await claimWithNewAccountAction(undefined, fd);
    const call = mocks.createUserForSignup.mock.calls[0][1];
    expect(call.email).toBe("beta+parent@example.com"); // invitation.invitedEmailNormalized, not the forged field
  });
});

describe("BETA-HARDEN1 — claimStudentLoginWithNewAccountAction is unchanged (regression guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: true });
    mocks.hashInvitationToken.mockReturnValue("hashed-token");
    mocks.findUniqueInvitation.mockResolvedValue({
      type: "STUDENT_LOGIN",
      invitedEmailNormalized: "beta+student@example.com",
    });
    mocks.findUniqueUser.mockResolvedValue(null);
    mocks.createStudentLoginUser.mockResolvedValue({ id: "new-student-1", email: "beta+student@example.com" });
    mocks.signIn.mockResolvedValue(undefined);
    mocks.claimStudentLoginInvitation.mockResolvedValue(undefined);
  });

  it("succeeds WITHOUT a termsAccepted field — this mission does not add a Terms requirement to the restricted STUDENT_LOGIN claim path", async () => {
    const result = await claimStudentLoginWithNewAccountAction(undefined, studentLoginClaimFormData());
    expect(result).toMatchObject({ success: true });
    expect(mocks.createStudentLoginUser).toHaveBeenCalledTimes(1);
    const call = mocks.createStudentLoginUser.mock.calls[0][1];
    // createStudentLoginUser's input shape has no terms* fields at all —
    // confirming this path's account-creation call was not touched.
    expect(call).not.toHaveProperty("termsAcceptedAt");
    expect(call).not.toHaveProperty("termsAcceptedVersion");
    expect(call).not.toHaveProperty("termsAcceptedLocale");
  });
});
