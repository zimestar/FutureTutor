export type SessionActionLocale = "en" | "fr";

export function parseSessionActionIdentity(formData: FormData): { bookingId: string; locale: SessionActionLocale } | null {
  const bookingId = formData.get("bookingId");
  if (typeof bookingId !== "string" || !bookingId) return null;
  return { bookingId, locale: formData.get("locale") === "fr" ? "fr" : "en" };
}

export function parseInterruptionActionInput(formData: FormData): { bookingId: string; locale: SessionActionLocale; reason?: string } | null {
  const identity = parseSessionActionIdentity(formData);
  if (!identity) return null;
  const rawReason = formData.get("reason");
  return { ...identity, reason: typeof rawReason === "string" ? rawReason : undefined };
}
