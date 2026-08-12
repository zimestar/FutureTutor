import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { SubjectGrid } from "@/components/marketing/SubjectGrid";
import { Section } from "@/components/ui/Section";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.subjects" });
  return { title: t("title"), description: t("description") };
}

export default async function SubjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "subjects" });

  return (
    <MarketingShell>
      <Section className="bg-off-white pb-0">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-navy md:text-5xl">
            {t("indexTitle")}
          </h1>
          <p className="mt-4 text-lg text-slate">{t("indexSubtitle")}</p>
        </div>
      </Section>
      <SubjectGrid />
    </MarketingShell>
  );
}
