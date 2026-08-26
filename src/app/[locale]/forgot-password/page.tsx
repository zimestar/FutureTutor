import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthExperienceShell } from "@/components/marketing/AuthExperienceShell";
import { ForgotPasswordForm } from "@/components/marketing/ForgotPasswordForm";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const t = await getTranslations({ locale, namespace: "metadata.forgotPassword" });
  return publicPageMetadata({ locale, path: "/forgot-password", title: t("title"), description: t("description") });
}
export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth.forgotPassword" });
  const editorial = await getTranslations({ locale, namespace: "publicExperience.authEditorial" });
  return <main id="main"><AuthExperienceShell title={t("title")} subtitle={t("subtitle")} statement={editorial("recovery.statement")} statementSupport={editorial("recovery.support")} imageAlt={editorial("imageAlt")}><ForgotPasswordForm /></AuthExperienceShell></main>;
}
