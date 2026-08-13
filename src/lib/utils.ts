import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "$42" in English, "42 $" in Canadian French — no decimals, matches the compact rate display in tutor cards/profiles. */
export function formatHourlyRate(amount: number, locale: string) {
  return locale === "fr" ? `${amount} $` : `$${amount}`;
}

/**
 * Formats a booking's start time in the timezone it was booked in (not the
 * viewer's own timezone) — the booking is always shown as "this is when the
 * session actually starts, in the tutor's clock," labelled explicitly so
 * it's never ambiguous whose timezone is being displayed.
 */
export function formatBookingTime(startAt: Date, timezone: string, locale: string) {
  const formatted = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(startAt);
  return `${formatted} (${timezone.replace("_", " ")})`;
}
