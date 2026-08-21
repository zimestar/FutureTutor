"use client";

import { useTransition } from "react";
import { setTutorPayoutTierAction } from "@/lib/actions/pricingAdmin";
import { Select } from "@/components/ui/Input";

const TIERS = ["NEW", "VERIFIED", "SENIOR", "ELITE"] as const;
type Tier = (typeof TIERS)[number];

export function TutorPayoutTierSelect({
  tutorProfileId,
  currentTier,
  label,
  tierLabels,
}: {
  tutorProfileId: string;
  currentTier: Tier;
  label: string;
  tierLabels: Record<Tier, string>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 flex items-center gap-2">
      <label htmlFor="payoutTier" className="text-sm font-semibold text-navy">
        {label}
      </label>
      <Select
        id="payoutTier"
        defaultValue={currentTier}
        disabled={pending}
        onChange={(e) => {
          const formData = new FormData();
          formData.set("payoutTier", e.target.value);
          startTransition(() => setTutorPayoutTierAction(tutorProfileId, formData));
        }}
        className="h-9 text-sm"
        containerClassName="w-auto"
      >
        {TIERS.map((tier) => (
          <option key={tier} value={tier}>
            {tierLabels[tier]}
          </option>
        ))}
      </Select>
    </div>
  );
}
