import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { ResetPasswordForm } from "@/components/marketing/ResetPasswordForm";
import { Section } from "@/components/ui/Section";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.resetPassword" });
  return { title: t("title"), description: t("description") };
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth.resetPassword" });

  return (
    <MarketingShell>
      <Section className="bg-off-white">
        <div className="mx-auto w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate">{t("subtitle")}</p>
          <div className="mt-6">
            <Suspense fallback={<p role="status" className="text-sm text-slate">{t("loading")}</p>}>
              <ResetPasswordForm />
            </Suspense>
          </div>
        </div>
      </Section>
    </MarketingShell>
  );
}
