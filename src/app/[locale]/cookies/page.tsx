import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { LegalDocument } from "@/components/marketing/LegalDocument";
import { CookiePreferencesControl } from "@/components/marketing/CookiePreferencesControl";
import { Section } from "@/components/ui/Section";
import { cookieContentEn } from "@/content/legal/cookieContent.en";
import { cookieContentFr } from "@/content/legal/cookieContent.fr";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.cookies" });
  return publicPageMetadata({ locale, path: "/cookies", title: t("title"), description: t("description") });
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
      <Section className="bg-white pb-0">
        <div className="mx-auto max-w-3xl">
          <CookiePreferencesControl />
        </div>
      </Section>
      <LegalDocument
        title={t("cookiesTitle")}
        effectiveDateLabel={t("effectiveDate")}
        lastUpdatedLabel={t("lastUpdated")}
        content={content}
        relatedLinks={[
          { href: "/terms", label: t("termsTitle") },
          { href: "/privacy", label: t("privacyTitle") },
          { href: "/tutor-agreement", label: t("tutorAgreementTitle") },
        ]}
      />
    </MarketingShell>
  );
}
