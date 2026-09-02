"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { getAppBaseUrl } from "@/lib/appUrl";
import { checkActionRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import { homePathForRole } from "@/lib/authorization";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationEmailSchema,
} from "@/schemas/auth";
import { createUserForSignup } from "@/services/signup";
import {
  requestPasswordReset,
  resetPassword,
  InvalidOrExpiredResetTokenError,
  ResetPasswordPolicyError,
} from "@/services/passwordReset";
import { resolveSendPasswordResetEmail } from "@/lib/email/sendPasswordResetEmail";
import {
  sendVerificationEmailForAccount,
  resendEmailVerification,
  verifyEmail,
  InvalidOrExpiredVerificationTokenError,
} from "@/services/emailVerification";
import { resolveSendVerificationEmail } from "@/lib/email/sendVerificationEmail";

import { TERMS_VERSION } from "@/content/legal/termsContent.en";

type RegisterField = "firstName" | "lastName" | "email" | "password" | "role" | "dateOfBirth" | "termsAccepted";

export type AuthActionState = {
  error?: string;
  fieldErrors?: Partial<Record<RegisterField, string>>;
  accountCreated?: boolean;
} | undefined;

export async function registerAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "auth.errors" });

  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    dateOfBirth: formData.get("dateOfBirth"),
    termsAccepted: formData.get("termsAccepted"),
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<RegisterField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && isRegisterField(field) && !fieldErrors[field]) {
        fieldErrors[field] = t(`${field}Invalid`);
      }
    }
    return { error: t("invalidInput"), fieldErrors };
  }

  // BETA-OPS1 — IP-scoped only: there's no existing account yet to key an
  // identifier-based bucket on.
  const ip = getClientIp(await headers());
  const rateLimit = await checkActionRateLimit({
    action: "register",
    identifier: null,
    ip,
    identifierLimit: RATE_LIMITS.registerByIp,
    ipLimit: RATE_LIMITS.registerByIp,
  });
  if (!rateLimit.allowed) return { error: t("tooManyAttempts") };

  const { firstName, lastName, email, password, role, dateOfBirth } = parsed.data;
  const name = `${firstName} ${lastName}`;

  let existing;
  try {
    existing = await db.user.findUnique({ where: { email } });
  } catch (error) {
    logAuthFailure("duplicate-email-check", error);
    return { error: t("signupFailed") };
  }
  if (existing) {
    return { error: t("emailTaken") };
  }

  let passwordHash: string;
  try {
    passwordHash = await bcrypt.hash(password, 12);
  } catch (error) {
    logAuthFailure("password-hash", error);
    return { error: t("signupFailed") };
  }

  let newUser: { id: string; email: string };
  try {
    newUser = await createUserForSignup(db, {
      firstName,
      lastName,
      email,
      passwordHash,
      role,
      dateOfBirth: role === "STUDENT" ? new Date(`${dateOfBirth}T00:00:00.000Z`) : undefined,
      tutorSlug: role === "TUTOR" ? await generateTutorSlug(name) : undefined,
      termsAcceptedAt: new Date(),
      termsAcceptedVersion: TERMS_VERSION,
      termsAcceptedLocale: locale,
    });
  } catch (error) {
    logAuthFailure("user-profile-create", error);
    return { error: t("signupFailed") };
  }

  // BETA-EMAILVERIFY1 — no auto sign-in. The account exists with
  // emailVerified: null; the user must prove ownership of the email before
  // any authenticated access is possible (enforced server-side in
  // src/lib/auth.ts's authorize()). A failure to SEND the verification
  // email is a genuine infrastructure failure, logged and surfaced — the
  // account already exists at this point (accountCreated: true), so the
  // user isn't silently stuck with no way to know what happened.
  try {
    const appBaseUrl = await getAppBaseUrl();
    await sendVerificationEmailForAccount(db, newUser, {
      locale,
      sendEmail: resolveSendVerificationEmail(),
      buildVerifyUrl: (rawToken) => `${appBaseUrl}/${locale}/verify-email?token=${encodeURIComponent(rawToken)}`,
    });
  } catch (error) {
    logAuthFailure("verification-email-send", error);
    return { error: t("verificationEmailFailed"), accountCreated: true };
  }

  redirect({ href: `/check-email?email=${encodeURIComponent(email)}`, locale });
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "auth.errors" });

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: t("invalidInput") };
  }

  // BETA-OPS1 — UX-friendly check on the primary login path (authorize()
  // in src/lib/auth.ts carries the same limit as a backstop for any
  // request that reaches the NextAuth callback route directly).
  const ip = getClientIp(await headers());
  const rateLimit = await checkActionRateLimit({
    action: "login",
    identifier: parsed.data.email,
    ip,
    identifierLimit: RATE_LIMITS.loginByEmail,
    ipLimit: RATE_LIMITS.loginByIp,
  });
  if (!rateLimit.allowed) {
    return { error: t("tooManyAttempts") };
  }

  const result = await signIn("credentials", {
    ...parsed.data,
    redirect: false,
  }).catch(() => null);

  if (!result) {
    return { error: t("invalidCredentials") };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  redirect({ href: homePathForRole(user?.role ?? "STUDENT"), locale });
}

export async function signOutAction() {
  const locale = await getLocale();
  await signOut({ redirect: false });
  redirect({ href: "/", locale });
}

// ---------------------------------------------------------------------------
// L1-01A — Secure Account Recovery (Golden Path P0). Backend-only: no page
// at /reset-password exists yet in this task's scope, these two Server
// Actions are the authoritative recovery contract a future frontend task
// wires a form to. See src/services/passwordReset.ts for the real logic —
// these are thin wrappers (parse input, resolve locale/origin, translate
// domain errors into a generic outcome), same division of labor as every
// other action in this file.
// ---------------------------------------------------------------------------

export type ForgotPasswordActionState = { submitted: true } | undefined;

/**
 * §7. ALWAYS resolves to the same `{ submitted: true }` outcome regardless
 * of whether the submitted email is validly formatted, belongs to a real
 * account, or belongs to no account at all — contract §A, "must NOT reveal
 * whether the email exists," with no exception carved out for "obviously
 * malformed input" either, so this invariant can never accidentally leak a
 * distinguishing branch in the future.
 */
export async function forgotPasswordAction(
  _prevState: ForgotPasswordActionState,
  formData: FormData
): Promise<ForgotPasswordActionState> {
  const locale = await getLocale();
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  // BETA-OPS1 — rate-limited silently: the return value below is
  // deliberately identical whether this request is rate-limited, the email
  // doesn't exist, or a real reset email was sent — §7's no-enumeration
  // contract is preserved exactly (a rate-limited response is
  // indistinguishable from every other case).
  const ip = getClientIp(await headers());
  const rateLimit = parsed.success
    ? await checkActionRateLimit({
        action: "forgotPassword",
        identifier: parsed.data.email,
        ip,
        identifierLimit: RATE_LIMITS.forgotPasswordByEmail,
        ipLimit: RATE_LIMITS.forgotPasswordByIp,
      })
    : { allowed: true, retryAfterSeconds: 0 };

  if (parsed.success && rateLimit.allowed) {
    try {
      const appBaseUrl = await getAppBaseUrl();
      // L1-01B — resolveSendPasswordResetEmail() picks the Resend-backed
      // production adapter or the dev-only console adapter based on
      // environment (see src/lib/email/emailDeliveryConfig.ts); a
      // misconfigured-production EmailConfigurationError is a "genuine
      // infrastructure failure" and is caught by the try/catch below like
      // any other, preserving the generic {submitted:true} outcome.
      await requestPasswordReset(db, parsed.data.email, {
        locale,
        sendEmail: resolveSendPasswordResetEmail(),
        buildResetUrl: (rawToken) =>
          `${appBaseUrl}/${locale}/reset-password?token=${encodeURIComponent(rawToken)}`,
      });
    } catch (error) {
      // A genuine infrastructure failure (DB unreachable, etc.) — logged
      // server-side only; the browser-facing outcome below is unchanged
      // either way, preserving the no-enumeration invariant even on error.
      logAuthFailure("forgot-password-request", error);
    }
  }

  return { submitted: true };
}

export type ResetPasswordActionState =
  | { error: "invalid_request" | "invalid_or_expired_token" | "invalid_password" | "reset_failed" }
  | { success: true }
  | undefined;

/**
 * §8. Validates the token + new password server-side (client input is only
 * ever a raw token string and a plaintext password — contract §I: never a
 * userId, target hash, expiry, or token state), then delegates to
 * resetPassword's guarded transactional core.
 */
export async function resetPasswordAction(
  _prevState: ResetPasswordActionState,
  formData: FormData
): Promise<ResetPasswordActionState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "invalid_request" };
  }

  // BETA-OPS1 — IP-scoped only: the reset token itself is a cryptographically
  // random, single-use, time-limited value (see passwordReset.ts), so there
  // is no meaningful account identifier to key an identifier-scoped bucket
  // on here; this guards against automated scanning across many tokens.
  const ip = getClientIp(await headers());
  const rateLimit = await checkActionRateLimit({
    action: "resetPassword",
    identifier: null,
    ip,
    identifierLimit: RATE_LIMITS.resetPasswordByIp,
    ipLimit: RATE_LIMITS.resetPasswordByIp,
  });
  if (!rateLimit.allowed) {
    return { error: "reset_failed" };
  }

  try {
    await resetPassword(db, parsed.data.token, parsed.data.password, {
      hashPassword: (password) => bcrypt.hash(password, 12),
    });
  } catch (error) {
    if (error instanceof InvalidOrExpiredResetTokenError) {
      return { error: "invalid_or_expired_token" };
    }
    if (error instanceof ResetPasswordPolicyError) {
      return { error: "invalid_password" };
    }
    logAuthFailure("reset-password", error);
    return { error: "reset_failed" };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// BETA-EMAILVERIFY1 — Email Ownership Verification. Mirrors L1-01A's own
// division of labor exactly: these are thin wrappers (parse input, resolve
// locale/origin, translate domain errors into a generic outcome); the real
// logic lives in src/services/emailVerification.ts.
// ---------------------------------------------------------------------------

export type VerifyEmailActionState =
  | { error: "invalid_request" | "invalid_or_expired_token" }
  | { success: true }
  | undefined;

/**
 * The single authoritative "activate my account" entry point. Validates
 * only a raw token string (never a userId/target account/verification
 * state — same client-input contract as resetPasswordAction), then
 * delegates to verifyEmail's guarded transactional core.
 */
export async function verifyEmailAction(
  _prevState: VerifyEmailActionState,
  formData: FormData
): Promise<VerifyEmailActionState> {
  const parsed = verifyEmailSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) {
    return { error: "invalid_request" };
  }

  // IP-scoped only — same reasoning as resetPasswordAction: the token
  // itself is cryptographically random and single-use, so there is no
  // meaningful account identifier to key an identifier-scoped bucket on.
  const ip = getClientIp(await headers());
  const rateLimit = await checkActionRateLimit({
    action: "verifyEmail",
    identifier: null,
    ip,
    identifierLimit: RATE_LIMITS.verifyEmailByIp,
    ipLimit: RATE_LIMITS.verifyEmailByIp,
  });
  if (!rateLimit.allowed) {
    return { error: "invalid_or_expired_token" };
  }

  try {
    await verifyEmail(db, parsed.data.token);
  } catch (error) {
    if (error instanceof InvalidOrExpiredVerificationTokenError) {
      return { error: "invalid_or_expired_token" };
    }
    logAuthFailure("verify-email", error);
    return { error: "invalid_or_expired_token" };
  }

  return { success: true };
}

export type ResendVerificationEmailActionState = { submitted: true } | undefined;

/**
 * ALWAYS resolves to the same `{ submitted: true }` outcome regardless of
 * whether the submitted email is validly formatted, belongs to a real
 * account, belongs to an already-verified account, or belongs to no
 * account at all — mirrors forgotPasswordAction's own no-enumeration
 * contract exactly, with no exception for "obviously malformed input" or
 * "already verified" either, so this invariant can never accidentally leak
 * a distinguishing branch in the future.
 */
export async function resendVerificationEmailAction(
  _prevState: ResendVerificationEmailActionState,
  formData: FormData
): Promise<ResendVerificationEmailActionState> {
  const locale = await getLocale();
  const parsed = resendVerificationEmailSchema.safeParse({ email: formData.get("email") });

  const ip = getClientIp(await headers());
  const rateLimit = parsed.success
    ? await checkActionRateLimit({
        action: "emailVerificationResend",
        identifier: parsed.data.email,
        ip,
        identifierLimit: RATE_LIMITS.emailVerificationResendByEmail,
        ipLimit: RATE_LIMITS.emailVerificationResendByIp,
      })
    : { allowed: true, retryAfterSeconds: 0 };

  if (parsed.success && rateLimit.allowed) {
    try {
      const appBaseUrl = await getAppBaseUrl();
      await resendEmailVerification(db, parsed.data.email, {
        locale,
        sendEmail: resolveSendVerificationEmail(),
        buildVerifyUrl: (rawToken) => `${appBaseUrl}/${locale}/verify-email?token=${encodeURIComponent(rawToken)}`,
      });
    } catch (error) {
      // A genuine infrastructure failure — logged server-side only; the
      // browser-facing outcome is unchanged either way, preserving the
      // no-enumeration invariant even on error.
      logAuthFailure("resend-verification-email", error);
    }
  }

  return { submitted: true };
}

const DIACRITIC_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

const REGISTER_FIELDS = new Set<RegisterField>([
  "firstName",
  "lastName",
  "email",
  "password",
  "role",
  "dateOfBirth",
  "termsAccepted",
]);

function isRegisterField(value: string): value is RegisterField {
  return REGISTER_FIELDS.has(value as RegisterField);
}

// Renamed from the original registerAction-only `logRegisterFailure` (L1-01A
// reuses it for the password-reset actions too) — same safe shape:
// name/code only, never the raw error object or any secret value (password,
// hash, or — for password-reset callers — the raw reset token).
function logAuthFailure(stage: string, error: unknown) {
  const safeError = error as { name?: unknown; code?: unknown };
  console.error("auth action failed", {
    stage,
    errorName: typeof safeError?.name === "string" ? safeError.name : "UnknownError",
    errorCode: typeof safeError?.code === "string" ? safeError.code : undefined,
  });
}

async function generateTutorSlug(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITIC_MARKS, "") // strip accents (é → e) after NFD decomposition
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  let slug = base || "tutor";
  let suffix = 0;

  while (await db.tutorProfile.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  return slug;
}
