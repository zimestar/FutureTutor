import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthExperienceShell } from "@/components/marketing/AuthExperienceShell";
import { LoginForm } from "@/components/marketing/LoginForm";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const t = await getTranslations({ locale, namespace: "metadata.login" });
  return publicPageMetadata({ locale, path: "/login", title: t("title"), description: t("description") });
}
export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth.login" });
  const editorial = await getTranslations({ locale, namespace: "publicExperience.authEditorial" });
  return <main id="main"><AuthExperienceShell title={t("title")} subtitle={t("subtitle")} statement={editorial("login.statement")} statementSupport={editorial("login.support")} imageAlt={editorial("imageAlt")}><LoginForm /></AuthExperienceShell></main>;
}
