import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarRange, Star, Laptop2, Users2 } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { FAQ } from "@/components/marketing/FAQ";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "becomeATutorPage" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

const perks = [
  { key: "schedule" as const, icon: CalendarRange },
  { key: "reputation" as const, icon: Star },
  { key: "teach" as const, icon: Laptop2 },
  { key: "manage" as const, icon: Users2 },
];

export default async function BecomeATutorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "becomeATutorPage" });

  return (
    <MarketingShell>
      <Section className="bg-navy pb-10 pt-14 text-white md:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">{t("heading")}</h1>
          <p className="mt-4 text-lg text-white/70">{t("subheading")}</p>
          <div className="mt-8 flex justify-center" id="resources">
            <Button href="/signup" variant="primary" size="lg">
              {t("apply")}
            </Button>
          </div>
          <p className="mt-3 text-xs text-white/50">{t("note")}</p>
        </div>
      </Section>

      <Section className="bg-white">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map((perk) => (
            <div key={perk.key}>
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-blue/10 text-blue">
                <perk.icon size={22} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-navy">{t(`perks.${perk.key}.title`)}</h3>
              <p className="mt-2 leading-relaxed text-slate">{t(`perks.${perk.key}.description`)}</p>
            </div>
          ))}
        </div>
      </Section>

      <FAQ />
    </MarketingShell>
  );
}
