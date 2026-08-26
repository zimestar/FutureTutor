import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, BadgeCheck, Banknote, BookOpenCheck, CalendarClock, FileText, UserRound, Video } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { Section } from "@/components/ui/Section";
import { Link } from "@/i18n/navigation";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "publicExperience.resources" });
  return publicPageMetadata({ locale, path: "/tutor-resources", title: t("metaTitle"), description: t("metaDescription") });
}

const resources = [
  { icon: UserRound, href: "/become-a-tutor" },
  { icon: FileText, href: "/signup" },
  { icon: BadgeCheck, href: "/become-a-tutor" },
  { icon: CalendarClock, href: "/signup" },
  { icon: BookOpenCheck, href: "/how-it-works" },
  { icon: Video, href: "/how-it-works" },
  { icon: Banknote, href: "/become-a-tutor" },
];

export default async function TutorResourcesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "publicExperience.resources" });
  return (
    <MarketingShell>
      <MarketingPageHero eyebrow={t("hero.eyebrow")} title={t("hero.title")} description={t("hero.description")} primary={{ label: t("hero.primary"), href: "/become-a-tutor" }} secondary={{ label: t("hero.secondary"), href: "/signup" }} />
      <Section className="bg-off-white">
        <SectionIntro eyebrow={t("hub.eyebrow")} title={t("hub.title")} description={t("hub.description")} />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {resources.map(({ icon: Icon, href }, index) => <article key={index} className="flex flex-col rounded-2xl border border-border bg-white p-7 shadow-card"><Icon className="size-7 text-blue" aria-hidden="true" /><h2 className="mt-6 text-xl font-extrabold text-navy">{t(`hub.items.${index}.title`)}</h2><p className="mt-3 flex-1 leading-7 text-text-secondary">{t(`hub.items.${index}.description`)}</p><Link href={href} className="mt-6 inline-flex min-h-11 items-center gap-2 font-bold text-blue hover:text-blue-hover">{t(`hub.items.${index}.cta`)}<ArrowRight className="size-4" aria-hidden="true" /></Link></article>)}
        </div>
        <p className="mx-auto mt-10 max-w-3xl text-center text-sm leading-6 text-text-muted">{t("hub.boundary")}</p>
      </Section>
    </MarketingShell>
  );
}
