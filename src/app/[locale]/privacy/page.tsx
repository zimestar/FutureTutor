import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LegalDocument } from "@/components/marketing/LegalDocument";
import { privacyContentEn } from "@/content/legal/privacyContent.en";
import { privacyContentFr } from "@/content/legal/privacyContent.fr";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.privacy" });
  return publicPageMetadata({ locale, path: "/privacy", title: t("title"), description: t("description") });
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal" });

  const content = locale === "fr" ? privacyContentFr : privacyContentEn;

  return (
    <MarketingShell>
      <LegalDocument
        title={t("privacyTitle")}
        effectiveDateLabel={t("effectiveDate")}
        lastUpdatedLabel={t("lastUpdated")}
        content={content}
        relatedLinks={[
          { href: "/terms", label: t("termsTitle") },
          { href: "/cookies", label: t("cookiesTitle") },
          { href: "/tutor-agreement", label: t("tutorAgreementTitle") },
        ]}
      />
    </MarketingShell>
  );
}
