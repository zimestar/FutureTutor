"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tutorAvailabilitySchema } from "@/schemas/tutorAvailability";

export type TutorAvailabilityActionState = { error?: string; success?: boolean } | undefined;

export async function saveTutorAvailabilityAction(
  _prevState: TutorAvailabilityActionState,
  formData: FormData
): Promise<TutorAvailabilityActionState> {
  const t = await getTranslations("tutorAvailability.errors");

  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") {
    return { error: t("notATutor") };
  }
  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: session.user.id } });
  if (!tutorProfile) return { error: t("notATutor") };

  const days = Array.from({ length: 7 }, (_, i) => ({
    enabled: formData.get(`day-${i}-enabled`) === "on",
    startTime: String(formData.get(`day-${i}-startTime`) ?? ""),
    endTime: String(formData.get(`day-${i}-endTime`) ?? ""),
  }));

  const parsed = tutorAvailabilitySchema.safeParse({
    timezone: formData.get("timezone"),
    days,
  });
  if (!parsed.success) return { error: t("invalidInput") };

  const enabledDays = parsed.data.days
    .map((day, dayOfWeek) => ({ ...day, dayOfWeek }))
    .filter((day) => day.enabled);

  await db.$transaction([
    db.tutorAvailability.deleteMany({ where: { tutorProfileId: tutorProfile.id } }),
    db.tutorAvailability.createMany({
      data: enabledDays.map((day) => ({
        tutorProfileId: tutorProfile.id,
        dayOfWeek: day.dayOfWeek,
        startTime: day.startTime,
        endTime: day.endTime,
        timezone: parsed.data.timezone,
      })),
    }),
  ]);

  revalidatePath("/tutor/availability");
  return { success: true };
}
