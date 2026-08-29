import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LegalDocument } from "@/components/marketing/LegalDocument";
import { cookieContentEn } from "@/content/legal/cookieContent.en";
import { cookieContentFr } from "@/content/legal/cookieContent.fr";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.cookies" });
  return { title: t("title"), description: t("description") };
}

export default async function CookiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal" });

  const content = locale === "fr" ? cookieContentFr : cookieContentEn;

  return (
    <MarketingShell>
      <LegalDocument
        title={t("cookiesTitle")}
        effectiveDateLabel={t("effectiveDate")}
        lastUpdatedLabel={t("lastUpdated")}
        content={content}
        relatedLinks={[
          { href: "/terms", label: t("termsTitle") },
          { href: "/privacy", label: t("privacyTitle") },
        ]}
      />
    </MarketingShell>
  );
}
