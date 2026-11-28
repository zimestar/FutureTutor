import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { IkaAssistantView } from "@/components/assistant/IkaAssistantView";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "assistant" });
  return { title: t("metaTitle") };
}

/** Ika for parents. */
export default async function AssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ika_checkout?: string }>;
}) {
  const { locale } = await params;
  const { ika_checkout } = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  const user = session?.user;
  if (!user) {
    redirect({ href: "/login", locale });
    return;
  }
  if (user.role !== "PARENT") {
    redirect({ href: "/dashboard", locale });
    return;
  }

  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const navItems = getStudentDashboardNavItems((key) => tNav(key), "PARENT");

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""}>
      <IkaAssistantView locale={locale === "en" ? "en" : "fr"} userId={user.id} audience="PARENT" checkoutSessionId={ika_checkout} />
    </DashboardShell>
  );
}
