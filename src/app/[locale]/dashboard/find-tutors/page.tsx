import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TutorDirectory, type TutorDirectorySearchParams } from "@/components/marketing/TutorDirectory";
import { auth } from "@/lib/auth";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "findTutorsPage" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function AuthenticatedFindTutorsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<TutorDirectorySearchParams>;
}) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  setRequestLocale(locale);
  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "STUDENT" && user.role !== "PARENT")) redirect(`/${locale}/login`);
  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  return (
    <DashboardShell navItems={getStudentDashboardNavItems(tNav, user.role)} userName={user.name ?? ""}>
      <TutorDirectory locale={locale} searchParams={resolvedSearchParams} authenticated />
    </DashboardShell>
  );
}
