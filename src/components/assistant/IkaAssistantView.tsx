import { getTranslations } from "next-intl/server";
import { CheckCircle2, Library } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { AssistantChat } from "@/components/dashboard/AssistantChat";
import { IkaAvatar } from "@/components/assistant/IkaAvatar";
import { IkaPlanPanel } from "@/components/assistant/IkaPlanPanel";
import { Button } from "@/components/ui/Button";
import { IKA_PACK, IKA_PARENT_SESSION_BONUS, IKA_PLAN, IKA_TUTOR_SESSION_BONUS, isAssistantConfigured, type AssistantAudience } from "@/lib/assistant/config";
import { getIkaAllowance } from "@/services/assistantQuota";
import { fulfillIkaCheckout, ikaPurchasesAvailable, refreshIkaPlanIfStale } from "@/services/ikaBilling";

/**
 * Ika page body, shared by the parent (/dashboard/assistant) and tutor
 * (/tutor/assistant) spaces. Returning from Stripe Checkout, the purchase is
 * fulfilled here immediately (idempotent; the webhook does the same).
 */
export async function IkaAssistantView({
  locale,
  userId,
  audience,
  checkoutSessionId,
}: {
  locale: "fr" | "en";
  userId: string;
  audience: AssistantAudience;
  checkoutSessionId?: string;
}) {
  const t = await getTranslations({ locale, namespace: "assistant" });
  const tx = (key: "title" | "description") => (audience === "TUTOR" ? t(`tutor.${key}`) : t(key));
  const money = (cents: number) => new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);

  const hero = (
    <DashboardHero
      tone="lilac"
      headingId="assistant-heading"
      title={tx("title")}
      description={tx("description")}
      badge={<span className="inline-flex items-center gap-1.5 rounded-full bg-white py-0.5 pl-1 pr-3 text-xs font-bold text-navy"><IkaAvatar className="size-6" />{t("badge")}</span>}
    />
  );

  if (!isAssistantConfigured()) {
    return (
      <>
        {hero}
        <div className="mx-auto mt-6 max-w-4xl rounded-3xl border-2 border-dashed border-lilac-100 bg-white p-8 text-center">
          <p className="text-xl font-extrabold text-navy">{t("notConfiguredTitle")}</p>
          <p className="mx-auto mt-2 max-w-lg leading-7 text-text-secondary">{t("notConfiguredText")}</p>
          <Button href="/resources/library" variant="outline" className="mt-5">
            <Library className="size-4" aria-hidden="true" /> {t("libraryCta")}
          </Button>
        </div>
      </>
    );
  }

  let purchased: "PACK" | "PLAN" | null = null;
  if (checkoutSessionId && /^cs_[A-Za-z0-9_]+$/.test(checkoutSessionId)) {
    try {
      const outcome = await fulfillIkaCheckout(checkoutSessionId, userId);
      if (outcome === "PACK" || outcome === "PLAN") purchased = outcome;
    } catch (error) {
      console.error("[ika-billing] checkout return failed", error instanceof Error ? error.message : error);
    }
  }
  await refreshIkaPlanIfStale(userId);
  const allowance = await getIkaAllowance(userId, audience);
  const sessionBonus = audience === "TUTOR" ? IKA_TUTOR_SESSION_BONUS : IKA_PARENT_SESSION_BONUS;

  return (
    <>
      {hero}
      <div className="mx-auto mt-6 flex max-w-4xl flex-col gap-6">
        {purchased && (
          <p role="status" className="flex items-center gap-2 rounded-2xl border border-mint-100 bg-mint-50 px-4 py-3 font-semibold text-emerald-800">
            <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
            {purchased === "PACK" ? t("plans.thanksPack", { count: IKA_PACK.questions }) : t("plans.thanksPlan")}
          </p>
        )}
        <AssistantChat locale={locale} audience={audience} initialRemaining={allowance.total} />
        <IkaPlanPanel
          locale={locale}
          audience={audience}
          freeRemaining={allowance.freeRemaining}
          freeLimit={allowance.freeLimit}
          credits={allowance.credits}
          bonusEarned={allowance.bonusEarned}
          plan={allowance.plan && { ...allowance.plan, currentPeriodEnd: allowance.plan.currentPeriodEnd.toISOString() }}
          purchasesAvailable={ikaPurchasesAvailable()}
          packQuestions={IKA_PACK.questions}
          packPrice={money(IKA_PACK.amountCents)}
          planPrice={money(IKA_PLAN.amountCents)}
          planMonthlyQuestions={IKA_PLAN.monthlyQuestions}
          sessionBonus={sessionBonus}
        />
      </div>
    </>
  );
}
