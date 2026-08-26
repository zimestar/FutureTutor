import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { TutorDirectory, type TutorDirectorySearchParams } from "@/components/marketing/TutorDirectory";
import { publicPageMetadata } from "@/lib/publicMetadata";

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
  return (
    <MarketingShell>
      <TutorDirectory locale={locale} searchParams={resolvedSearchParams} />
    </MarketingShell>
  );
}
