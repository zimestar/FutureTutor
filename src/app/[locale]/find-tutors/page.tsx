import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { TutorDirectory, type TutorDirectorySearchParams } from "@/components/marketing/TutorDirectory";
import { Section } from "@/components/ui/Section";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { Link } from "@/i18n/navigation";
import { publicPageMetadata } from "@/lib/publicMetadata";
import { TrackPageView } from "@/components/marketing/TrackPageView";
import type { Locale } from "@/lib/analytics";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "findTutorsPage" });
  return publicPageMetadata({ locale, path: "/find-tutors", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function FindTutorsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<TutorDirectorySearchParams>;
}) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "findTutorsPage.intro" });
  return (
    <MarketingShell>
      <TrackPageView event="page_view" properties={{ locale: locale as Locale, page_type: "find_tutors" }} />
      <TutorDirectory locale={locale} searchParams={resolvedSearchParams} />
      <Section className="bg-white pt-0">
        <div className="mx-auto max-w-3xl border-t border-border pt-10">
          <SectionIntro title={t("heading")} description={t("description")} align="left" />
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/subjects" className="font-semibold text-blue hover:text-blue-hover">{t("linkSubjects")}</Link>
            <Link href="/tutoring/edmonton" className="font-semibold text-blue hover:text-blue-hover">{t("linkEdmonton")}</Link>
            <Link href="/how-it-works" className="font-semibold text-blue hover:text-blue-hover">{t("linkHowItWorks")}</Link>
          </div>
        </div>
      </Section>
    </MarketingShell>
  );
}
