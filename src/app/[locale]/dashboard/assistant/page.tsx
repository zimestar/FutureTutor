import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Library } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { AssistantChat } from "@/components/dashboard/AssistantChat";
import { IkaAvatar } from "@/components/assistant/IkaAvatar";
import { Button } from "@/components/ui/Button";
import { getStudentDashboardNavItems } from "@/lib/dashboardNav";
import { isAssistantConfigured } from "@/lib/assistant/config";
import { questionsRemainingThisMonth } from "@/services/assistantQuota";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "assistant" });
  return { title: t("metaTitle") };
}

/** ASSISTANT-1 — Ika, the parent AI assistant (parents only). */
export default async function AssistantPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
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

  const [t, tNav] = await Promise.all([
    getTranslations({ locale, namespace: "assistant" }),
    getTranslations({ locale, namespace: "dashboard.nav" }),
  ]);
  const navItems = getStudentDashboardNavItems((key) => tNav(key), "PARENT");
  const configured = isAssistantConfigured();
  const remaining = configured ? await questionsRemainingThisMonth(user.id) : 0;

  return (
    <DashboardShell navItems={navItems} userName={user.name ?? ""}>
      <DashboardHero
        tone="lilac"
        headingId="assistant-heading"
        title={t("title")}
        description={t("description")}
        badge={<span className="inline-flex items-center gap-1.5 rounded-full bg-white py-0.5 pl-1 pr-3 text-xs font-bold text-navy"><IkaAvatar className="size-6" />{t("badge")}</span>}
      />
      <div className="mx-auto mt-6 max-w-4xl">
        {configured ? (
          <AssistantChat locale={locale === "fr" ? "fr" : "en"} initialRemaining={remaining} />
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-lilac-100 bg-white p-8 text-center">
            <p className="text-xl font-extrabold text-navy">{t("notConfiguredTitle")}</p>
            <p className="mx-auto mt-2 max-w-lg leading-7 text-text-secondary">{t("notConfiguredText")}</p>
            <Button href="/resources/library" variant="outline" className="mt-5">
              <Library className="size-4" aria-hidden="true" /> {t("libraryCta")}
            </Button>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
