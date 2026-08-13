import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { db } from "@/lib/db";

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
 * wall-clock math happens in the tutor's own timezone (read via UTC getters
 * on `toZonedTime`'s result — see date-fns-tz's docs; this is the one
 * reliable way to read "local time in zone X" regardless of what timezone
 * the Node process itself is running in) and is converted to real UTC
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
    zonedNow.getUTCFullYear(),
    zonedNow.getUTCMonth(),
    zonedNow.getUTCDate()
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
