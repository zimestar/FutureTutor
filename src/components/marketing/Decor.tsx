import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * HOME-COLOR — playful decorative shapes placed around photos and in
 * coloured sections. Purely visual: every shape is aria-hidden and
 * pointer-events-none, and positioned by the caller with `className`.
 */

type ShapeProps = { className?: string; delay?: number; float?: boolean };

function style(delay?: number): CSSProperties | undefined {
  return delay ? ({ "--motion-delay": `${delay}ms` } as CSSProperties) : undefined;
}

const base = "pointer-events-none absolute select-none";

/** Four-point sparkle star. */
export function Sparkle({ className, delay, float = true, color = "currentColor" }: ShapeProps & { color?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" style={style(delay)} className={cn(base, float && "motion-float", className)}>
      <path d="M20 0c1.6 10.4 9.6 18.4 20 20-10.4 1.6-18.4 9.6-20 20-1.6-10.4-9.6-18.4-20-20C10.4 18.4 18.4 10.4 20 0Z" fill={color} />
    </svg>
  );
}

/** A 2x2 cluster of solid dots (Khan-style "bubbles"). */
export function DotCluster({ className, delay, float = true, color = "currentColor" }: ShapeProps & { color?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" style={style(delay)} className={cn(base, float && "motion-float", className)}>
      <circle cx="25" cy="25" r="24" fill={color} />
      <circle cx="75" cy="25" r="24" fill={color} />
      <circle cx="25" cy="75" r="24" fill={color} />
      <circle cx="75" cy="75" r="24" fill={color} />
    </svg>
  );
}

/** Two stacked half circles. */
export function HalfCircles({ className, delay, float = true, color = "currentColor" }: ShapeProps & { color?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 80 44" style={style(delay)} className={cn(base, float && "motion-float", className)}>
      <path d="M0 44a20 20 0 0 1 40 0Z" fill={color} />
      <path d="M40 44a20 20 0 0 1 40 0Z" fill={color} opacity="0.75" />
      <path d="M20 22a20 20 0 0 1 40 0Z" fill={color} opacity="0.9" />
    </svg>
  );
}

/** Hand-drawn squiggle line that draws itself in. */
export function Squiggle({ className, delay, color = "currentColor" }: ShapeProps & { color?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 40" fill="none" preserveAspectRatio="none" style={style(delay)} className={cn(base, "motion-draw", className)}>
      <path pathLength={1} d="M4 30C18 6 30 6 38 22s20 16 30-2 22-18 30 0 14 10 18 4" stroke={color} strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Dotted grid patch. */
export function DotGrid({ className, color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 90 90" className={cn(base, className)}>
      {Array.from({ length: 5 }).flatMap((_, row) =>
        Array.from({ length: 5 }).map((__, col) => <circle key={`${row}-${col}`} cx={9 + col * 18} cy={9 + row * 18} r="3.2" fill={color} />)
      )}
    </svg>
  );
}

/** Slowly turning ring with a gap, for depth behind photos. */
export function Ring({ className, color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" fill="none" className={cn(base, "motion-spin", className)}>
      <circle cx="50" cy="50" r="44" stroke={color} strokeWidth="5" strokeDasharray="210 66" strokeLinecap="round" />
    </svg>
  );
}
