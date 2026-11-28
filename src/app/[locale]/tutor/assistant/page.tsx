import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { IkaAssistantView } from "@/components/assistant/IkaAssistantView";
import { tutorNavItems } from "@/lib/tutorNav";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "assistant" });
  return { title: t("metaTitle") };
}

/** Ika for approved tutors: session plans, exercises, explanations, parent summaries. */
export default async function TutorAssistantPage({
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
  if (!user || user.role !== "TUTOR") {
    redirect({ href: "/login", locale });
    return;
  }
  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: user.id }, select: { applicationStatus: true, user: { select: { image: true } } } });
  if (tutorProfile?.applicationStatus !== "APPROVED") {
    redirect({ href: "/tutor/dashboard", locale });
    return;
  }

  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });

  return (
    <DashboardShell navItems={tutorNavItems(tNav, tutorProfile.applicationStatus)} userName={user.name ?? ""} userImage={tutorProfile.user.image}>
      <IkaAssistantView locale={locale === "en" ? "en" : "fr"} userId={user.id} audience="TUTOR" checkoutSessionId={ika_checkout} />
    </DashboardShell>
  );
}
