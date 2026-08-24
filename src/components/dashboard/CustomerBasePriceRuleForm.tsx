"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveCustomerBasePriceRuleAction } from "@/lib/actions/pricingAdmin";

export interface RuleFormOption {
  id: string;
  label: string;
}

export function CustomerBasePriceRuleForm({
  ruleId,
  initial,
  subjects,
  levels,
}: {
  ruleId: string | null;
  initial?: {
    subjectId?: string | null;
    academicLevelId?: string | null;
    baseDurationMinutes: number;
    basePriceCents: number;
    currency: string;
    pricingVersion: string;
  };
  subjects: RuleFormOption[];
  levels: RuleFormOption[];
}) {
  const t = useTranslations("admin.pricing");
  const boundAction = saveCustomerBasePriceRuleAction.bind(null, ruleId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-4 md:grid-cols-6">
      {state?.error && <p className="col-span-full text-sm font-semibold text-error">{state.error}</p>}
      {state?.success && <p className="col-span-full text-sm font-semibold text-success">{t("saved")}</p>}
      <Select name="subjectId" defaultValue={initial?.subjectId ?? ""} containerClassName="col-span-2">
        <option value="">{t("anySubject")}</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </Select>
      <Select name="academicLevelId" defaultValue={initial?.academicLevelId ?? ""} containerClassName="col-span-2">
        <option value="">{t("anyLevel")}</option>
        {levels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </Select>
      <Input
        name="baseDurationMinutes"
        type="number"
        min={15}
        step={15}
        placeholder={t("duration")}
        defaultValue={initial?.baseDurationMinutes ?? 60}
        required
      />
      <Input
        name="basePriceCents"
        type="number"
        min={0}
        placeholder={t("priceCents")}
        defaultValue={initial?.basePriceCents ?? ""}
        required
      />
      <input type="hidden" name="currency" value={initial?.currency ?? "CAD"} />
      <Input
        name="pricingVersion"
        defaultValue={initial?.pricingVersion ?? "CUSTOMER_PRICING_V1"}
        className="col-span-2"
      />
      <Button type="submit" size="sm" disabled={pending} className="col-span-2">
        {ruleId ? t("save") : t("addRule")}
      </Button>
    </form>
  );
}
