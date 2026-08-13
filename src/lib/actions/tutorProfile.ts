"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tutorProfileSchema, type TutorProfileInput } from "@/schemas/tutorProfile";

export type TutorProfileActionState = { error?: string; success?: boolean } | undefined;

async function requireTutorProfile() {
  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") {
    return null;
  }
  return db.tutorProfile.findUnique({ where: { userId: session.user.id } });
}

async function applyTutorProfileFields(tutorProfileId: string, data: TutorProfileInput) {
  const [subjectRows, levelRows] = await Promise.all([
    db.subject.findMany({ where: { slug: { in: data.subjectSlugs } }, select: { id: true } }),
    db.academicLevel.findMany({ where: { slug: { in: data.levelSlugs } }, select: { id: true } }),
  ]);

  await db.$transaction([
    db.tutorProfile.update({
      where: { id: tutorProfileId },
      data: {
        headline: data.headline,
        bio: data.bio,
        hourlyRateCents: Math.round(data.hourlyRateCad * 100),
        yearsExperience: data.yearsExperience,
        city: data.city,
        province: data.province,
        learningMode: data.learningMode,
      },
    }),
    db.tutorSubject.deleteMany({ where: { tutorProfileId } }),
    db.tutorSubject.createMany({
      data: subjectRows.map((s) => ({ tutorProfileId, subjectId: s.id })),
    }),
    db.tutorLevel.deleteMany({ where: { tutorProfileId } }),
    db.tutorLevel.createMany({
      data: levelRows.map((l) => ({ tutorProfileId, academicLevelId: l.id })),
    }),
    db.tutorLanguage.deleteMany({ where: { tutorProfileId } }),
    db.tutorLanguage.createMany({
      data: data.languages.map((language) => ({ tutorProfileId, language })),
    }),
  ]);
}

/** Handles both the "Save" and "Submit for Review" buttons, distinguished by a hidden `intent` field. */
export async function updateTutorProfileAction(
  _prevState: TutorProfileActionState,
  formData: FormData
): Promise<TutorProfileActionState> {
  const t = await getTranslations("tutorProfileForm.errors");
  const tutorProfile = await requireTutorProfile();
  if (!tutorProfile) return { error: t("notATutor") };

  const intent = formData.get("intent");
  if (intent === "submit" && tutorProfile.applicationStatus !== "DRAFT") {
    return { error: t("alreadySubmitted") };
  }

  const parsed = tutorProfileSchema.safeParse({
    headline: formData.get("headline"),
    bio: formData.get("bio"),
    subjectSlugs: formData.getAll("subjectSlugs"),
    levelSlugs: formData.getAll("levelSlugs"),
    languages: formData.getAll("languages"),
    hourlyRateCad: formData.get("hourlyRateCad"),
    yearsExperience: formData.get("yearsExperience"),
    city: formData.get("city"),
    province: formData.get("province"),
    learningMode: formData.get("learningMode"),
  });
  if (!parsed.success) return { error: t("invalidInput") };

  await applyTutorProfileFields(tutorProfile.id, parsed.data);

  if (intent === "submit") {
    await db.tutorProfile.update({
      where: { id: tutorProfile.id },
      data: { applicationStatus: "SUBMITTED" },
    });
    revalidatePath("/tutor/dashboard");
  }

  revalidatePath("/tutor/profile");
  return { success: true };
}
