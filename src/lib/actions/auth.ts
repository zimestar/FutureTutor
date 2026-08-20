"use server";

import bcrypt from "bcryptjs";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { getAppBaseUrl } from "@/lib/appUrl";
import { homePathForRole } from "@/lib/authorization";
import { loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema } from "@/schemas/auth";
import { createUserForSignup } from "@/services/signup";
import { signInResultHasError } from "@/services/signupAuthResult";
import {
  requestPasswordReset,
  resetPassword,
  consoleDevSendPasswordResetEmail,
  InvalidOrExpiredResetTokenError,
  ResetPasswordPolicyError,
} from "@/services/passwordReset";

type RegisterField = "firstName" | "lastName" | "email" | "password" | "role" | "dateOfBirth";

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

  try {
    await createUserForSignup(db, {
      firstName,
      lastName,
      email,
      passwordHash,
      role,
      dateOfBirth: role === "STUDENT" ? new Date(`${dateOfBirth}T00:00:00.000Z`) : undefined,
      tutorSlug: role === "TUTOR" ? await generateTutorSlug(name) : undefined,
    });
  } catch (error) {
    logAuthFailure("user-profile-create", error);
    return { error: t("signupFailed") };
  }

  try {
    const signInResult = await signIn("credentials", { email, password, redirect: false });
    if (signInResultHasError(signInResult)) {
      logAuthFailure("automatic-sign-in", new Error("Auth.js returned an error URL"));
      return { error: t("accountCreatedSignInFailed"), accountCreated: true };
    }
  } catch (error) {
    logAuthFailure("automatic-sign-in", error);
    return { error: t("accountCreatedSignInFailed"), accountCreated: true };
  }
  redirect({ href: homePathForRole(role), locale });
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

  if (parsed.success) {
    try {
      const appBaseUrl = await getAppBaseUrl();
      await requestPasswordReset(db, parsed.data.email, {
        locale,
        sendEmail: consoleDevSendPasswordResetEmail,
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

const DIACRITIC_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

const REGISTER_FIELDS = new Set<RegisterField>([
  "firstName",
  "lastName",
  "email",
  "password",
  "role",
  "dateOfBirth",
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
