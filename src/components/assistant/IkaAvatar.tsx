import { cn } from "@/lib/utils";

/**
 * Ika — FutureTutor's AI assistant. A friendly speech-bubble character
 * (lilac, with eyes and a sun spark) drawn in SVG so it stays sharp and
 * matches the palette. Decorative: pair it with a visible "Ika" label.
 */
export function IkaAvatar({ className, thinking = false }: { className?: string; thinking?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-9", className)} aria-hidden="true" focusable="false">
      <path d="M24 5c10.5 0 19 7.4 19 16.6 0 9.2-8.5 16.6-19 16.6-1.8 0-3.6-.2-5.2-.6L9.6 42.4l2.1-7.9C7.6 31.5 5 26.8 5 21.6 5 12.4 13.5 5 24 5Z" fill="#8b7cf6" />
      <path d="M24 5c10.5 0 19 7.4 19 16.6 0 3.3-1.1 6.4-3 9-2.5-11-11.2-17.6-23.5-17.6-3.1 0-5.9.4-8.4 1.2C11.4 9 17.2 5 24 5Z" fill="#a497ff" opacity="0.7" />
      <ellipse cx="18" cy="21.5" rx="2.6" ry={thinking ? 1.1 : 3.1} fill="#0d1b2a" />
      <ellipse cx="30" cy="21.5" rx="2.6" ry={thinking ? 1.1 : 3.1} fill="#0d1b2a" />
      <circle cx="19" cy="20.3" r="0.9" fill="#ffffff" />
      <circle cx="31" cy="20.3" r="0.9" fill="#ffffff" />
      <path d="M19.5 28.2c2.7 2.2 6.3 2.2 9 0" fill="none" stroke="#0d1b2a" strokeWidth="2" strokeLinecap="round" />
      <circle cx="13.5" cy="26.5" r="2" fill="#ff7a59" opacity="0.55" />
      <circle cx="34.5" cy="26.5" r="2" fill="#ff7a59" opacity="0.55" />
      <path d="M40.5 2.5l1.3 3.4 3.4 1.3-3.4 1.3-1.3 3.4-1.3-3.4-3.4-1.3 3.4-1.3Z" fill="#ffc83d" />
    </svg>
  );
}
