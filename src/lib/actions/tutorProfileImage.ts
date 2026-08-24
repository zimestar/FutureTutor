"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteTutorProfileImage, ProfileImageStorageError, ProfileImageValidationError, profileImageKeyFromPublicUrl, uploadTutorProfileImage } from "@/lib/supabaseProfileImages";

export type TutorProfileImageState = { success?: "uploaded" | "removed"; error?: string } | undefined;

export async function updateTutorProfileImageAction(_previous: TutorProfileImageState, formData: FormData): Promise<TutorProfileImageState> {
  const t = await getTranslations("tutorProfileForm.photo.errors");
  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") return { error: t("denied") };
  const user = await db.user.findFirst({ where: { id: session.user.id, role: "TUTOR", tutorProfile: { isNot: null } }, select: { id: true, image: true } });
  if (!user) return { error: t("denied") };

  const intent = formData.get("intent");
  if (intent === "remove") {
    await db.user.update({ where: { id: user.id }, data: { image: null } });
    try {
      const oldKey = profileImageKeyFromPublicUrl(user.image, user.id);
      if (oldKey) await deleteTutorProfileImage(oldKey);
    } catch { /* DB state is authoritative; orphan cleanup can be retried operationally. */ }
    revalidatePath("/tutor/profile");
    return { success: "removed" };
  }

  const file = formData.get("photo");
  if (!(file instanceof File)) return { error: t("empty") };
  try {
    const uploaded = await uploadTutorProfileImage({ userId: user.id, bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type });
    await db.user.update({ where: { id: user.id }, data: { image: uploaded.publicUrl } });
    try {
      const oldKey = profileImageKeyFromPublicUrl(user.image, user.id);
      if (oldKey) await deleteTutorProfileImage(oldKey);
    } catch { /* A successful replacement must not be rolled back by cleanup failure. */ }
    revalidatePath("/tutor/profile");
    revalidatePath("/find-tutors");
    return { success: "uploaded" };
  } catch (error) {
    if (error instanceof ProfileImageValidationError) return { error: t(error.code) };
    if (error instanceof ProfileImageStorageError) return { error: t("storage") };
    return { error: t("generic") };
  }
}
