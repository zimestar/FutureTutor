import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { RuleActiveToggle } from "@/components/dashboard/RuleActiveToggle";
import { CustomerBasePriceRuleForm } from "@/components/dashboard/CustomerBasePriceRuleForm";
import { TutorBasePayoutRuleForm } from "@/components/dashboard/TutorBasePayoutRuleForm";
import { MarketplacePricingSettingsForm } from "@/components/dashboard/MarketplacePricingSettingsForm";
import { setCustomerBasePriceRuleActiveAction, setTutorBasePayoutRuleActiveAction } from "@/lib/actions/pricingAdmin";
import { adminNavItems } from "@/lib/adminNav";

export default async function AdminPricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    redirect({ href: "/login", locale });
    return;
  }

  const tNav = await getTranslations({ locale, namespace: "dashboard.nav" });
  const tSubjects = await getTranslations({ locale, namespace: "subjects.items" });
  const tLevels = await getTranslations({ locale, namespace: "gradeLevels" });
  const t = await getTranslations({ locale, namespace: "admin.pricing" });
  const tStatus = await getTranslations({ locale, namespace: "admin.statuses" });

  const [priceRules, payoutRules, settings, subjects, levels] = await Promise.all([
    db.customerBasePriceRule.findMany({
      include: { subject: { select: { slug: true } }, academicLevel: { select: { slug: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.tutorBasePayoutRule.findMany({
      include: { subject: { select: { slug: true } }, academicLevel: { select: { slug: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.marketplacePricingSettings.findFirst(),
    db.subject.findMany({ orderBy: { sortOrder: "asc" } }),
    db.academicLevel.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const subjectOptions = subjects.map((s) => ({ id: s.id, label: tSubjects(s.slug) }));
  const levelOptions = levels.map((l) => ({ id: l.id, label: tLevels(l.slug) }));

  return (
    <DashboardShell navItems={adminNavItems(tNav)} userName={user.name ?? ""}>
      <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
      <p className="mt-2 max-w-2xl text-slate">
        {t("description")}
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("customerRules")}</h2>
        <div className="flex flex-col gap-3">
          {priceRules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-navy">
                  {rule.subject ? tSubjects(rule.subject.slug) : t("anySubject")} ·{" "}
                  {rule.academicLevel ? tLevels(rule.academicLevel.slug) : t("anyLevel")}
                </span>
                <RuleActiveToggle
                  ruleId={rule.id}
                  isActive={rule.isActive}
                  toggleAction={setCustomerBasePriceRuleActiveAction}
                />
                <span className="text-xs text-slate">
                  {rule.baseDurationMinutes}min · {(rule.basePriceCents / 100).toFixed(2)} {rule.currency} ·{" "}
                  {rule.pricingVersion}
                </span>
              </div>
              <CustomerBasePriceRuleForm
                ruleId={rule.id}
                initial={{
                  subjectId: rule.subjectId,
                  academicLevelId: rule.academicLevelId,
                  baseDurationMinutes: rule.baseDurationMinutes,
                  basePriceCents: rule.basePriceCents,
                  currency: rule.currency,
                  pricingVersion: rule.pricingVersion,
                }}
                subjects={subjectOptions}
                levels={levelOptions}
              />
            </div>
          ))}
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-navy">{t("addNewRule")}</p>
          <CustomerBasePriceRuleForm ruleId={null} subjects={subjectOptions} levels={levelOptions} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold text-navy">{t("tutorRules")}</h2>
        <div className="flex flex-col gap-3">
          {payoutRules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-navy">
                  {tStatus(rule.tutorTier)} · {rule.subject ? tSubjects(rule.subject.slug) : t("anySubject")} ·{" "}
                  {rule.academicLevel ? tLevels(rule.academicLevel.slug) : t("anyLevel")}
                </span>
                <RuleActiveToggle
                  ruleId={rule.id}
                  isActive={rule.isActive}
                  toggleAction={setTutorBasePayoutRuleActiveAction}
                />
                <span className="text-xs text-slate">
                  {rule.baseDurationMinutes}min · {(rule.payoutCents / 100).toFixed(2)} {rule.currency} ·{" "}
                  {rule.payoutVersion}
                </span>
              </div>
              <TutorBasePayoutRuleForm
                ruleId={rule.id}
                initial={{
                  tutorTier: rule.tutorTier,
                  subjectId: rule.subjectId,
                  academicLevelId: rule.academicLevelId,
                  baseDurationMinutes: rule.baseDurationMinutes,
                  payoutCents: rule.payoutCents,
                  currency: rule.currency,
                  payoutVersion: rule.payoutVersion,
                }}
                subjects={subjectOptions}
                levels={levelOptions}
              />
            </div>
          ))}
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-navy">{t("addNewRule")}</p>
          <TutorBasePayoutRuleForm ruleId={null} subjects={subjectOptions} levels={levelOptions} />
        </div>
      </section>

      {settings && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold text-navy">{t("marketplaceSettings")}</h2>
          <MarketplacePricingSettingsForm
            values={{
              quoteTtlMinutes: settings.quoteTtlMinutes,
              urgencyShortNoticeThresholdHours: settings.urgencyShortNoticeThresholdHours,
              urgencyShortNoticeAmountCents: settings.urgencyShortNoticeAmountCents,
              urgencyUrgentThresholdHours: settings.urgencyUrgentThresholdHours,
              urgencyUrgentAmountCents: settings.urgencyUrgentAmountCents,
              lowSupplyThresholdCount: settings.lowSupplyThresholdCount,
              lowSupplyAmountCents: settings.lowSupplyAmountCents,
              tutorUrgencyBonusCents: settings.tutorUrgencyBonusCents,
              minimumGrossSpreadCents: settings.minimumGrossSpreadCents,
              configVersion: settings.configVersion,
            }}
          />
        </section>
      )}
    </DashboardShell>
  );
}
