"use client";

import { useActionState } from "react";
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

const FIELDS: { name: keyof MarketplacePricingSettingsValues; label: string }[] = [
  { name: "quoteTtlMinutes", label: "Quote TTL (minutes)" },
  { name: "urgencyShortNoticeThresholdHours", label: "Short-notice threshold (hours)" },
  { name: "urgencyShortNoticeAmountCents", label: "Short-notice surcharge (cents)" },
  { name: "urgencyUrgentThresholdHours", label: "Urgent threshold (hours)" },
  { name: "urgencyUrgentAmountCents", label: "Urgent surcharge (cents)" },
  { name: "lowSupplyThresholdCount", label: "Low-supply tutor count threshold" },
  { name: "lowSupplyAmountCents", label: "Low-supply surcharge (cents)" },
  { name: "tutorUrgencyBonusCents", label: "Tutor urgency bonus (cents)" },
  { name: "minimumGrossSpreadCents", label: "Minimum gross spread (cents)" },
];

export function MarketplacePricingSettingsForm({ values }: { values: MarketplacePricingSettingsValues }) {
  const [state, formAction, pending] = useActionState(saveMarketplacePricingSettingsAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-3">
      {state?.error && <p className="col-span-full text-sm font-semibold text-error">{state.error}</p>}
      {state?.success && <p className="col-span-full text-sm font-semibold text-success">Saved.</p>}
      {FIELDS.map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name} className="mb-1 block text-xs font-semibold text-slate">
            {field.label}
          </label>
          <Input id={field.name} name={field.name} type="number" defaultValue={values[field.name]} required />
        </div>
      ))}
      <div>
        <label htmlFor="configVersion" className="mb-1 block text-xs font-semibold text-slate">
          Config version
        </label>
        <Input id="configVersion" name="configVersion" defaultValue={values.configVersion} required />
      </div>
      <Button type="submit" size="sm" disabled={pending} className="sm:col-span-3">
        Save settings
      </Button>
    </form>
  );
}
