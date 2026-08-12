import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "$42" in English, "42 $" in Canadian French — no decimals, matches the compact rate display in tutor cards/profiles. */
export function formatHourlyRate(amount: number, locale: string) {
  return locale === "fr" ? `${amount} $` : `$${amount}`;
}
