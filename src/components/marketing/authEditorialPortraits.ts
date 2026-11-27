export const authEditorialPortraits = [
  "/images/auth-student-1.webp",
  "/images/auth-student-2.webp",
  "/images/auth-student-3.webp",
  "/images/auth-student-4.webp",
  "/images/auth-student-5.webp",
] as const;

export function selectAuthPortrait(value: number) {
  return authEditorialPortraits[Math.abs(Math.trunc(value)) % authEditorialPortraits.length];
}

/** DESIGN-SYSTEM3 — per-photo focal point so the face stays above the
 * statement overlaid on the lower part of the auth panel. The photos are
 * landscape, so only the horizontal position matters in the tall panel. */
const PORTRAIT_FOCUS: Record<string, string> = {
  "/images/auth-student-1.webp": "34% 50%",
  "/images/auth-student-2.webp": "80% 50%",
  "/images/auth-student-3.webp": "49% 50%",
  "/images/auth-student-4.webp": "67% 50%",
  "/images/auth-student-5.webp": "48% 50%",
};

export function authPortraitFocus(src: string): string {
  return PORTRAIT_FOCUS[src] ?? "50% 40%";
}
