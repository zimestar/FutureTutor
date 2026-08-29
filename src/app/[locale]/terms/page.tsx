import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LegalDocument } from "@/components/marketing/LegalDocument";
import { termsContentEn } from "@/content/legal/termsContent.en";
import { termsContentFr } from "@/content/legal/termsContent.fr";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.terms" });
  return { title: t("title"), description: t("description") };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal" });

  const content = locale === "fr" ? termsContentFr : termsContentEn;

  return (
    <MarketingShell>
      <LegalDocument
        title={t("termsTitle")}
        effectiveDateLabel={t("effectiveDate")}
        lastUpdatedLabel={t("lastUpdated")}
        content={content}
        relatedLinks={[
          { href: "/privacy", label: t("privacyTitle") },
          { href: "/cookies", label: t("cookiesTitle") },
          { href: "/tutor-agreement", label: t("tutorAgreementTitle") },
        ]}
      />
    </MarketingShell>
  );
}
