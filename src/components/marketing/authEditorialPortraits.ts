export const authEditorialPortraits = [
  "/images/auth-editorial-1.png",
  "/images/auth-editorial-2.png",
  "/images/auth-editorial-3.png",
  "/images/auth-editorial-4.png",
  "/images/auth-editorial-5.png",
] as const;

export function selectAuthPortrait(value: number) {
  return authEditorialPortraits[Math.abs(Math.trunc(value)) % authEditorialPortraits.length];
}
