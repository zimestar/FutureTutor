import type { ReactNode } from "react";
import { DotCluster, HalfCircles, Sparkle } from "@/components/marketing/Decor";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * APP-COLOR — bright welcome banner for the signed-in spaces (student,
 * parent, tutor, admin). Same palette and playful shapes as the public site,
 * kept compact so the real content stays above the fold.
 */
export type DashboardHeroTone = "blue" | "coral" | "mint" | "lilac";

const tones: Record<DashboardHeroTone, { box: string; body: string; circle: string; dots: string; half: string }> = {
  blue: { box: "bg-blue text-white", body: "text-white/85", circle: "bg-sun", dots: "text-coral", half: "text-mint" },
  coral: { box: "bg-coral text-navy", body: "text-navy/80", circle: "bg-sun", dots: "text-blue", half: "text-lilac" },
  mint: { box: "bg-mint text-navy", body: "text-navy/80", circle: "bg-sun", dots: "text-blue", half: "text-coral" },
  lilac: { box: "bg-lilac text-navy", body: "text-navy/85", circle: "bg-sun", dots: "text-coral", half: "text-mint" },
};

export function DashboardHero({
  title,
  description,
  badge,
  actions,
  tone = "blue",
  headingId,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  tone?: DashboardHeroTone;
  headingId?: string;
}) {
  const c = tones[tone];
  return (
    <section aria-labelledby={headingId} className={cn("relative isolate overflow-hidden rounded-[28px] px-6 py-8 sm:px-9 sm:py-10", c.box)}>
      <span aria-hidden="true" className={cn("motion-settle pointer-events-none absolute -right-14 -top-16 size-56 rounded-full sm:size-64", c.circle)} />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-white/10" />
      <DotCluster delay={300} className={cn("right-[18%] top-6 hidden w-12 md:block", c.dots)} />
      <Sparkle delay={800} className="bottom-6 right-[30%] hidden w-7 text-white md:block" />
      <HalfCircles delay={1100} className={cn("bottom-4 right-8 hidden w-20 sm:block", c.half)} />
      <div className="relative max-w-2xl">
        {badge && <div className="motion-intro mb-3">{badge}</div>}
        <h1 id={headingId} className="motion-intro text-3xl font-extrabold tracking-[-0.025em] [--motion-delay:60ms] sm:text-4xl">
          {title}
        </h1>
        {description && <p className={cn("motion-intro mt-2 text-base leading-7 [--motion-delay:120ms] sm:text-lg", c.body)}>{description}</p>}
        {actions && <div className="motion-intro mt-6 flex flex-col gap-3 [--motion-delay:180ms] sm:flex-row sm:flex-wrap">{actions}</div>}
      </div>
    </section>
  );
}

/** Small coloured tile used for at-a-glance figures and shortcuts. */
export function DashboardTile({
  icon,
  label,
  value,
  href,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value?: ReactNode;
  href?: string;
  tone: "blue" | "coral" | "mint" | "sun" | "lilac";
}) {
  const t = {
    blue: "border-blue-100 bg-blue-50 [--chip:var(--color-blue)] [--chip-ink:#fff]",
    coral: "border-coral-100 bg-coral-50 [--chip:var(--color-coral)] [--chip-ink:var(--color-navy)]",
    mint: "border-mint-100 bg-mint-50 [--chip:var(--color-mint)] [--chip-ink:var(--color-navy)]",
    sun: "border-sun-100 bg-sun-50 [--chip:var(--color-sun)] [--chip-ink:var(--color-navy)]",
    lilac: "border-lilac-100 bg-lilac-50 [--chip:var(--color-lilac)] [--chip-ink:#fff]",
  }[tone];
  const body = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-(--chip) text-(--chip-ink)">{icon}</span>
      <span className="min-w-0">
        {value !== undefined && <span className="block text-2xl font-extrabold leading-tight text-navy">{value}</span>}
        <span className="block text-sm font-semibold text-navy/75">{label}</span>
      </span>
    </>
  );
  const className = cn("flex flex-col items-start gap-3 rounded-3xl border p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5", t, href && "motion-lift hover:shadow-(--shadow-card-hover)");
  if (href) return <Link href={href} className={className}>{body}</Link>;
  return <div className={className}>{body}</div>;
}
