/**
 * DATA-1 — explicit, defense-in-depth PII denylist. TypeScript's
 * AnalyticsEventPropertiesMap (types.ts) is the primary control — a call
 * site literally cannot pass an unlisted property and compile. This
 * runtime check exists for the cases type safety alone can't cover: a
 * value smuggled through `as any`, a future refactor that widens a
 * property's type, or a vendor payload assembled dynamically. It must
 * never be the *only* protection, but it must always be present.
 */
const PII_KEY_DENYLIST = [
  "email",
  "name",
  "firstname",
  "first_name",
  "lastname",
  "last_name",
  "fullname",
  "full_name",
  "phone",
  "phonenumber",
  "phone_number",
  "address",
  "postalcode",
  "postal_code",
  "message",
  "messagebody",
  "message_body",
  "notes",
  "studentnotes",
  "student_notes",
  "bookingcomment",
  "booking_comment",
  "documenturl",
  "document_url",
  "documentname",
  "document_name",
  "paymentintent",
  "payment_intent",
  "chargeid",
  "charge_id",
  "stripeaccountid",
  "stripe_account_id",
  "authtoken",
  "auth_token",
  "sessiontoken",
  "session_token",
  "password",
  "userid",
  "user_id",
  "studentid",
  "student_id",
  "tutorid",
  "tutor_id",
  "bookingid",
  "booking_id",
  "id",
] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-\s]/g, "_");
}

/** True if `key` is a denylisted property name (case/separator-insensitive). */
export function isDeniedPropertyKey(key: string): boolean {
  return (PII_KEY_DENYLIST as readonly string[]).includes(normalizeKey(key));
}

/** Returns every denylisted key found on a properties object, or an empty array. */
export function findDeniedProperties(properties: Record<string, unknown> | undefined): string[] {
  if (!properties) return [];
  return Object.keys(properties).filter(isDeniedPropertyKey);
}
