import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, GraduationCap, KeyRound, Mail, ShieldAlert, UsersRound } from "lucide-react";
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
        {/* DESIGN-SYSTEM2 — a contact page must show how to reach the team:
            the address in clear, plus the safety form for anything urgent. */}
        <div className="mt-12 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-2xl bg-navy p-8 text-white shadow-(--shadow-pop)" aria-labelledby="contact-direct-title">
            <Mail className="size-7 text-mint" aria-hidden="true" />
            <h2 id="contact-direct-title" className="mt-5 text-2xl font-extrabold tracking-tight">{t("direct.title")}</h2>
            <p className="mt-2 max-w-xl leading-7 text-white/75">{t("direct.description")}</p>
            <p className="mt-5 text-lg font-bold tracking-tight">{SUPPORT_EMAIL}</p>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t("general.emailSubject"))}`} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 font-bold text-navy transition-colors hover:bg-white/90">
              {t("direct.cta")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </section>
          <section className="flex flex-col rounded-2xl border border-border bg-white p-8 shadow-card" aria-labelledby="contact-safety-title">
            <ShieldAlert className="size-7 text-red-600" aria-hidden="true" />
            <h2 id="contact-safety-title" className="mt-5 text-xl font-extrabold text-navy">{t("safety.title")}</h2>
            <p className="mt-2 flex-1 leading-7 text-text-secondary">{t("safety.description")}</p>
            <Link href="/report-concern" className="mt-6 inline-flex min-h-11 items-center gap-2 font-bold text-blue hover:text-blue-hover">
              {t("safety.cta")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </section>
        </div>
      </Section>
    </MarketingShell>
  );
}
