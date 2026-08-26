import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthExperienceShell } from "@/components/marketing/AuthExperienceShell";
import { ResetPasswordForm } from "@/components/marketing/ResetPasswordForm";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const t = await getTranslations({ locale, namespace: "metadata.resetPassword" });
  return publicPageMetadata({ locale, path: "/reset-password", title: t("title"), description: t("description") });
}
export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth.resetPassword" });
  const editorial = await getTranslations({ locale, namespace: "publicExperience.authEditorial" });
  return <main id="main"><AuthExperienceShell title={t("title")} subtitle={t("subtitle")} statement={editorial("recovery.statement")} statementSupport={editorial("recovery.support")} imageAlt={editorial("imageAlt")}><Suspense fallback={<p role="status" className="text-sm text-slate">{t("loading")}</p>}><ResetPasswordForm /></Suspense></AuthExperienceShell></main>;
}
