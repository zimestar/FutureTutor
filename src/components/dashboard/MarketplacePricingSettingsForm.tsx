"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveMarketplacePricingSettingsAction } from "@/lib/actions/pricingAdmin";

export interface MarketplacePricingSettingsValues {
  quoteTtlMinutes: number;
  urgencyShortNoticeThresholdHours: number;
  urgencyShortNoticeAmountCents: number;
  urgencyUrgentThresholdHours: number;
  urgencyUrgentAmountCents: number;
  lowSupplyThresholdCount: number;
  lowSupplyAmountCents: number;
  tutorUrgencyBonusCents: number;
  minimumGrossSpreadCents: number;
  configVersion: string;
}

const FIELDS: (keyof MarketplacePricingSettingsValues)[] = ["quoteTtlMinutes", "urgencyShortNoticeThresholdHours", "urgencyShortNoticeAmountCents", "urgencyUrgentThresholdHours", "urgencyUrgentAmountCents", "lowSupplyThresholdCount", "lowSupplyAmountCents", "tutorUrgencyBonusCents", "minimumGrossSpreadCents"];

export function MarketplacePricingSettingsForm({ values }: { values: MarketplacePricingSettingsValues }) {
  const t = useTranslations("admin.pricing");
  const [state, formAction, pending] = useActionState(saveMarketplacePricingSettingsAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-3">
      {state?.error && <p className="col-span-full text-sm font-semibold text-error">{state.error}</p>}
      {state?.success && <p className="col-span-full text-sm font-semibold text-success">{t("saved")}</p>}
      {FIELDS.map((field) => (
        <div key={field}>
          <label htmlFor={field} className="mb-1 block text-xs font-semibold text-slate">
            {t(`fields.${field}`)}
          </label>
          <Input id={field} name={field} type="number" defaultValue={values[field]} required />
        </div>
      ))}
      <div>
        <label htmlFor="configVersion" className="mb-1 block text-xs font-semibold text-slate">
          {t("configVersion")}
        </label>
        <Input id="configVersion" name="configVersion" defaultValue={values.configVersion} required />
      </div>
      <Button type="submit" size="sm" disabled={pending} className="sm:col-span-3">
        {t("saveSettings")}
      </Button>
    </form>
  );
}
