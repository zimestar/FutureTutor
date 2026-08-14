import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { db } from "@/lib/db";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export interface AvailableSlot {
  startAt: Date;
  endAt: Date;
}

export interface DaySlots {
  /** YYYY-MM-DD, in the tutor's own timezone. */
  date: string;
  slots: AvailableSlot[];
}

export interface AvailableSlotsResult {
  timezone: string | null;
  days: DaySlots[];
}

const ACTIVE_BOOKING_STATUSES = ["DRAFT", "PENDING_PAYMENT", "CONFIRMED"] as const;

/**
 * Computes bookable slots for a tutor over the next `days` days, from their
 * recurring weekly `TutorAvailability` minus already-booked times. All
 * wall-clock math happens in the tutor's own timezone (read via *local*
 * getters — `.getHours()`, `.getDay()`, etc — on `toZonedTime`'s result;
 * confirmed empirically that date-fns-tz v3's `toZonedTime` only reads back
 * correctly through local getters, not UTC getters, when the Node process's
 * own timezone isn't UTC — the UTC-getter approach silently produces wrong
 * wall-clock values on any non-UTC host) and is converted to real UTC
 * instants via `fromZonedTime` before being compared against bookings.
 */
export async function getAvailableSlots(
  tutorProfileId: string,
  { days = 14, durationMinutes = 60, minNoticeHours = 2 } = {}
): Promise<AvailableSlotsResult> {
  const availability = await db.tutorAvailability.findMany({ where: { tutorProfileId } });
  if (availability.length === 0) return { timezone: null, days: [] };

  const timezone = availability[0].timezone;
  const availabilityByDay = new Map(availability.map((a) => [a.dayOfWeek, a]));

  const now = new Date();
  const minStart = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000);
  const zonedNow = toZonedTime(now, timezone);
  const todayUtcMidnight = Date.UTC(
    zonedNow.getFullYear(),
    zonedNow.getMonth(),
    zonedNow.getDate()
  );

  const rangeStart = fromZonedTime(new Date(todayUtcMidnight), timezone);
  const rangeEnd = new Date(todayUtcMidnight + days * 24 * 60 * 60 * 1000);

  const activeBookings = await db.booking.findMany({
    where: {
      tutorProfileId,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      startAt: { gte: rangeStart, lt: fromZonedTime(rangeEnd, timezone) },
    },
    select: { startAt: true },
  });
  const bookedTimestamps = new Set(activeBookings.map((b) => b.startAt.getTime()));

  const result: DaySlots[] = [];

  for (let i = 0; i < days; i++) {
    const dayUtcMidnight = new Date(todayUtcMidnight + i * 24 * 60 * 60 * 1000);
    const dateStr = dayUtcMidnight.toISOString().slice(0, 10);
    const dayOfWeek = dayUtcMidnight.getUTCDay();

    const window = availabilityByDay.get(dayOfWeek);
    if (!window) continue;

    const slots: AvailableSlot[] = [];
    let cursorMinutes = toMinutes(window.startTime);
    const endMinutes = toMinutes(window.endTime);

    while (cursorMinutes + durationMinutes <= endMinutes) {
      const startAt = fromZonedTime(
        `${dateStr}T${fromMinutes(cursorMinutes)}:00`,
        timezone
      );
      const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

      if (startAt >= minStart && !bookedTimestamps.has(startAt.getTime())) {
        slots.push({ startAt, endAt });
      }

      cursorMinutes += durationMinutes;
    }

    if (slots.length > 0) {
      result.push({ date: dateStr, slots });
    }
  }

  return { timezone, days: result };
}

/**
 * Point-check version of getAvailableSlots' per-slot logic — "is this tutor
 * free at this exact instant for this exact duration," rather than building
 * a 14-day list. Same day-of-week/timezone/conflict-check reasoning, reused
 * for Quick Match's eligibility check (src/services/tutorEligibility.ts) and
 * its accept-time re-validation, instead of duplicated.
 */
export async function isTutorFreeAt(
  tutorProfileId: string,
  startAt: Date,
  durationMinutes: number,
  client: Prisma.TransactionClient | PrismaClient = db
): Promise<boolean> {
  const availability = await client.tutorAvailability.findMany({ where: { tutorProfileId } });
  if (availability.length === 0) return false;

  const timezone = availability[0].timezone;
  const zonedStart = toZonedTime(startAt, timezone);
  const dayOfWeek = zonedStart.getDay();
  const window = availability.find((a) => a.dayOfWeek === dayOfWeek);
  if (!window) return false;

  const startMinutes = zonedStart.getHours() * 60 + zonedStart.getMinutes();
  const endMinutes = startMinutes + durationMinutes;
  if (startMinutes < toMinutes(window.startTime) || endMinutes > toMinutes(window.endTime)) {
    return false;
  }

  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
  const conflict = await client.booking.findFirst({
    where: {
      tutorProfileId,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });
  return conflict == null;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
