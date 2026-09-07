import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LegalDocument } from "@/components/marketing/LegalDocument";
import { tutorAgreementContentEn } from "@/content/legal/tutorAgreementContent.en";
import { tutorAgreementContentFr } from "@/content/legal/tutorAgreementContent.fr";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.tutorAgreement" });
  return publicPageMetadata({ locale, path: "/tutor-agreement", title: t("title"), description: t("description") });
}

export default async function TutorAgreementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal" });

  const content = locale === "fr" ? tutorAgreementContentFr : tutorAgreementContentEn;

  return (
    <MarketingShell>
      <LegalDocument
        title={t("tutorAgreementTitle")}
        effectiveDateLabel={t("effectiveDate")}
        lastUpdatedLabel={t("lastUpdated")}
        content={content}
        relatedLinks={[
          { href: "/terms", label: t("termsTitle") },
          { href: "/privacy", label: t("privacyTitle") },
          { href: "/cookies", label: t("cookiesTitle") },
        ]}
      />
    </MarketingShell>
  );
}
