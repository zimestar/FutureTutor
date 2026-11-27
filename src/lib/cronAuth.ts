import { createHash, timingSafeEqual } from "crypto";

/**
 * Constant-time comparison of a cron request's shared secret.
 *
 * Both values are hashed first so the comparison takes the same time
 * whatever the provided value's length (timingSafeEqual itself requires
 * equal-length inputs). A missing or empty secret never matches.
 */
export function isValidCronSecret(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
