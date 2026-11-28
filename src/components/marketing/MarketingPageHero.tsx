import type { CSSProperties } from "react";
import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { TrackedCtaButton } from "@/components/marketing/TrackedCtaButton";
import { trackingForHref } from "@/components/marketing/heroCtaTracking";
import { DotCluster, DotGrid, HalfCircles, Ring, Sparkle } from "@/components/marketing/Decor";
import { cn } from "@/lib/utils";

/**
 * DATA-2 — MarketingPageHero is reused across the real public pages (about,
 * become-a-tutor, contact, how-it-works, resources, subjects, pricing,
 * safety, parents, online-classroom, tutor-resources, tutoring/[city]), so
 * trackingForHref's mapping (heroCtaTracking.ts) is what makes every hero
 * CTA on every one of those pages measurable without touching each page
 * individually. Only hrefs matching a certified event's own intent are
 * tracked; any other href renders the plain, untracked Button.
 *
 * HOME-COLOR — each page picks a bright `tone`; the photo is framed by the
 * same playful shapes as the homepage, and the copy enters with motion.
 */
export type HeroTone = "blue" | "sun" | "mint" | "coral" | "lilac";

type ToneStyle = {
  section: string;
  eyebrow: string;
  body: string;
  primary: "primary" | "inverse";
  secondary: { variant: "ghost-inverse" | "ghost"; className?: string };
  circle: string;
  dots: string;
  sparkle: string;
  half: string;
  ring: string;
  glow: string;
};

const lightSecondary = { variant: "ghost" as const, className: "border border-navy/25 hover:bg-navy/5" };

const tones: Record<HeroTone, ToneStyle> = {
  blue: {
    section: "bg-blue text-white",
    eyebrow: "text-sun-ink",
    body: "text-white/85",
    primary: "inverse",
    secondary: { variant: "ghost-inverse" },
    circle: "bg-sun",
    dots: "text-coral",
    sparkle: "text-white",
    half: "text-lilac",
    ring: "text-mint",
    glow: "bg-white/[0.07]",
  },
  sun: {
    section: "bg-sun text-navy",
    eyebrow: "text-navy/70",
    body: "text-navy/80",
    primary: "primary",
    secondary: lightSecondary,
    circle: "bg-coral",
    dots: "text-blue",
    sparkle: "text-white",
    half: "text-mint",
    ring: "text-blue",
    glow: "bg-white/25",
  },
  mint: {
    section: "bg-mint text-navy",
    eyebrow: "text-navy/70",
    body: "text-navy/80",
    primary: "primary",
    secondary: lightSecondary,
    circle: "bg-sun",
    dots: "text-blue",
    sparkle: "text-white",
    half: "text-coral",
    ring: "text-navy/60",
    glow: "bg-white/20",
  },
  coral: {
    section: "bg-coral text-navy",
    eyebrow: "text-navy/70",
    body: "text-navy/80",
    primary: "primary",
    secondary: lightSecondary,
    circle: "bg-sun",
    dots: "text-blue",
    sparkle: "text-white",
    half: "text-lilac",
    ring: "text-white/80",
    glow: "bg-white/20",
  },
  lilac: {
    section: "bg-lilac text-navy",
    eyebrow: "text-navy/70",
    body: "text-navy/85",
    primary: "primary",
    secondary: lightSecondary,
    circle: "bg-sun",
    dots: "text-coral",
    sparkle: "text-white",
    half: "text-mint",
    ring: "text-white/80",
    glow: "bg-white/20",
  },
};

const delay = (ms: number) => ({ "--motion-delay": `${ms}ms` }) as CSSProperties;

export function MarketingPageHero({ eyebrow, title, description, primary, secondary, image, imageAlt = "", imagePosition = "center", tone = "blue" }: {
  eyebrow: string;
  title: string;
  description: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  image?: string;
  imageAlt?: string;
  imagePosition?: string;
  tone?: HeroTone;
}) {
  const primaryTracking = trackingForHref(primary.href);
  const secondaryTracking = secondary ? trackingForHref(secondary.href) : null;
  const c = tones[tone];
  return (
    <section data-tone={tone} className={cn("relative isolate overflow-hidden py-16 md:py-24 lg:py-28", c.section)}>
      <span aria-hidden="true" className={cn("pointer-events-none absolute -left-40 -top-40 size-[480px] rounded-full", c.glow)} />
      <span aria-hidden="true" className={cn("pointer-events-none absolute -bottom-48 -right-32 size-[520px] rounded-full", c.glow)} />
      <DotGrid className="left-[44%] top-8 hidden w-20 opacity-30 lg:block" />
      {!image && (
        <>
          <span aria-hidden="true" style={delay(150)} className={cn("motion-settle pointer-events-none absolute -right-16 top-1/2 hidden size-72 -translate-y-1/2 rounded-full md:block", c.circle)} />
          <DotCluster delay={400} className={cn("right-[22%] top-12 hidden w-16 md:block", c.dots)} />
          <Sparkle delay={900} className={cn("bottom-14 right-[30%] hidden w-9 md:block", c.sparkle)} />
          <HalfCircles delay={1200} className={cn("bottom-10 right-[8%] hidden w-24 md:block", c.half)} />
        </>
      )}
      {/* DESIGN-SYSTEM2 — without a photo the hero is a single, generous text
          column; an empty decorative frame read as an unfinished page. */}
      <Container className={image ? "relative grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16" : "relative"}>
        <div className={image ? "max-w-2xl" : "max-w-3xl"}>
          <p className={cn("motion-intro flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em]", c.eyebrow)}>
            <Sparkles className="size-4" aria-hidden="true" />
            {eyebrow}
          </p>
          <h1 style={delay(80)} className="motion-intro mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-[-0.025em] sm:text-5xl lg:text-6xl">{title}</h1>
          <p style={delay(160)} className={cn("motion-intro mt-6 max-w-xl text-lg leading-8 md:text-xl", c.body)}>{description}</p>
          <div style={delay(240)} className="motion-intro mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            {primaryTracking ? (
              <TrackedCtaButton href={primary.href} {...primaryTracking} variant={c.primary} size="lg">
                {primary.label}<ArrowRight className="size-4" aria-hidden="true" />
              </TrackedCtaButton>
            ) : (
              <Button href={primary.href} variant={c.primary} size="lg">{primary.label}<ArrowRight className="size-4" aria-hidden="true" /></Button>
            )}
            {secondary && (secondaryTracking ? (
              <TrackedCtaButton href={secondary.href} {...secondaryTracking} variant={c.secondary.variant} className={c.secondary.className} size="lg">
                {secondary.label}
              </TrackedCtaButton>
            ) : (
              <Button href={secondary.href} variant={c.secondary.variant} className={c.secondary.className} size="lg">{secondary.label}</Button>
            ))}
          </div>
        </div>
        {image && (
          <div className="relative mx-auto w-full max-w-lg">
            <span aria-hidden="true" style={delay(200)} className={cn("motion-settle pointer-events-none absolute -right-8 -top-10 size-40 rounded-full sm:size-48", c.circle)} />
            <Ring className={cn("-bottom-10 -left-10 hidden size-32 sm:block", c.ring)} />
            <DotCluster delay={400} className={cn("-left-10 top-[20%] hidden w-16 sm:block", c.dots)} />
            <Sparkle delay={900} className={cn("-right-3 bottom-[28%] z-20 w-9", c.sparkle)} />
            <HalfCircles delay={1200} className={cn("-bottom-5 right-10 z-20 w-20", c.half)} />
            <div style={delay(120)} className="motion-settle relative z-10 aspect-[4/3] overflow-hidden rounded-[32px] border-[6px] border-white shadow-[0_40px_80px_-30px_rgba(13,27,42,0.55)]">
              <Image src={image} alt={imageAlt} fill priority sizes="(min-width: 1024px) 44vw, 92vw" className="object-cover" style={{ objectPosition: imagePosition }} />
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
