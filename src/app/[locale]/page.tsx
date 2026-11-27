import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/marketing/Header";
import { Hero } from "@/components/marketing/Hero";
import { SubjectGrid } from "@/components/marketing/SubjectGrid";
import { FAQ } from "@/components/marketing/FAQ";
import { Footer } from "@/components/marketing/Footer";
import { HomeHowItWorks, HomeParents, HomePricing, HomeResources, HomeSafety } from "@/components/marketing/HomeSections";
import { HomeClassroom, HomeFounders, HomePlatform, HomeRoles, HomeVoices } from "@/components/marketing/HomeShowcase";
import { MobileStickyCta } from "@/components/marketing/MobileStickyCta";
import { Section } from "@/components/ui/Section";
import { Link } from "@/i18n/navigation";
import { site } from "@/content/site";
import { faqItemIds } from "@/content/faq";
import { publicPageMetadata } from "@/lib/publicMetadata";
import { TrackPageView } from "@/components/marketing/TrackPageView";
import type { Locale } from "@/lib/analytics";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return publicPageMetadata({ locale, path: "/", title: t("tagline"), description: t("description") });
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tFaq, tExplore, tLinks] = await Promise.all([
    getTranslations({ locale, namespace: "site" }),
    getTranslations({ locale, namespace: "faq" }),
    getTranslations({ locale, namespace: "publicExperience.home.explore" }),
    getTranslations({ locale, namespace: "footer.links" }),
  ]);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItemIds.map((id) => ({
      "@type": "Question",
      name: tFaq(`items.${id}.question`),
      acceptedAnswer: {
        "@type": "Answer",
        text: tFaq(`items.${id}.answer`),
      },
    })),
  };

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    description: t("description"),
    areaServed: "CA",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <Header />
      <main id="main" className="flex-1">
        <TrackPageView event="futuretutor_page_view" properties={{ locale: locale as Locale, page_type: "homepage" }} />
        <Hero />
        <HomeFounders locale={locale} />
        <HomePlatform locale={locale} />
        <SubjectGrid />
        <HomeClassroom locale={locale} />
        <HomeHowItWorks />
        <HomeParents />
        <HomeSafety />
        <HomeVoices locale={locale} />
        <HomePricing />
        <HomeResources />
        {/* Internal links (SEO): local market, resources and the info pages. */}
        <Section className="bg-white pt-0 md:pt-0">
          <nav aria-label={tExplore("heading")} className="flex flex-col items-center gap-4 border-t border-border pt-10 text-center">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-text-muted">{tExplore("heading")}</p>
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              <Link href="/tutoring/edmonton" className="rounded-full border border-border bg-white px-4 py-2 font-semibold text-navy transition-colors hover:border-blue/30 hover:text-blue">{tExplore("edmonton")}</Link>
              <Link href="/resources" className="rounded-full border border-border bg-white px-4 py-2 font-semibold text-navy transition-colors hover:border-blue/30 hover:text-blue">{tExplore("resources")}</Link>
              <Link href="/parents" className="rounded-full border border-border bg-white px-4 py-2 font-semibold text-navy transition-colors hover:border-blue/30 hover:text-blue">{tLinks("parents")}</Link>
              <Link href="/pricing" className="rounded-full border border-border bg-white px-4 py-2 font-semibold text-navy transition-colors hover:border-blue/30 hover:text-blue">{tLinks("pricing")}</Link>
              <Link href="/safety" className="rounded-full border border-border bg-white px-4 py-2 font-semibold text-navy transition-colors hover:border-blue/30 hover:text-blue">{tLinks("safety")}</Link>
              <Link href="/online-classroom" className="rounded-full border border-border bg-white px-4 py-2 font-semibold text-navy transition-colors hover:border-blue/30 hover:text-blue">{tLinks("classroom")}</Link>
            </div>
          </nav>
        </Section>
        <FAQ />
        <HomeRoles locale={locale} />
        <MobileStickyCta />
      </main>
      <Footer />
    </>
  );
}
