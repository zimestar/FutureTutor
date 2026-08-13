"use client";

import { useTransition } from "react";

export function RuleActiveToggle({
  ruleId,
  isActive,
  toggleAction,
}: {
  ruleId: string;
  isActive: boolean;
  toggleAction: (ruleId: string, isActive: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => toggleAction(ruleId, !isActive))}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        isActive ? "bg-success-light text-success" : "bg-neutral-100 text-neutral-600"
      }`}
    >
      {isActive ? "Active" : "Inactive"}
    </button>
  );
}
