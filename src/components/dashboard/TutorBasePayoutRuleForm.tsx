"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveTutorBasePayoutRuleAction } from "@/lib/actions/pricingAdmin";
import type { RuleFormOption } from "@/components/dashboard/CustomerBasePriceRuleForm";

const TIERS = ["NEW", "VERIFIED", "SENIOR", "ELITE"] as const;

export function TutorBasePayoutRuleForm({
  ruleId,
  initial,
  subjects,
  levels,
}: {
  ruleId: string | null;
  initial?: {
    tutorTier: (typeof TIERS)[number];
    subjectId?: string | null;
    academicLevelId?: string | null;
    baseDurationMinutes: number;
    payoutCents: number;
    currency: string;
    payoutVersion: string;
  };
  subjects: RuleFormOption[];
  levels: RuleFormOption[];
}) {
  const t = useTranslations("admin.pricing");
  const tStatus = useTranslations("admin.statuses");
  const boundAction = saveTutorBasePayoutRuleAction.bind(null, ruleId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-4 md:grid-cols-7">
      {state?.error && <p className="col-span-full text-sm font-semibold text-error">{state.error}</p>}
      {state?.success && <p className="col-span-full text-sm font-semibold text-success">{t("saved")}</p>}
      <Select name="tutorTier" defaultValue={initial?.tutorTier ?? "NEW"}>
        {TIERS.map((tier) => (
          <option key={tier} value={tier}>
            {tStatus(tier)}
          </option>
        ))}
      </Select>
      <Select name="subjectId" defaultValue={initial?.subjectId ?? ""}>
        <option value="">{t("anySubject")}</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </Select>
      <Select name="academicLevelId" defaultValue={initial?.academicLevelId ?? ""}>
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
        name="payoutCents"
        type="number"
        min={0}
        placeholder={t("payoutCents")}
        defaultValue={initial?.payoutCents ?? ""}
        required
      />
      <input type="hidden" name="currency" value={initial?.currency ?? "CAD"} />
      <Input name="payoutVersion" defaultValue={initial?.payoutVersion ?? "TUTOR_PAYOUT_V1"} />
      <Button type="submit" size="sm" disabled={pending}>
        {ruleId ? t("save") : t("addRule")}
      </Button>
    </form>
  );
}
