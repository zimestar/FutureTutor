"use server";

import bcrypt from "bcryptjs";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { homePathForRole } from "@/lib/authorization";
import { loginSchema, registerSchema } from "@/schemas/auth";

export type AuthActionState = { error?: string } | undefined;

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
  });

  if (!parsed.success) {
    return { error: t("invalidInput") };
  }

  const { firstName, lastName, email, password, role } = parsed.data;
  const name = `${firstName} ${lastName}`;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: t("emailTaken") };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      ...(role === "STUDENT"
        ? { studentProfile: { create: { firstName, lastName } } }
        : { tutorProfile: { create: { slug: await generateTutorSlug(name) } } }),
    },
  });

  await signIn("credentials", { email, password, redirect: false });
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
