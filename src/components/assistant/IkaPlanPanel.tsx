"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, Gift, Infinity as InfinityIcon, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { startIkaCheckoutAction, setIkaPlanCancellationAction } from "@/lib/actions/ika";
import { cn } from "@/lib/utils";

export type IkaPlanPanelProps = {
  locale: "fr" | "en";
  audience: "PARENT" | "TUTOR";
  freeRemaining: number;
  freeLimit: number;
  credits: number;
  bonusEarned: number;
  plan: { active: boolean; remaining: number; currentPeriodEnd: string; cancelAtPeriodEnd: boolean } | null;
  purchasesAvailable: boolean;
  packQuestions: number;
  packPrice: string;
  planPrice: string;
  planMonthlyQuestions: number;
  sessionBonus: number;
};

/** IKA-BILLING — what the user can still ask, and how to get more. */
export function IkaPlanPanel(props: IkaPlanPanelProps) {
  const t = useTranslations("assistant.plans");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const planActive = Boolean(props.plan?.active);
  const renewal = props.plan ? new Intl.DateTimeFormat(props.locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "long" }).format(new Date(props.plan.currentPeriodEnd)) : "";

  const buy = (kind: "pack" | "plan") =>
    startTransition(async () => {
      setError(null);
      const result = await startIkaCheckoutAction(kind, props.locale);
      if (result.url) window.location.assign(result.url);
      else setError(result.error === "ALREADY_SUBSCRIBED" ? t("errors.alreadySubscribed") : result.error === "UNAVAILABLE" ? t("errors.unavailable") : t("errors.failed"));
    });

  const toggleCancel = (cancel: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await setIkaPlanCancellationAction(cancel);
      if (result.ok) window.location.reload();
      else setError(t("errors.failed"));
    });

  const balances = [
    { icon: Sparkles, tone: "bg-mint-50 text-emerald-700", label: t("free"), value: t("freeValue", { count: props.freeRemaining, limit: props.freeLimit }) },
    { icon: Gift, tone: "bg-sun-50 text-[#a16207]", label: t("credits"), value: t("creditsValue", { count: props.credits }) },
    ...(props.plan
      ? [{ icon: InfinityIcon, tone: "bg-lilac-50 text-[#6d5bd0]", label: "Ika+", value: planActive ? t("planValue", { count: props.plan.remaining }) : t("planEnded") }]
      : []),
  ];

  return (
    <section id="ika-plans" aria-labelledby="ika-plans-title" className="scroll-mt-24 rounded-3xl border border-border bg-white p-5 shadow-(--shadow-card) sm:p-6">
      <h2 id="ika-plans-title" className="text-xl font-extrabold text-navy">{t("title")}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {balances.map(({ icon: Icon, tone, label, value }) => (
          <li key={label} className="flex items-center gap-3 rounded-2xl border border-border p-3">
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone)} aria-hidden="true"><Icon className="size-5" /></span>
            <span className="min-w-0">
              <span className="block text-xs font-bold uppercase tracking-[0.08em] text-text-muted">{label}</span>
              <span className="block font-extrabold text-navy">{value}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm leading-6 text-text-secondary">
        {props.audience === "TUTOR" ? t("bonusTutor", { count: props.sessionBonus }) : t("bonusParent", { count: props.sessionBonus })}
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="flex flex-col rounded-2xl bg-sun-50 p-4">
          <p className="flex items-center gap-2 font-extrabold text-navy"><Package className="size-5 text-[#a16207]" aria-hidden="true" />{t("packTitle", { count: props.packQuestions })}</p>
          <p className="mt-1 flex-1 text-sm leading-6 text-text-secondary">{t("packText")}</p>
          <Button type="button" className="mt-3 self-start" onClick={() => buy("pack")} disabled={pending || !props.purchasesAvailable} data-testid="ika-buy-pack">
            {t("packCta", { price: props.packPrice })}
          </Button>
        </div>
        <div className="flex flex-col rounded-2xl bg-lilac-50 p-4">
          <p className="flex items-center gap-2 font-extrabold text-navy"><InfinityIcon className="size-5 text-[#6d5bd0]" aria-hidden="true" />{t("planTitle")}</p>
          <p className="mt-1 flex-1 text-sm leading-6 text-text-secondary">{t("planText", { count: props.planMonthlyQuestions })}</p>
          {planActive ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-navy">
                <CalendarClock className="size-4" aria-hidden="true" />
                {props.plan?.cancelAtPeriodEnd ? t("planEnds", { date: renewal }) : t("planRenews", { date: renewal })}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => toggleCancel(!props.plan?.cancelAtPeriodEnd)} disabled={pending}>
                {props.plan?.cancelAtPeriodEnd ? t("planResume") : t("planCancel")}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="mt-3 self-start" onClick={() => buy("plan")} disabled={pending || !props.purchasesAvailable} data-testid="ika-buy-plan">
              {t("planCta", { price: props.planPrice })}
            </Button>
          )}
        </div>
      </div>
      {!props.purchasesAvailable && <p className="mt-3 text-sm font-semibold text-text-secondary">{t("unavailable")}</p>}
      {error && <p role="alert" className="mt-3 rounded-2xl bg-coral-50 px-4 py-3 text-sm font-semibold text-navy">{error}</p>}
      <p className="mt-3 text-xs leading-5 text-text-muted">{t("fineprint")}</p>
    </section>
  );
}
