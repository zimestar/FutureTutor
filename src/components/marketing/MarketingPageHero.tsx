import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

export function MarketingPageHero({ eyebrow, title, description, primary, secondary, image, imageAlt = "", imagePosition = "center" }: {
  eyebrow: string;
  title: string;
  description: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  image?: string;
  imageAlt?: string;
  imagePosition?: string;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-navy py-16 text-white md:py-24 lg:py-28">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(37,99,235,0.34),transparent_34%),radial-gradient(circle_at_92%_82%,rgba(16,185,129,0.2),transparent_30%)]" />
      <Container className="relative grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="max-w-2xl animate-fade-up">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-mint">
            <Sparkles className="size-4" aria-hidden="true" />
            {eyebrow}
          </p>
          <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-white/76 md:text-xl">{description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button href={primary.href} size="lg">{primary.label}<ArrowRight className="size-4" aria-hidden="true" /></Button>
            {secondary && <Button href={secondary.href} variant="ghost-inverse" size="lg">{secondary.label}</Button>}
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-5 rounded-[2rem] border border-white/10 bg-white/5" aria-hidden="true" />
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-blue/45 via-navy to-mint/25 shadow-pop">
            {image ? (
              <Image src={image} alt={imageAlt} fill priority sizes="(min-width: 1024px) 44vw, 92vw" className="object-cover" style={{ objectPosition: imagePosition }} />
            ) : (
              <div aria-hidden="true" className="absolute inset-0">
                <span className="absolute left-[16%] top-[28%] size-24 rounded-full border border-white/30 bg-white/10" />
                <span className="absolute bottom-[24%] right-[14%] size-32 rounded-full border border-mint/50 bg-mint/10" />
                <span className="absolute left-[32%] top-1/2 h-px w-[42%] -rotate-12 bg-gradient-to-r from-white/20 to-mint" />
              </div>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
