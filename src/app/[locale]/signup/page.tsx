import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthExperienceShell } from "@/components/marketing/AuthExperienceShell";
import { SignupForm } from "@/components/marketing/SignupForm";
import { publicPageMetadata } from "@/lib/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params; const t = await getTranslations({ locale, namespace: "metadata.signup" });
  return publicPageMetadata({ locale, path: "/signup", title: t("title"), description: t("description"), index: false });
}
const ROLE_PARAM = { student: "STUDENT", parent: "PARENT", tutor: "TUTOR" } as const;

export default async function SignupPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ role?: string | string[] }> }) {
  const { locale } = await params; setRequestLocale(locale);
  const { role } = await searchParams;
  const roleKey = typeof role === "string" ? role.toLowerCase() : "";
  const initialRole = roleKey in ROLE_PARAM ? ROLE_PARAM[roleKey as keyof typeof ROLE_PARAM] : undefined;
  const t = await getTranslations({ locale, namespace: "auth.signup" });
  const editorial = await getTranslations({ locale, namespace: "publicExperience.authEditorial" });
  return <main id="main"><AuthExperienceShell title={t("title")} subtitle={t("subtitle")} statement={editorial("signup.statement")} statementSupport={editorial("signup.support")} imageAlt={editorial("imageAlt")}><SignupForm initialRole={initialRole} /></AuthExperienceShell></main>;
}
