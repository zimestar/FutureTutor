"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getAvailableSlots } from "@/lib/availability";
import { createBookingSchema, cancelBookingSchema } from "@/schemas/booking";

export type BookingActionState = { error?: string; success?: boolean } | undefined;

const ACTIVE_BOOKING_STATUSES = ["DRAFT", "PENDING_PAYMENT", "CONFIRMED"] as const;
const SESSION_DURATION_MINUTES = 60;

class SlotTakenError extends Error {}

export async function createBookingAction(
  _prevState: BookingActionState,
  formData: FormData
): Promise<BookingActionState> {
  const t = await getTranslations("booking.errors");

  const session = await auth();
  if (!session?.user || session.user.role !== "STUDENT") {
    return { error: t("notAStudent") };
  }

  const academicLevelId = formData.get("academicLevelId");
  const parsed = createBookingSchema.safeParse({
    tutorProfileId: formData.get("tutorProfileId"),
    subjectId: formData.get("subjectId"),
    academicLevelId: academicLevelId ? String(academicLevelId) : undefined,
    startAt: formData.get("startAt"),
  });
  if (!parsed.success) return { error: t("invalidInput") };
  const { tutorProfileId, subjectId, academicLevelId: levelId, startAt } = parsed.data;

  const [studentProfile, tutorProfile] = await Promise.all([
    db.studentProfile.findUnique({ where: { userId: session.user.id } }),
    db.tutorProfile.findUnique({ where: { id: tutorProfileId } }),
  ]);
  if (!studentProfile || !tutorProfile) return { error: t("invalidInput") };

  const { timezone, days } = await getAvailableSlots(tutorProfileId, {
    durationMinutes: SESSION_DURATION_MINUTES,
  });
  if (!timezone) return { error: t("slotTaken") };

  const isValidSlot = days.some((day) => day.slots.some((slot) => slot.startAt.getTime() === startAt.getTime()));
  if (!isValidSlot) return { error: t("slotTaken") };

  const endAt = new Date(startAt.getTime() + SESSION_DURATION_MINUTES * 60 * 1000);

  try {
    await db.$transaction(
      async (tx) => {
        const conflict = await tx.booking.findFirst({
          where: { tutorProfileId, startAt, status: { in: [...ACTIVE_BOOKING_STATUSES] } },
        });
        if (conflict) throw new SlotTakenError();

        const booking = await tx.booking.create({
          data: {
            studentProfileId: studentProfile.id,
            tutorProfileId,
            subjectId,
            academicLevelId: levelId,
            startAt,
            endAt,
            timezone,
            mode: tutorProfile.learningMode ?? "BOTH",
            hourlyRateCentsSnapshot: tutorProfile.hourlyRateCents ?? 0,
            platformFeeCentsSnapshot: 0,
            totalCents: tutorProfile.hourlyRateCents ?? 0,
            status: "CONFIRMED",
          },
        });
        await tx.bookingStatusHistory.create({
          data: { bookingId: booking.id, toStatus: "CONFIRMED", changedByUserId: session.user.id },
        });
        await tx.session_.create({ data: { bookingId: booking.id, status: "SCHEDULED" } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (error instanceof SlotTakenError) return { error: t("slotTaken") };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: t("slotTaken") };
    }
    return { error: t("generic") };
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/tutor/bookings");
  return { success: true };
}

export async function cancelBookingAction(
  _prevState: BookingActionState,
  formData: FormData
): Promise<BookingActionState> {
  const t = await getTranslations("booking.errors");

  const session = await auth();
  if (!session?.user) return { error: t("notYours") };

  const parsed = cancelBookingSchema.safeParse({ bookingId: formData.get("bookingId") });
  if (!parsed.success) return { error: t("invalidInput") };

  const booking = await db.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { studentProfile: true, tutorProfile: true },
  });
  if (!booking) return { error: t("notFound") };

  const isOwner =
    booking.studentProfile.userId === session.user.id || booking.tutorProfile.userId === session.user.id;
  const isAdmin = session.user.role === "SUPER_ADMIN";
  if (!isOwner && !isAdmin) return { error: t("notYours") };

  await db.$transaction([
    db.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancelledByUserId: session.user.id,
        cancelledAt: new Date(),
      },
    }),
    db.bookingStatusHistory.create({
      data: { bookingId: booking.id, fromStatus: booking.status, toStatus: "CANCELLED", changedByUserId: session.user.id },
    }),
  ]);

  revalidatePath("/dashboard/bookings");
  revalidatePath("/tutor/bookings");
  return { success: true };
}
