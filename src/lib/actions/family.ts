"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getTranslations, getLocale } from "next-intl/server";
import { auth, signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/appUrl";
import { checkActionRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import {
  createChildSchema,
  inviteGuardianSchema,
  approveInvitationSchema,
  rejectInvitationSchema,
  revokeGuardianSchema,
  claimInvitationSchema,
  claimNewAccountSchema,
  claimNewGuardianAccountSchema,
} from "@/schemas/family";
import { TERMS_VERSION } from "@/content/legal/termsContent.en";
import { createUserForSignup, createStudentLoginUser } from "@/services/signup";
import {
  createGuardianManagedStudent,
  createGuardianInvitation,
  createStudentLoginInvitation,
  claimGuardianInvitation,
  claimStudentLoginInvitation,
  approveFamilyInvitation,
  rejectFamilyInvitationClaim,
  revokeGuardianRelationship,
  hashInvitationToken,
  NotAuthorizedError,
  ParentProfileMissingError,
  InvitationNotFoundError,
  InvitationWrongTypeError,
  InvitationNotPendingError,
  InvitationNotClaimedError,
  InvitationExpiredError,
  InvitationAlreadyClaimedError,
  ClaimantNotEligibleError,
  EmailMismatchError,
  ConcurrentApprovalError,
  RelationshipNotFoundError,
  LastActiveGuardianError,
  CannotRevokeOtherGuardianError,
  StudentAlreadyLinkedError,
  ClaimantAlreadyLinkedElsewhereError,
  StudentProfileDataIntegrityError,
} from "@/services/familyManagement";
import bcrypt from "bcryptjs";

export type FamilyActionState = { error?: string; success?: boolean } | undefined;

export type InviteGuardianState =
  | { success: true; inviteUrl: string; expiresAt: string }
  | { success: false; error: string }
  | undefined;

function mapErrorToKey(error: unknown): string {
  if (error instanceof NotAuthorizedError) return "notAuthorized";
  if (error instanceof ParentProfileMissingError) return "notAuthorized";
  if (error instanceof InvitationNotFoundError) return "invitationInvalid";
  if (error instanceof InvitationWrongTypeError) return "invitationInvalid";
  if (error instanceof InvitationNotPendingError) return "invitationInvalid";
  if (error instanceof InvitationNotClaimedError) return "invitationInvalid";
  if (error instanceof InvitationExpiredError) return "invitationExpired";
  if (error instanceof InvitationAlreadyClaimedError) return "invitationAlreadyClaimed";
  if (error instanceof ClaimantNotEligibleError) return "claimantNotEligible";
  if (error instanceof EmailMismatchError) return "emailMismatch";
  if (error instanceof ConcurrentApprovalError) return "conflict";
  if (error instanceof RelationshipNotFoundError) return "invitationInvalid";
  if (error instanceof LastActiveGuardianError) return "lastActiveGuardian";
  if (error instanceof CannotRevokeOtherGuardianError) return "cannotRevokeOtherGuardian";
  if (error instanceof StudentAlreadyLinkedError) return "studentAlreadyLinked";
  if (error instanceof ClaimantAlreadyLinkedElsewhereError) return "claimantAlreadyLinkedElsewhere";
  if (error instanceof StudentProfileDataIntegrityError) return "generic";
  return "generic";
}

export async function createChildAction(_prevState: FamilyActionState, formData: FormData): Promise<FamilyActionState> {
  const t = await getTranslations("family.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") return { error: t("notAuthorized") };

  const raw = formData.get("academicLevelId");
  const parsed = createChildSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    dateOfBirth: formData.get("dateOfBirth"),
    academicLevelId: raw && String(raw).length > 0 ? raw : undefined,
  });
  if (!parsed.success) return { error: t("invalidInput") };

  try {
    await createGuardianManagedStudent(db, session.user.id, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      dateOfBirth: new Date(`${parsed.data.dateOfBirth}T00:00:00.000Z`),
      academicLevelId: parsed.data.academicLevelId,
    });
  } catch (error) {
    return { error: t(mapErrorToKey(error)) };
  }

  revalidatePath("/dashboard/family");
  return { success: true };
}

export async function inviteGuardianAction(_prevState: InviteGuardianState, formData: FormData): Promise<InviteGuardianState> {
  const t = await getTranslations("family.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") return { success: false, error: t("notAuthorized") };

  const parsed = inviteGuardianSchema.safeParse({
    studentProfileId: formData.get("studentProfileId"),
    invitedEmail: formData.get("invitedEmail"),
  });
  if (!parsed.success) return { success: false, error: t("invalidInput") };

  try {
    const { invitation, rawToken } = await createGuardianInvitation(
      db,
      session.user.id,
      parsed.data.studentProfileId,
      parsed.data.invitedEmail
    );
    const locale = await getLocale();
    const origin = await getAppBaseUrl();
    const inviteUrl = `${origin}/${locale}/family/invite/${rawToken}`;
    revalidatePath(`/dashboard/family/${parsed.data.studentProfileId}`);
    return { success: true, inviteUrl, expiresAt: invitation.expiresAt.toISOString() };
  } catch (error) {
    return { success: false, error: t(mapErrorToKey(error)) };
  }
}

/** Phase H.5 — mirrors inviteGuardianAction exactly, targeting a
 * STUDENT_LOGIN invitation instead. Reuses inviteGuardianSchema directly
 * (identical shape: studentProfileId + invitedEmail) rather than declaring
 * a second, structurally-identical schema. */
export async function inviteStudentLoginAction(
  _prevState: InviteGuardianState,
  formData: FormData
): Promise<InviteGuardianState> {
  const t = await getTranslations("family.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") return { success: false, error: t("notAuthorized") };

  const parsed = inviteGuardianSchema.safeParse({
    studentProfileId: formData.get("studentProfileId"),
    invitedEmail: formData.get("invitedEmail"),
  });
  if (!parsed.success) return { success: false, error: t("invalidInput") };

  try {
    const { invitation, rawToken } = await createStudentLoginInvitation(
      db,
      session.user.id,
      parsed.data.studentProfileId,
      parsed.data.invitedEmail
    );
    const locale = await getLocale();
    const origin = await getAppBaseUrl();
    const inviteUrl = `${origin}/${locale}/family/invite/${rawToken}`;
    revalidatePath(`/dashboard/family/${parsed.data.studentProfileId}`);
    return { success: true, inviteUrl, expiresAt: invitation.expiresAt.toISOString() };
  } catch (error) {
    return { success: false, error: t(mapErrorToKey(error)) };
  }
}

export async function approveInvitationAction(_prevState: FamilyActionState, formData: FormData): Promise<FamilyActionState> {
  const t = await getTranslations("family.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") return { error: t("notAuthorized") };

  const parsed = approveInvitationSchema.safeParse({ invitationId: formData.get("invitationId") });
  if (!parsed.success) return { error: t("invalidInput") };

  let studentProfileId: string;
  try {
    const result = await approveFamilyInvitation(db, session.user.id, parsed.data.invitationId);
    studentProfileId = result.invitation.targetStudentProfileId;
  } catch (error) {
    return { error: t(mapErrorToKey(error)) };
  }

  revalidatePath(`/dashboard/family/${studentProfileId}`);
  return { success: true };
}

export async function rejectInvitationAction(_prevState: FamilyActionState, formData: FormData): Promise<FamilyActionState> {
  const t = await getTranslations("family.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") return { error: t("notAuthorized") };

  const parsed = rejectInvitationSchema.safeParse({ invitationId: formData.get("invitationId") });
  if (!parsed.success) return { error: t("invalidInput") };

  let studentProfileId: string;
  try {
    const result = await rejectFamilyInvitationClaim(db, session.user.id, parsed.data.invitationId);
    studentProfileId = result.targetStudentProfileId;
  } catch (error) {
    return { error: t(mapErrorToKey(error)) };
  }

  revalidatePath(`/dashboard/family/${studentProfileId}`);
  return { success: true };
}

export async function revokeGuardianAction(_prevState: FamilyActionState, formData: FormData): Promise<FamilyActionState> {
  const t = await getTranslations("family.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") return { error: t("notAuthorized") };

  const parsed = revokeGuardianSchema.safeParse({ relationshipId: formData.get("relationshipId") });
  if (!parsed.success) return { error: t("invalidInput") };

  let studentProfileId: string;
  try {
    const result = await revokeGuardianRelationship(db, session.user.id, parsed.data.relationshipId);
    studentProfileId = result.relationship.studentProfileId;
  } catch (error) {
    return { error: t(mapErrorToKey(error)) };
  }

  revalidatePath(`/dashboard/family/${studentProfileId}`);
  return { success: true };
}

/** Claim by an already-authenticated session (§20 of the H.4 prompt). */
export async function claimInvitationAction(_prevState: FamilyActionState, formData: FormData): Promise<FamilyActionState> {
  const t = await getTranslations("family.errors");
  const session = await auth();
  if (!session?.user) return { error: t("mustBeSignedIn") };

  const parsed = claimInvitationSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return { error: t("invalidInput") };

  try {
    await claimGuardianInvitation(db, parsed.data.token, {
      id: session.user.id,
      role: session.user.role,
      email: session.user.email ?? null,
    });
  } catch (error) {
    return { error: t(mapErrorToKey(error)) };
  }

  return { success: true };
}

/** Claim by creating a brand-new Parent account, email pre-bound and locked
 * to the invitation's own invitedEmailNormalized (§19) — reuses H.3's
 * createUserForSignup rather than duplicating account-creation logic. */
export async function claimWithNewAccountAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const t = await getTranslations("family.errors");
  const locale = await getLocale();

  // BETA-HARDEN1 — this schema requires termsAccepted (unlike
  // claimNewAccountSchema, still used by the STUDENT_LOGIN claim path); a
  // crafted request omitting it fails validation here, before any account
  // is created.
  const parsed = claimNewGuardianAccountSchema.safeParse({
    token: formData.get("token"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    password: formData.get("password"),
    termsAccepted: formData.get("termsAccepted"),
  });
  if (!parsed.success) return { error: t("invalidInput") };

  // BETA-OPS1 — IP-scoped throttle against automated token guessing;
  // deliberately collapsed into the same generic "invitationInvalid"
  // response as any other rejection here, so a rate-limited attempt is
  // indistinguishable from a wrong/unknown token.
  const rateLimit = await checkActionRateLimit({
    action: "invitationClaim",
    identifier: null,
    ip: getClientIp(await headers()),
    identifierLimit: RATE_LIMITS.invitationClaimByIp,
    ipLimit: RATE_LIMITS.invitationClaimByIp,
  });
  if (!rateLimit.allowed) return { error: t("invitationInvalid") };

  const tokenHash = hashInvitationToken(parsed.data.token);
  const invitation = await db.familyInvitation.findUnique({ where: { tokenHash } });
  if (!invitation || invitation.type !== "GUARDIAN_LINK") return { error: t("invitationInvalid") };

  const existing = await db.user.findUnique({ where: { email: invitation.invitedEmailNormalized } });
  if (existing) return { error: t("accountAlreadyExists") };

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const newUser = await createUserForSignup(db, {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: invitation.invitedEmailNormalized,
    passwordHash,
    role: "PARENT",
    // BETA-HARDEN1 — same three fields, same values registerAction stamps
    // on an ordinary direct signup (src/lib/actions/auth.ts), so this
    // second real account-creation path captures consent identically
    // rather than leaving it null.
    termsAcceptedAt: new Date(),
    termsAcceptedVersion: TERMS_VERSION,
    termsAcceptedLocale: locale,
  });

  await signIn("credentials", { email: invitation.invitedEmailNormalized, password: parsed.data.password, redirect: false });

  try {
    await claimGuardianInvitation(db, parsed.data.token, { id: newUser.id, role: "PARENT", email: newUser.email });
  } catch (error) {
    return { error: t(mapErrorToKey(error)) };
  }

  return { success: true };
}

/** Phase H.5 — claim by an already-authenticated existing STUDENT account
 * (§15/§20). PARENT/TUTOR/ADMIN sessions are rejected here before even
 * reaching claimStudentLoginInvitation's own role check, for a clearer
 * error message at the boundary closest to the actual mistake. */
export async function claimStudentLoginAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const t = await getTranslations("family.errors");
  const session = await auth();
  if (!session?.user) return { error: t("mustBeSignedIn") };
  if (session.user.role !== "STUDENT") return { error: t("claimantNotEligible") };

  const parsed = claimInvitationSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return { error: t("invalidInput") };

  try {
    await claimStudentLoginInvitation(db, parsed.data.token, {
      id: session.user.id,
      role: session.user.role,
      email: session.user.email ?? null,
    });
  } catch (error) {
    return { error: t(mapErrorToKey(error)) };
  }

  return { success: true };
}

/** Phase H.5 — claim by creating a brand-new Student account, email
 * pre-bound and locked to the invitation's own invitedEmailNormalized
 * (§13/§14). Uses the narrow createStudentLoginUser primitive (User only,
 * no nested StudentProfile) — NOT createUserForSignup's STUDENT branch,
 * which would fabricate an unwanted second, SELF_MANAGED StudentProfile
 * alongside the guardian-created one this flow links to at approval. */
export async function claimStudentLoginWithNewAccountAction(
  _prevState: FamilyActionState,
  formData: FormData
): Promise<FamilyActionState> {
  const t = await getTranslations("family.errors");

  const parsed = claimNewAccountSchema.safeParse({
    token: formData.get("token"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: t("invalidInput") };

  // BETA-OPS1 — same IP-scoped throttle as claimWithNewAccountAction.
  const rateLimit = await checkActionRateLimit({
    action: "invitationClaim",
    identifier: null,
    ip: getClientIp(await headers()),
    identifierLimit: RATE_LIMITS.invitationClaimByIp,
    ipLimit: RATE_LIMITS.invitationClaimByIp,
  });
  if (!rateLimit.allowed) return { error: t("invitationInvalid") };

  const tokenHash = hashInvitationToken(parsed.data.token);
  const invitation = await db.familyInvitation.findUnique({ where: { tokenHash } });
  if (!invitation || invitation.type !== "STUDENT_LOGIN") return { error: t("invitationInvalid") };

  const existing = await db.user.findUnique({ where: { email: invitation.invitedEmailNormalized } });
  if (existing) return { error: t("accountAlreadyExists") };

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const newUser = await createStudentLoginUser(db, {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: invitation.invitedEmailNormalized,
    passwordHash,
  });

  await signIn("credentials", { email: invitation.invitedEmailNormalized, password: parsed.data.password, redirect: false });

  try {
    await claimStudentLoginInvitation(db, parsed.data.token, { id: newUser.id, role: "STUDENT", email: newUser.email });
  } catch (error) {
    return { error: t(mapErrorToKey(error)) };
  }

  return { success: true };
}
