"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateStudentProfileSchema, updateParentProfileSchema } from "@/schemas/profile";
import {
  updateStudentProfileForActor,
  updateParentProfileForActor,
  ForbiddenFieldError,
  InvalidFieldValueError,
  BetaOnlineOnlyModeError,
  ParentProfileNotFoundError,
} from "@/services/profileManagement";
import { NotAuthorizedError } from "@/services/familyManagement";

export type ProfileActionState = { error?: string; success?: boolean } | undefined;

function mapErrorToKey(error: unknown): string {
  if (error instanceof NotAuthorizedError) return "notAuthorized";
  if (error instanceof ForbiddenFieldError) return "forbiddenField";
  if (error instanceof BetaOnlineOnlyModeError) return "betaOnlineOnly";
  if (error instanceof InvalidFieldValueError) return "invalidInput";
  if (error instanceof ParentProfileNotFoundError) return "notAuthorized";
  return "generic";
}

/**
 * The single Server Action behind BOTH "a guardian edits a linked child's
 * profile" and "a Student edits their own profile" (H.6 §23) — the
 * distinction is made entirely server-side, inside
 * updateStudentProfileForActor's fresh H.2 capability read, never by which
 * page rendered the form. Only the explicitly enumerated fields below are
 * ever read from FormData — an attacker-forged form field with an
 * unexpected name is simply never looked at, let alone passed through.
 */
export async function updateStudentProfileAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const t = await getTranslations("profile.errors");
  const session = await auth();
  if (!session?.user) return { error: t("notAuthorized") };

  const raw: Record<string, unknown> = { studentProfileId: formData.get("studentProfileId") };
  for (const field of ["firstName", "lastName", "province", "city", "academicLevelId", "tutoringMode", "preferredLanguage"] as const) {
    if (formData.has(field)) raw[field] = formData.get(field);
  }

  const parsed = updateStudentProfileSchema.safeParse(raw);
  if (!parsed.success) return { error: t("invalidInput") };

  const { studentProfileId, ...input } = parsed.data;

  try {
    await updateStudentProfileForActor(db, session.user.id, studentProfileId, input);
  } catch (error) {
    return { error: t(mapErrorToKey(error)) };
  }

  revalidatePath(`/dashboard/family/${studentProfileId}`);
  revalidatePath("/dashboard/profile");
  return { success: true };
}

export async function updateParentProfileAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const t = await getTranslations("profile.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") return { error: t("notAuthorized") };

  const raw: Record<string, unknown> = {};
  for (const field of ["firstName", "lastName", "province", "city", "preferredLanguage"] as const) {
    if (formData.has(field)) raw[field] = formData.get(field);
  }

  const parsed = updateParentProfileSchema.safeParse(raw);
  if (!parsed.success) return { error: t("invalidInput") };

  try {
    await updateParentProfileForActor(db, session.user.id, parsed.data);
  } catch (error) {
    return { error: t(mapErrorToKey(error)) };
  }

  revalidatePath("/dashboard/profile");
  return { success: true };
}
