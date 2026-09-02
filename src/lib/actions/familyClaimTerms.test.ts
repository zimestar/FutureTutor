import { beforeEach, describe, expect, it, vi } from "vitest";

// BETA-HARDEN1 / BETA-EMAILVERIFY1 — permanent regression coverage for
// claimWithNewAccountAction's Terms-of-Service fix (BETA-HARDEN1) and its
// email-verification requirement (BETA-EMAILVERIFY1). This file proves:
// (a) a crafted request omitting termsAccepted is rejected before any
// account is created; (b) a well-formed request stamps the same three
// Terms fields registerAction stamps; (c) a brand-new account created via
// either claim path now requires email verification — no auto sign-in, a
// verification email is sent, and the result is tagged
// requiresVerification: true; (d) the sibling STUDENT_LOGIN claim path
// (claimStudentLoginWithNewAccountAction) still requires NO Terms
// acceptance, per the mission's explicit instruction to preserve that
// path's existing guardian-authority consent model, but DOES now require
// email verification like every other newly-credentialed account.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkActionRateLimit: vi.fn(),
  findUniqueUser: vi.fn(),
  findUniqueInvitation: vi.fn(),
  createUserForSignup: vi.fn(),
  createStudentLoginUser: vi.fn(),
  claimGuardianInvitation: vi.fn(),
  claimStudentLoginInvitation: vi.fn(),
  hashInvitationToken: vi.fn(),
  sendVerificationEmailForAccount: vi.fn(),
  resolveSendVerificationEmail: vi.fn(),
  getAppBaseUrl: vi.fn(),
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
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/appUrl", () => ({ getAppBaseUrl: mocks.getAppBaseUrl }));
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
// BETA-EMAILVERIFY1 — family.ts now imports these two modules unconditionally
// (both claim-with-new-account paths send a verification email); mocked
// here for the same reason every other "server-only" module in this file
// is mocked — a real import would pull in server-only-guarded code these
// plain-function unit tests don't have the request scope for.
vi.mock("@/services/emailVerification", () => ({
  sendVerificationEmailForAccount: mocks.sendVerificationEmailForAccount,
}));
vi.mock("@/lib/email/sendVerificationEmail", () => ({
  resolveSendVerificationEmail: mocks.resolveSendVerificationEmail,
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
  const resolvedSendEmail = vi.fn();

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
    mocks.claimGuardianInvitation.mockResolvedValue(undefined);
    mocks.getAppBaseUrl.mockResolvedValue("http://localhost:3100");
    mocks.resolveSendVerificationEmail.mockReturnValue(resolvedSendEmail);
    mocks.sendVerificationEmailForAccount.mockResolvedValue(undefined);
  });

  it("a crafted request omitting termsAccepted is rejected before any account is created", async () => {
    const result = await claimWithNewAccountAction(undefined, guardianClaimFormData());
    expect(result).toMatchObject({ error: "invalidInput" });
    expect(mocks.createUserForSignup).not.toHaveBeenCalled();
    expect(mocks.sendVerificationEmailForAccount).not.toHaveBeenCalled();
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

// BETA-EMAILVERIFY1 — the brand-new account this action creates must prove
// email ownership before normal authenticated access, exactly like ordinary
// signup. Claiming the invitation (moving it to CLAIMED_PENDING_APPROVAL)
// still happens — that's a separate fact ("this account holds the
// invitation token") from email ownership, and neither grants guardian
// authority on its own (that still requires the original guardian's
// separate approval, unchanged by this mission).
describe("BETA-EMAILVERIFY1 — claimWithNewAccountAction requires email verification", () => {
  const resolvedSendEmail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkActionRateLimit.mockResolvedValue({ allowed: true });
    mocks.hashInvitationToken.mockReturnValue("hashed-token");
    mocks.findUniqueInvitation.mockResolvedValue({
      type: "GUARDIAN_LINK",
      invitedEmailNormalized: "beta+parent@example.com",
    });
    mocks.findUniqueUser.mockResolvedValue(null);
    mocks.createUserForSignup.mockResolvedValue({ id: "new-user-1", email: "beta+parent@example.com" });
    mocks.claimGuardianInvitation.mockResolvedValue(undefined);
    mocks.getAppBaseUrl.mockResolvedValue("http://localhost:3100");
    mocks.resolveSendVerificationEmail.mockReturnValue(resolvedSendEmail);
    mocks.sendVerificationEmailForAccount.mockResolvedValue(undefined);
  });

  it("sends a verification email for the newly-created account", async () => {
    await claimWithNewAccountAction(undefined, guardianClaimFormData({ termsAccepted: "true" }));
    expect(mocks.sendVerificationEmailForAccount).toHaveBeenCalledTimes(1);
    const [, user] = mocks.sendVerificationEmailForAccount.mock.calls[0];
    expect(user).toEqual({ id: "new-user-1", email: "beta+parent@example.com" });
  });

  it("builds a locale-aware absolute activation URL using the request's own origin", async () => {
    await claimWithNewAccountAction(undefined, guardianClaimFormData({ termsAccepted: "true" }));
    const deps = mocks.sendVerificationEmailForAccount.mock.calls[0][2];
    expect(deps.buildVerifyUrl("raw-token-abc")).toBe("http://localhost:3100/en/verify-email?token=raw-token-abc");
    expect(deps.sendEmail).toBe(resolvedSendEmail);
  });

  it("returns requiresVerification: true alongside success", async () => {
    const result = await claimWithNewAccountAction(undefined, guardianClaimFormData({ termsAccepted: "true" }));
    expect(result).toEqual({ success: true, requiresVerification: true });
  });

  it("still claims the invitation (unchanged) even though the account isn't verified yet — claiming and verification are independent facts", async () => {
    await claimWithNewAccountAction(undefined, guardianClaimFormData({ termsAccepted: "true" }));
    expect(mocks.claimGuardianInvitation).toHaveBeenCalledWith(expect.anything(), "raw-token-abc", {
      id: "new-user-1",
      role: "PARENT",
      email: "beta+parent@example.com",
    });
  });

  it("does not lose the account or the claim when the verification email fails to send", async () => {
    mocks.sendVerificationEmailForAccount.mockRejectedValue(new Error("Resend outage"));

    const result = await claimWithNewAccountAction(undefined, guardianClaimFormData({ termsAccepted: "true" }));

    expect(mocks.createUserForSignup).toHaveBeenCalledTimes(1);
    expect(mocks.claimGuardianInvitation).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, requiresVerification: true });
  });
});

describe("BETA-HARDEN1 — claimStudentLoginWithNewAccountAction is unchanged for Terms (regression guard)", () => {
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
    mocks.claimStudentLoginInvitation.mockResolvedValue(undefined);
    mocks.getAppBaseUrl.mockResolvedValue("http://localhost:3100");
    mocks.resolveSendVerificationEmail.mockReturnValue(vi.fn());
    mocks.sendVerificationEmailForAccount.mockResolvedValue(undefined);
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

// BETA-EMAILVERIFY1 — this restricted STUDENT_LOGIN account still requires
// email verification (it's a brand-new User receiving login credentials),
// even though it requires no Terms acceptance. Verification proves only
// email ownership — it must never convert GUARDIAN_MANAGED to
// SELF_MANAGED, and family-approval semantics (the separate guardian
// approval step) are entirely unaffected.
describe("BETA-EMAILVERIFY1 — claimStudentLoginWithNewAccountAction requires email verification", () => {
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
    mocks.claimStudentLoginInvitation.mockResolvedValue(undefined);
    mocks.getAppBaseUrl.mockResolvedValue("http://localhost:3100");
    mocks.resolveSendVerificationEmail.mockReturnValue(vi.fn());
    mocks.sendVerificationEmailForAccount.mockResolvedValue(undefined);
  });

  it("sends a verification email and returns requiresVerification: true", async () => {
    const result = await claimStudentLoginWithNewAccountAction(undefined, studentLoginClaimFormData());
    expect(mocks.sendVerificationEmailForAccount).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, requiresVerification: true });
  });

  it("still claims the STUDENT_LOGIN invitation (unchanged) — verification never grants family approval or converts managementMode itself; that remains claimStudentLoginInvitation/approval's own concern, untouched here", async () => {
    await claimStudentLoginWithNewAccountAction(undefined, studentLoginClaimFormData());
    expect(mocks.claimStudentLoginInvitation).toHaveBeenCalledWith(expect.anything(), "raw-token-xyz", {
      id: "new-student-1",
      role: "STUDENT",
      email: "beta+student@example.com",
    });
  });
});
