import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, CircleHelp, GraduationCap, KeyRound, UsersRound } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingPageHero } from "@/components/marketing/MarketingPageHero";
import { Section } from "@/components/ui/Section";
import { Link } from "@/i18n/navigation";
import { publicPageMetadata } from "@/lib/publicMetadata";

// BETA-LAUNCHFIX1 — reuses the same existing FutureTutor contact address
// (see src/components/dashboard/FeedbackLink.tsx's doc comment for the full
// reasoning) rather than inventing a new one.
const SUPPORT_EMAIL = "legal@futuretutor.ca";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "publicExperience.contact" });
  return publicPageMetadata({ locale, path: "/contact", title: t("metaTitle"), description: t("metaDescription") });
}

const routes = [{ icon: KeyRound, href: "/forgot-password" }, { icon: UsersRound, href: "/how-it-works" }, { icon: GraduationCap, href: "/tutor-resources" }];

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "publicExperience.contact" });
  return (
    <MarketingShell>
      <MarketingPageHero eyebrow={t("hero.eyebrow")} title={t("hero.title")} description={t("hero.description")} primary={{ label: t("hero.primary"), href: "/how-it-works" }} secondary={{ label: t("hero.secondary"), href: "/login" }} />
      <Section className="bg-off-white">
        <div className="grid gap-5 md:grid-cols-3">
          {routes.map(({ icon: Icon, href }, index) => <article key={href} className="flex flex-col rounded-2xl border border-border bg-white p-7 shadow-card"><Icon className="size-7 text-blue" aria-hidden="true" /><h2 className="mt-6 text-xl font-extrabold text-navy">{t(`routes.${index}.title`)}</h2><p className="mt-3 flex-1 leading-7 text-text-secondary">{t(`routes.${index}.description`)}</p><Link href={href} className="mt-6 inline-flex min-h-11 items-center gap-2 font-bold text-blue hover:text-blue-hover">{t(`routes.${index}.cta`)}<ArrowRight className="size-4" aria-hidden="true" /></Link></article>)}
        </div>
        <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-dashed border-border-strong bg-white p-7 text-center"><CircleHelp className="mx-auto size-6 text-slate" aria-hidden="true" /><h2 className="mt-4 text-xl font-extrabold text-navy">{t("general.title")}</h2><p className="mt-2 leading-7 text-text-secondary">{t("general.description")}</p><a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t("general.emailSubject"))}`} className="mt-5 inline-flex min-h-11 items-center gap-2 font-bold text-blue hover:text-blue-hover">{t("general.cta")}<ArrowRight className="size-4" aria-hidden="true" /></a></div>
      </Section>
    </MarketingShell>
  );
}
