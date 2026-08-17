"use server";

import bcrypt from "bcryptjs";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { homePathForRole } from "@/lib/authorization";
import { loginSchema, registerSchema } from "@/schemas/auth";
import { createUserForSignup } from "@/services/signup";
import { signInResultHasError } from "@/services/signupAuthResult";

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
    logRegisterFailure("duplicate-email-check", error);
    return { error: t("signupFailed") };
  }
  if (existing) {
    return { error: t("emailTaken") };
  }

  let passwordHash: string;
  try {
    passwordHash = await bcrypt.hash(password, 12);
  } catch (error) {
    logRegisterFailure("password-hash", error);
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
    logRegisterFailure("user-profile-create", error);
    return { error: t("signupFailed") };
  }

  try {
    const signInResult = await signIn("credentials", { email, password, redirect: false });
    if (signInResultHasError(signInResult)) {
      logRegisterFailure("automatic-sign-in", new Error("Auth.js returned an error URL"));
      return { error: t("accountCreatedSignInFailed"), accountCreated: true };
    }
  } catch (error) {
    logRegisterFailure("automatic-sign-in", error);
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

function logRegisterFailure(stage: string, error: unknown) {
  const safeError = error as { name?: unknown; code?: unknown };
  console.error("registerAction failed", {
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
