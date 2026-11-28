import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, BookOpenCheck, MapPin, PenLine, ShieldCheck } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { Section } from "@/components/ui/Section";
import { Breadcrumbs } from "@/components/ui/Navigation";
import { Link } from "@/i18n/navigation";
import { libraryProvinces, pick } from "@/content/library";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "library" });
  return publicPageMetadata({ locale, path: "/resources/library", title: t("metaTitle"), description: t("metaDescription") });
}

const provinceTones = ["bg-blue text-white", "bg-coral text-navy", "bg-mint text-navy", "bg-lilac text-white"];

export default async function LibraryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "library" });
  const how = t.raw("how.items") as { title: string; text: string }[];
  const howIcons = [BookOpenCheck, PenLine, ShieldCheck];

  return (
    <MarketingShell>
      <Section className="border-b border-border bg-white py-3.5 md:py-3.5">
        <Breadcrumbs items={[{ label: t("breadcrumbResources"), href: "/resources" }, { label: t("breadcrumbLibrary") }]} />
      </Section>
      <MarketingPageHero
        tone="sun"
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        description={t("hero.description")}
        primary={{ label: t("hero.primary"), href: "/resources/library/alberta" }}
        secondary={{ label: t("hero.secondary"), href: "/find-tutors" }}
      />

      <Section className="bg-white">
        <SectionIntro eyebrow={t("provinces.eyebrow")} title={t("provinces.title")} align="left" />
        <ul className="reveal-stagger mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {libraryProvinces.map((province, index) => {
            const body = (
              <>
                <span className={`flex size-12 items-center justify-center rounded-2xl ${province.available ? provinceTones[index % provinceTones.length] : "bg-neutral-100 text-neutral-400"}`}>
                  <MapPin className="size-6" aria-hidden="true" />
                </span>
                <span className="mt-5 block text-xl font-extrabold text-navy">{pick(province.name, locale)}</span>
                <span className={`mt-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${province.available ? "bg-mint-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
                  {province.available ? t("provinces.available") : t("provinces.soon")}
                </span>
                {province.available && (
                  <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-bold text-blue">
                    {t("provinces.courses", { count: province.courses.length })} <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                )}
              </>
            );
            return (
              <li key={province.slug}>
                {province.available ? (
                  <Link href={`/resources/library/${province.slug}`} className="motion-lift flex h-full flex-col rounded-3xl border border-blue-100 bg-blue-50 p-6 hover:shadow-(--shadow-card-hover)">
                    {body}
                  </Link>
                ) : (
                  <div className="flex h-full flex-col rounded-3xl border border-dashed border-border-strong bg-white p-6 opacity-80">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section className="bg-sun-50">
        <SectionIntro eyebrow={t("how.eyebrow")} title={t("how.title")} />
        <ul className="reveal-stagger mt-12 grid gap-5 md:grid-cols-3">
          {how.map((item, index) => {
            const Icon = howIcons[index % howIcons.length];
            return (
              <li key={item.title} className="rounded-3xl border border-sun-100 bg-white p-7">
                <span className={`flex size-12 items-center justify-center rounded-2xl ${["bg-blue text-white", "bg-coral text-navy", "bg-mint text-navy"][index % 3]}`}>
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <p className="mt-5 text-lg font-bold text-navy">{item.title}</p>
                <p className="mt-2 leading-7 text-text-secondary">{item.text}</p>
              </li>
            );
          })}
        </ul>
      </Section>
    </MarketingShell>
  );
}
