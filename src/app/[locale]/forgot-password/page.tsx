import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { ForgotPasswordForm } from "@/components/marketing/ForgotPasswordForm";
import { Section } from "@/components/ui/Section";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.forgotPassword" });
  return { title: t("title"), description: t("description") };
}

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth.forgotPassword" });

  return (
    <MarketingShell>
      <Section className="bg-off-white">
        <div className="mx-auto w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate">{t("subtitle")}</p>
          <div className="mt-6"><ForgotPasswordForm /></div>
        </div>
      </Section>
    </MarketingShell>
  );
}
