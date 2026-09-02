import "server-only";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { closedBetaOnlineOnlyActive } from "@/lib/closedBetaConfig";

/**
 * Phase H.3 — the atomic User+profile creation core shared by every signup
 * role. Extracted out of the `registerAction` Server Action so it's testable
 * against a real (isolated test) database without pulling in Next.js
 * request-scoped internals (next-intl's getLocale/getTranslations, the
 * redirect() call) that a plain Vitest environment can't provide. Mirrors
 * the `StudentAuthorizationClient`-style transaction-client-compatible
 * pattern already established in src/services/studentAuthorization.ts /
 * src/services/payments.ts.
 *
 * A new independent Student signup always stays SELF_MANAGED regardless of
 * the collected dateOfBirth — inferring GUARDIAN_MANAGED from age is later
 * Phase H territory, not decided here. A new Parent gets only a User +
 * ParentProfile: zero StudentProfile/ParentStudentRelationship/
 * FamilyInvitation/ConsentRecord is fabricated on their behalf.
 */
export type SignupClient = PrismaClient | Prisma.TransactionClient;

export interface CreateUserForSignupInput {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: "STUDENT" | "TUTOR" | "PARENT";
  /** Required (and only meaningful) when role === "STUDENT". */
  dateOfBirth?: Date;
  /** BETA-AGE1 — required (and only meaningful) when role === "STUDENT".
   * The province/territory collected at signup, used by
   * src/lib/studentAgePolicy.ts's eligibility check BEFORE this function is
   * ever called for a STUDENT — by the time it reaches here it is already
   * a validated CanadianProvinceCode. Persisted directly as
   * StudentProfile.province so the Student is never asked for the same
   * information again during profile completion (mission §6). */
  province?: string;
  /** Only meaningful when role === "TUTOR" — the caller resolves a unique
   * slug before calling in, since slug generation itself queries the DB. */
  tutorSlug?: string;
  /** FG-LEGAL1A — minimal, auditable Terms-of-Service acceptance record.
   * All three are set together (or not at all) — registerAction always
   * supplies them, since termsAccepted is a required field on
   * registerSchema; other callers of this function (e.g. the guardian
   * student-login-invitation flow) never do, since that flow's own consent
   * model is the guardian's authority, not a fresh Terms click. */
  termsAcceptedAt?: Date;
  termsAcceptedVersion?: string;
  termsAcceptedLocale?: string;
}

export async function createUserForSignup(client: SignupClient, input: CreateUserForSignupInput) {
  const { firstName, lastName, email, passwordHash, role, dateOfBirth, province, tutorSlug, termsAcceptedAt, termsAcceptedVersion, termsAcceptedLocale } = input;
  const name = `${firstName} ${lastName}`;

  let profileData;
  if (role === "STUDENT") {
    if (!dateOfBirth) {
      throw new Error("createUserForSignup: dateOfBirth is required for role STUDENT");
    }
    if (!province) {
      throw new Error("createUserForSignup: province is required for role STUDENT");
    }
    profileData = {
      studentProfile: {
        // BETA-HARDEN1 — new Student profiles default to ONLINE while the
        // Closed Beta's online-only gate is active, instead of the schema's
        // own BOTH default (BETA-USER1 §20 #5 found every new profile
        // silently defaulting to BOTH, exposing an unguarded in-person
        // path). Historical rows are never touched — this only changes what
        // a brand-new row is created with.
        create: {
          firstName,
          lastName,
          managementMode: "SELF_MANAGED" as const,
          dateOfBirth,
          // BETA-AGE1 — the same province already validated by
          // registerAction's age-of-majority eligibility check, persisted
          // directly as the profile's canonical province value.
          province,
          tutoringMode: closedBetaOnlineOnlyActive() ? ("ONLINE" as const) : ("BOTH" as const),
        },
      },
    };
  } else if (role === "PARENT") {
    profileData = { parentProfile: { create: { firstName, lastName } } };
  } else {
    if (!tutorSlug) {
      throw new Error("createUserForSignup: tutorSlug is required for role TUTOR");
    }
    profileData = { tutorProfile: { create: { slug: tutorSlug } } };
  }

  return client.user.create({
    data: { name, email, passwordHash, role, termsAcceptedAt, termsAcceptedVersion, termsAcceptedLocale, ...profileData },
  });
}

export interface CreateStudentLoginUserInput {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
}

/**
 * Phase H.5 — creates a bare User (role STUDENT) with NO nested profile of
 * any kind. Deliberately separate from createUserForSignup's STUDENT
 * branch above, which always creates a brand-new SELF_MANAGED
 * StudentProfile for independent adult signup — reusing that here would
 * fabricate a second, unwanted StudentProfile alongside the
 * guardian-created GUARDIAN_MANAGED one this flow is actually linking to
 * (the linkage itself happens later, at guardian approval — see
 * src/services/familyManagement.ts's approveStudentLoginInvitation).
 */
export async function createStudentLoginUser(client: SignupClient, input: CreateStudentLoginUserInput) {
  return client.user.create({
    data: {
      name: `${input.firstName} ${input.lastName}`,
      email: input.email,
      passwordHash: input.passwordHash,
      role: "STUDENT",
    },
  });
}
