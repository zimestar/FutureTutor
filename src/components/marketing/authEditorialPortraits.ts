export const authEditorialPortraits = [
  "/images/auth-portrait-1.webp",
  "/images/auth-portrait-2.webp",
  "/images/auth-portrait-3.webp",
  "/images/auth-portrait-4.webp",
  "/images/auth-portrait-5.webp",
] as const;

export function selectAuthPortrait(value: number) {
  return authEditorialPortraits[Math.abs(Math.trunc(value)) % authEditorialPortraits.length];
}

/** DESIGN-SYSTEM3 — per-photo focal point so the face stays above the
 * statement overlaid on the lower part of the auth panel. */
const PORTRAIT_FOCUS: Record<string, string> = {
  "/images/auth-portrait-1.webp": "50% 100%",
  "/images/auth-portrait-2.webp": "50% 55%",
  "/images/auth-portrait-3.webp": "50% 40%",
  "/images/auth-portrait-4.webp": "50% 45%",
  "/images/auth-portrait-5.webp": "50% 50%",
};

export function authPortraitFocus(src: string): string {
  return PORTRAIT_FOCUS[src] ?? "50% 40%";
}
