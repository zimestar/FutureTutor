import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthExperienceShell } from "@/components/marketing/AuthExperienceShell";
import { ActivateAccountForm } from "@/components/marketing/ActivateAccountForm";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const t = await getTranslations({ locale, namespace: "metadata.verifyEmail" });
  return publicPageMetadata({ locale, path: "/verify-email", title: t("title"), description: t("description") });
}
export default async function VerifyEmailPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth.verifyEmail" });
  const editorial = await getTranslations({ locale, namespace: "publicExperience.authEditorial" });
  return <main id="main"><AuthExperienceShell title={t("title")} subtitle={t("subtitle")} statement={editorial("verification.statement")} statementSupport={editorial("verification.support")} imageAlt={editorial("imageAlt")}><Suspense fallback={<p role="status" className="text-sm text-slate">{t("activating")}</p>}><ActivateAccountForm /></Suspense></AuthExperienceShell></main>;
}
